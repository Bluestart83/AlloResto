"""
sipbridge.py — Bibliothèque SIP Bridge (Twilio-compatible)

Pont SIP ↔ WebSocket générique. Expose le même protocole que Twilio Media
Streams (events start/media/stop/clear/mark) et une API REST pour piloter
les appels.

La configuration est 100% externe (injectée via BridgeConfig).

Usage :
    from sipbridge import SipBridge, BridgeConfig, SipConfig, ...

    config = BridgeConfig(
        sip=SipConfig(domain="sip.example.com", username="user", password="pass"),
        custom_params={"restaurantId": "pizza-napoli"},
    )
    bridge = SipBridge(config)
    asyncio.run(bridge.run())
"""

import json
import asyncio
import base64
import struct
import uuid
import signal
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import httpx

logger = logging.getLogger("sip-bridge")


# ============================================================
# CONFIGURATION — Dataclasses pures (pas d'os.getenv)
# ============================================================

@dataclass
class SipConfig:
    """Config SIP — credentials et enregistrement."""
    domain: str = "sip.twilio.com"
    username: str = ""
    password: str = ""
    port: int = 0               # 0 = auto
    transport: str = "udp"      # udp | tcp | tls
    reg_timeout: int = 300      # secondes


@dataclass
class NatConfig:
    """Config NAT traversal — STUN / TURN / ICE."""
    stun_server: str = ""
    turn_server: str = ""
    turn_username: str = ""
    turn_password: str = ""
    ice_enabled: bool = True
    udp_ka_interval_sec: int = 15   # keepalive UDP pour maintenir le NAT (0 = désactivé)


@dataclass
class AudioConfig:
    """Config audio — codecs, qualité, traitement."""
    codec_priority: list = field(default_factory=lambda: [
        ("PCMU/8000", 255),
        ("PCMA/8000", 254),
        ("opus/48000", 0),
        ("speex/16000", 0),
        ("speex/8000", 0),
        ("iLBC/8000", 0),
        ("GSM/8000", 0),
    ])
    clock_rate: int = 8000
    channel_count: int = 1
    bits_per_sample: int = 16
    frame_ms: int = 20
    ec_enabled: bool = True
    ec_tail_ms: int = 200
    vad_enabled: bool = False
    rx_gain: float = 0.0
    tx_gain: float = 0.0

    @property
    def samples_per_frame(self) -> int:
        return self.clock_rate * self.frame_ms // 1000

    @property
    def bytes_per_frame(self) -> int:
        return self.samples_per_frame * (self.bits_per_sample // 8)


@dataclass
class CallbackConfig:
    """Config des callbacks HTTP (status updates)."""
    status_callback_url: str = ""
    incoming_callback_url: str = ""
    callback_method: str = "POST"
    callback_timeout: float = 5.0
    status_callback_events: list = field(default_factory=lambda: [
        "initiated", "ringing", "answered", "completed",
    ])


@dataclass
class BridgeConfig:
    """Config globale du bridge SIP."""
    sip: SipConfig = field(default_factory=SipConfig)
    nat: NatConfig = field(default_factory=NatConfig)
    audio: AudioConfig = field(default_factory=AudioConfig)
    callbacks: CallbackConfig = field(default_factory=CallbackConfig)
    # WebSocket cible (le serveur qui traite l'audio, ex: OpenAI proxy)
    ws_target: str = "ws://localhost:5050/media-stream"
    # Port de l'API REST
    api_port: int = 5060
    # Paramètres custom passés dans chaque WebSocket "start" event
    # (équivalent Twilio customParameters — clé-valeur libre)
    custom_params: dict = field(default_factory=dict)
    # Comportement
    auto_answer: bool = True
    max_call_duration: int = 600        # secondes, 0 = illimité
    max_concurrent_calls: int = 10


# ============================================================
# µ-LAW CODEC
# ============================================================

try:
    import audioop

    def pcm16_to_ulaw(pcm: bytes) -> bytes:
        return audioop.lin2ulaw(pcm, 2)

    def ulaw_to_pcm16(data: bytes) -> bytes:
        return audioop.ulaw2lin(data, 2)

    logger.info("Codec µ-law : audioop (C natif)")

except ImportError:
    _BIAS = 0x84
    _CLIP = 32635
    _EXP_LUT = [0, 132, 396, 924, 1980, 4092, 8316, 16764]

    def _enc(s: int) -> int:
        sign = 0x80 if s < 0 else 0
        s = min(abs(s), _CLIP) + _BIAS
        exp = 7
        for i in range(7, 0, -1):
            if s >= (1 << (i + 3)):
                exp = i
                break
        else:
            exp = 0
        return ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0F)) & 0xFF

    def _dec(b: int) -> int:
        b = ~b & 0xFF
        sign = b & 0x80
        exp = (b >> 4) & 0x07
        sample = _EXP_LUT[exp] + ((b & 0x0F) << (exp + 3))
        return -sample if sign else sample

    def pcm16_to_ulaw(pcm: bytes) -> bytes:
        return bytes(_enc(s) for s in struct.unpack(f"<{len(pcm)//2}h", pcm))

    def ulaw_to_pcm16(data: bytes) -> bytes:
        return struct.pack(f"<{len(data)}h", *[_dec(b) for b in data])

    logger.info("Codec µ-law : fallback Python pur")


# ============================================================
# PJSIP — Import conditionnel
# ============================================================

try:
    import pjsua2 as pj
    HAS_PJSIP = True
except ImportError:
    HAS_PJSIP = False
    logger.error("pjsua2 non disponible ! Voir sip-service/README.md")

try:
    import websockets
except ImportError:
    raise ImportError("pip install websockets")


# ============================================================
# CALL STATUS
# ============================================================

class CallStatus(str, Enum):
    INITIATED = "initiated"
    RINGING = "ringing"
    ANSWERED = "answered"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    BUSY = "busy"
    NO_ANSWER = "no-answer"
    CANCELLED = "cancelled"
    TRANSFERRED = "transferred"


class CallDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"


# Country code derived from the SIP trunk number at bridge startup.
# Set by SipBridge.__init__ — used by _normalize_number for local numbers.
_trunk_country_code: str = ""

# Known country calling codes (1, 2, or 3 digits after +)
_COUNTRY_CODES = {
    "1", "7",  # 1-digit
    "20", "27", "30", "31", "32", "33", "34", "36", "39",
    "40", "41", "43", "44", "45", "46", "47", "48", "49",
    "51", "52", "53", "54", "55", "56", "57", "58",
    "60", "61", "62", "63", "64", "65", "66",
    "81", "82", "84", "86", "90", "91", "92", "93", "94", "95",
    "212", "213", "216", "218", "220", "221", "222", "223",
    "224", "225", "226", "227", "228", "229",
    "230", "231", "232", "233", "234", "235", "236", "237",
    "238", "239", "240", "241", "242", "243", "244", "245",
    "246", "247", "248", "249", "250", "251", "252", "253",
    "254", "255", "256", "257", "258", "260", "261", "262",
    "263", "264", "265", "266", "267", "268", "269",
    "290", "291", "297", "298", "299",
    "350", "351", "352", "353", "354", "355", "356", "357",
    "358", "359", "370", "371", "372", "373", "374", "375",
    "376", "377", "378", "380", "381", "382", "385", "386",
    "387", "389",
    "420", "421", "423",
    "500", "501", "502", "503", "504", "505", "506", "507",
    "508", "509", "590", "591", "592", "593", "594", "595",
    "596", "597", "598", "599",
    "670", "672", "673", "674", "675", "676", "677", "678",
    "679", "680", "681", "682", "683", "685", "686", "687",
    "688", "689", "690", "691", "692",
    "850", "852", "853", "855", "856",
    "880", "886",
    "960", "961", "962", "963", "964", "965", "966", "967",
    "968", "970", "971", "972", "973", "974", "975", "976",
    "977", "992", "993", "994", "995", "996", "998",
}


def _derive_country_code(trunk_number: str) -> str:
    """Extract country calling code from a normalized E.164 trunk number."""
    if not trunk_number.startswith("+"):
        return ""
    digits = trunk_number[1:]
    # Try 3-digit, 2-digit, 1-digit codes
    for length in (3, 2, 1):
        candidate = digits[:length]
        if candidate in _COUNTRY_CODES:
            return "+" + candidate
    return ""


def _normalize_number(number: str) -> str:
    """Normalize phone number to E.164 format.

    - Already +XX → as-is
    - 00XX... → +XX...
    - 0X... → +CC X... (using trunk country code)
    """
    if not number or number.startswith("+"):
        return number
    if number.startswith("00"):
        return "+" + number[2:]
    if number.startswith("0") and _trunk_country_code:
        return _trunk_country_code + number[1:]
    return number


@dataclass
class CallRecord:
    """Suivi d'un appel (compatible Twilio)."""
    sid: str
    direction: CallDirection
    from_number: str
    to_number: str
    status: CallStatus
    created_at: str
    custom_params: dict = field(default_factory=dict)
    answered_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_sec: int = 0
    ws_target: str = ""
    callback_url: str = ""
    _call_ref: Any = field(default=None, repr=False)

    def __post_init__(self):
        self.from_number = _normalize_number(self.from_number)
        self.to_number = _normalize_number(self.to_number)

    def to_dict(self) -> dict:
        d = {
            "sid": self.sid,
            "direction": self.direction.value,
            "from": self.from_number,
            "to": self.to_number,
            "status": self.status.value,
            "createdAt": self.created_at,
            "answeredAt": self.answered_at,
            "endedAt": self.ended_at,
            "durationSec": self.duration_sec,
            "customParams": self.custom_params,
        }
        return d


# ============================================================
# SIP BRIDGE — Classe principale
# ============================================================

class SipBridge:
    """
    Bridge SIP ↔ WebSocket générique (compatible Twilio Media Streams).

    Toute la configuration est injectée via BridgeConfig.
    Aucune logique applicative (restaurant, etc.) — juste du transport.
    """

    def __init__(self, config: BridgeConfig):
        self.config = config
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._endpoint: Optional[Any] = None
        self._account: Optional[Any] = None
        self._sip_registered: bool = False  # cached state, updated from pjsip thread
        self._executor = ThreadPoolExecutor(max_workers=2)
        self.active_calls: dict[str, CallRecord] = {}

        # Derive trunk country code for local number normalization
        global _trunk_country_code
        trunk_e164 = _normalize_number(config.sip.username)
        _trunk_country_code = _derive_country_code(trunk_e164)
        if _trunk_country_code:
            logger.info(f"Trunk country code: {_trunk_country_code} (from {trunk_e164})")

        self.app = self._create_app()

    # ── Callbacks HTTP ─────────────────────────────────────

    async def fire_callback(self, call: CallRecord, event: str):
        url = call.callback_url or self.config.callbacks.status_callback_url
        if not url:
            return
        if event not in self.config.callbacks.status_callback_events:
            return

        payload = {
            **call.to_dict(),
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            async with httpx.AsyncClient(
                timeout=self.config.callbacks.callback_timeout
            ) as client:
                if self.config.callbacks.callback_method.upper() == "GET":
                    await client.get(url, params=payload)
                else:
                    await client.post(url, json=payload)
            logger.debug(f"Callback {event} → {url}")
        except Exception as e:
            logger.warning(f"Callback {event} échoué ({url}): {e}")

    async def fire_incoming_callback(self, caller: str, callee: str) -> dict:
        url = self.config.callbacks.incoming_callback_url
        if not url:
            return {"action": "accept"}

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, json={
                    "from": caller,
                    "to": callee,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning(f"Incoming callback échoué ({url}): {e}")
            return {"action": "accept"}

    # ── PJSIP lifecycle ────────────────────────────────────

    def pjsip_init(self):
        if not HAS_PJSIP:
            raise RuntimeError("pjsua2 non disponible")

        cfg = self.config
        self._endpoint = pj.Endpoint()
        self._endpoint.libCreate()

        ep_cfg = pj.EpConfig()
        ep_cfg.logConfig.level = 3
        ep_cfg.logConfig.consoleLevel = 3

        if cfg.nat.stun_server:
            ep_cfg.uaConfig.stunServer.append(cfg.nat.stun_server)
        elif cfg.nat.turn_server:
            ep_cfg.uaConfig.stunServer.append(cfg.nat.turn_server)

        self._endpoint.libInit(ep_cfg)

        tp_cfg = pj.TransportConfig()
        tp_cfg.port = cfg.sip.port

        if cfg.sip.transport == "tcp":
            self._endpoint.transportCreate(pj.PJSIP_TRANSPORT_TCP, tp_cfg)
        elif cfg.sip.transport == "tls":
            self._endpoint.transportCreate(pj.PJSIP_TRANSPORT_TLS, tp_cfg)
        else:
            self._endpoint.transportCreate(pj.PJSIP_TRANSPORT_UDP, tp_cfg)

        self._endpoint.libStart()
        logger.info("PJSIP endpoint started")

        for codec, priority in cfg.audio.codec_priority:
            try:
                self._endpoint.codecSetPriority(codec, priority)
            except Exception:
                pass

        mc = self._endpoint.audDevManager()
        if cfg.audio.ec_enabled:
            try:
                mc.setEcOptions(cfg.audio.ec_tail_ms, 0)
            except Exception:
                pass

        acc_cfg = pj.AccountConfig()
        acc_cfg.idUri = f"sip:{cfg.sip.username}@{cfg.sip.domain}"
        acc_cfg.regConfig.registrarUri = f"sip:{cfg.sip.domain}"
        acc_cfg.regConfig.timeoutSec = cfg.sip.reg_timeout

        cred = pj.AuthCredInfo()
        cred.scheme = "digest"
        cred.realm = "*"
        cred.username = cfg.sip.username
        cred.data = cfg.sip.password
        cred.dataType = 0
        acc_cfg.sipConfig.authCreds.append(cred)

        acc_cfg.natConfig.iceEnabled = cfg.nat.ice_enabled
        # UDP keepalive pour maintenir le mapping NAT
        if cfg.nat.udp_ka_interval_sec > 0:
            acc_cfg.natConfig.udpKaIntervalSec = cfg.nat.udp_ka_interval_sec
        if cfg.nat.turn_server:
            acc_cfg.natConfig.turnEnabled = True
            acc_cfg.natConfig.turnServer = cfg.nat.turn_server
            acc_cfg.natConfig.turnUserName = cfg.nat.turn_username
            acc_cfg.natConfig.turnPassword = cfg.nat.turn_password
            acc_cfg.natConfig.turnConnType = pj.PJ_TURN_TP_UDP

        self._account = _SipAccountHandler(self)
        self._account.create(acc_cfg)
        logger.info(f"SIP account created: {cfg.sip.username}@{cfg.sip.domain}")
        logger.info(f"SIP registering to {cfg.sip.domain}...")

    def pjsip_shutdown(self):
        if self._endpoint:
            self._endpoint.libDestroy()
            self._endpoint = None
            logger.info("PJSIP arrêté")

    _registered_thread_ids: set = set()

    def pjsip_poll(self):
        if self._endpoint:
            tid = threading.get_ident()
            if tid not in self._registered_thread_ids:
                try:
                    self._endpoint.libRegisterThread(f"poll-{tid}")
                    self._registered_thread_ids.add(tid)
                    logger.debug(f"pjsip_poll: thread {tid} registered")
                except Exception as e:
                    logger.warning(f"pjsip_poll: libRegisterThread {tid} failed: {e}")
            self._endpoint.libHandleEvents(10)

    # ── FastAPI ────────────────────────────────────────────

    def _create_app(self) -> FastAPI:
        bridge = self

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            yield
            # pjsip cleanup handled in run() finally block — NOT here
            # (calling pjlib from asyncio thread triggers assertion failure)

        app = FastAPI(title="SIP Bridge", lifespan=lifespan)

        @app.get("/health")
        async def health():
            return {
                "status": "ok",
                "sip_registered": bridge._sip_registered,
                "sip_account": f"{bridge.config.sip.username}@{bridge.config.sip.domain}",
                "ws_target": bridge.config.ws_target,
                "active_calls": len([
                    r for r in bridge.active_calls.values()
                    if r.status in (CallStatus.ACTIVE, CallStatus.ANSWERED, CallStatus.RINGING)
                ]),
                "max_concurrent_calls": bridge.config.max_concurrent_calls,
                "audio": {
                    "codec": bridge.config.audio.codec_priority[0][0],
                    "clock_rate": bridge.config.audio.clock_rate,
                    "frame_ms": bridge.config.audio.frame_ms,
                    "ec_enabled": bridge.config.audio.ec_enabled,
                    "vad_enabled": bridge.config.audio.vad_enabled,
                },
            }

        @app.get("/api/calls")
        async def list_calls():
            return [r.to_dict() for r in bridge.active_calls.values()]

        @app.post("/api/calls")
        async def make_call(req: _MakeCallRequest):
            if not HAS_PJSIP or not bridge._account:
                raise HTTPException(503, "PJSIP non initialisé")

            active_count = sum(
                1 for r in bridge.active_calls.values()
                if r.status in (CallStatus.ACTIVE, CallStatus.ANSWERED, CallStatus.RINGING)
            )
            if active_count >= bridge.config.max_concurrent_calls:
                raise HTTPException(429, f"Max appels simultanés atteint ({bridge.config.max_concurrent_calls})")

            to_uri = req.to
            if not to_uri.startswith("sip:"):
                to_uri = f"sip:{req.to}@{bridge.config.sip.domain}"

            # Merge : config defaults + per-call override
            merged_params = {**bridge.config.custom_params, **(req.custom_params or {})}

            def do_call():
                call = _SipCallHandler(
                    bridge,
                    bridge._account,
                    direction=CallDirection.OUTBOUND,
                    custom_params=merged_params,
                    ws_target=req.ws_target,
                    callback_url=req.callback_url,
                    to_number=req.to,
                )

                record = CallRecord(
                    sid=call.call_sid,
                    direction=CallDirection.OUTBOUND,
                    from_number=req.from_number or bridge.config.sip.username,
                    to_number=req.to,
                    status=CallStatus.INITIATED,
                    custom_params=merged_params,
                    created_at=datetime.now(timezone.utc).isoformat(),
                    ws_target=req.ws_target or bridge.config.ws_target,
                    callback_url=req.callback_url,
                    _call_ref=call,
                )
                bridge.active_calls[call.call_sid] = record

                prm = pj.CallOpParam()
                prm.opt.audioCount = 1
                prm.opt.videoCount = 0
                call.makeCall(to_uri, prm)

                return record.to_dict()

            try:
                result = await bridge.loop.run_in_executor(bridge._executor, do_call)
                record = bridge.active_calls.get(result["sid"])
                if record:
                    await bridge.fire_callback(record, "initiated")
                return JSONResponse(result, status_code=201)
            except Exception as e:
                logger.error(f"Erreur appel sortant: {e}")
                raise HTTPException(500, str(e))

        @app.delete("/api/calls/{call_sid}")
        async def hangup_call(call_sid: str):
            record = bridge.active_calls.get(call_sid)
            if not record:
                raise HTTPException(404, "Appel non trouvé")

            call_ref = record._call_ref
            if call_ref and record.status not in (CallStatus.COMPLETED, CallStatus.FAILED):
                def do_hangup():
                    try:
                        prm = pj.CallOpParam()
                        prm.statusCode = 200
                        call_ref.hangup(prm)
                    except Exception as e:
                        logger.error(f"Erreur hangup: {e}")

                await bridge.loop.run_in_executor(bridge._executor, do_hangup)
                record.status = CallStatus.CANCELLED
                return {"status": "cancelled", "sid": call_sid}

            return {"status": record.status.value, "sid": call_sid}

        @app.post("/api/calls/{call_sid}/transfer")
        async def transfer_call(call_sid: str, req: _TransferCallRequest):
            """Transfert aveugle (SIP REFER) vers la destination."""
            record = bridge.active_calls.get(call_sid)
            if not record:
                raise HTTPException(404, "Appel non trouvé")

            if record.status not in (CallStatus.ACTIVE, CallStatus.ANSWERED):
                raise HTTPException(400, f"Appel non actif (status={record.status.value})")

            call_ref = record._call_ref
            if not call_ref:
                raise HTTPException(400, "Référence appel perdue")

            dest = req.destination
            if not dest.startswith("sip:") and not dest.startswith("tel:"):
                dest = f"sip:{dest}@{bridge.config.sip.domain}"

            def do_transfer():
                try:
                    prm = pj.CallOpParam()
                    call_ref.xferCall(dest, prm)
                    logger.info(f"[{call_sid[:8]}] Blind transfer (REFER) vers {dest}")
                except Exception as e:
                    logger.error(f"[{call_sid[:8]}] Erreur transfer: {e}")
                    raise

            try:
                await bridge.loop.run_in_executor(bridge._executor, do_transfer)
                record.status = CallStatus.TRANSFERRED
                return {"status": "transferred", "sid": call_sid, "destination": dest}
            except Exception as e:
                raise HTTPException(500, f"Transfer echoue: {e}")

        return app

    # ── Run ────────────────────────────────────────────────

    async def run(self):
        self.loop = asyncio.get_event_loop()

        # Init PJSIP
        await self.loop.run_in_executor(self._executor, self.pjsip_init)

        # Register the asyncio/main thread with pjsip so that Python's GC
        # can safely destroy pjsip objects (AudioMediaPort etc.) from this
        # thread without triggering pj_thread_this() assertion crash.
        try:
            tid = threading.get_ident()
            self._endpoint.libRegisterThread(f"asyncio-{tid}")
            self._registered_thread_ids.add(tid)
            logger.info(f"Asyncio main thread {tid} registered with pjsip (GC-safe)")
        except Exception as e:
            logger.warning(f"Failed to register asyncio thread with pjsip: {e}")

        # Banner
        cfg = self.config
        logger.info("=" * 65)
        logger.info("  SIP Bridge (Twilio-compatible)")
        logger.info("=" * 65)
        logger.info(f"  SIP       : {cfg.sip.username}@{cfg.sip.domain}")
        logger.info(f"  Transport : {cfg.sip.transport.upper()}")
        logger.info(f"  WS target : {cfg.ws_target}")
        logger.info(f"  API REST  : http://0.0.0.0:{cfg.api_port}")
        logger.info(f"  Codec     : {cfg.audio.codec_priority[0][0]}")
        logger.info(f"  EC        : {'ON' if cfg.audio.ec_enabled else 'OFF'} ({cfg.audio.ec_tail_ms}ms)")
        logger.info(f"  Max calls : {cfg.max_concurrent_calls}")
        if cfg.custom_params:
            logger.info(f"  Params    : {cfg.custom_params}")
        if cfg.nat.turn_server:
            logger.info(f"  TURN      : {cfg.nat.turn_server}")
        if cfg.callbacks.status_callback_url:
            logger.info(f"  Status CB : {cfg.callbacks.status_callback_url}")
        if cfg.callbacks.incoming_callback_url:
            logger.info(f"  Incoming CB: {cfg.callbacks.incoming_callback_url}")
        logger.info("=" * 65)

        import uvicorn

        uvi_config = uvicorn.Config(
            self.app, host="0.0.0.0", port=cfg.api_port,
            log_level="info", access_log=False,
        )
        server = uvicorn.Server(uvi_config)

        stop_event = asyncio.Event()

        def signal_handler():
            stop_event.set()
            server.should_exit = True

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                self.loop.add_signal_handler(sig, signal_handler)
            except NotImplementedError:
                pass

        async def pjsip_poll_loop():
            while not stop_event.is_set():
                await self.loop.run_in_executor(self._executor, self.pjsip_poll)
                await asyncio.sleep(0.005)

        async def api_server():
            await server.serve()

        try:
            await asyncio.gather(pjsip_poll_loop(), api_server())
        except asyncio.CancelledError:
            pass
        finally:
            import os
            # NOTE: do NOT import threading here — it shadows the module-level
            # import and breaks threading.get_ident() earlier in run().

            # Watchdog: force exit after 3s no matter what
            def _watchdog():
                import time
                time.sleep(3)
                logger.warning("Watchdog: force exit (3s)")
                os._exit(0)

            wd = threading.Thread(target=_watchdog, daemon=True)
            wd.start()

            # Quick hangup of active calls (no libDestroy!)
            def _hangup_calls():
                tid = threading.get_ident()
                if tid not in self._registered_thread_ids:
                    try:
                        if self._endpoint:
                            self._endpoint.libRegisterThread(f"cleanup-{tid}")
                            self._registered_thread_ids.add(tid)
                            logger.info(f"[CLEANUP] Thread {tid} registered for cleanup")
                    except Exception as e:
                        logger.warning(f"[CLEANUP] libRegisterThread {tid} failed: {e}")
                active = [(sid, r) for sid, r in self.active_calls.items()
                          if r._call_ref and r.status not in (
                              CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.CANCELLED)]
                logger.info(f"[CLEANUP] Hanging up {len(active)} active call(s)")
                for sid, record in active:
                    try:
                        prm = pj.CallOpParam()
                        record._call_ref.hangup(prm)
                        logger.info(f"[CLEANUP] Hung up {sid[:8]}")
                    except Exception as e:
                        logger.warning(f"[CLEANUP] Hangup {sid[:8]} failed: {e}")
                self.active_calls.clear()
                # Skip ep.libDestroy() — it causes UE zombie processes on macOS

            try:
                await asyncio.wait_for(
                    self.loop.run_in_executor(self._executor, _hangup_calls),
                    timeout=2.0,
                )
            except (asyncio.TimeoutError, Exception):
                pass

            logger.info("Bye.")
            os._exit(0)


# ============================================================
# CLASSES INTERNES
# ============================================================

class _MakeCallRequest(BaseModel):
    """Requête POST /api/calls — initier un appel sortant."""
    to: str = Field(..., description="Numéro ou SIP URI à appeler")
    from_number: str = Field("", alias="from", description="Caller ID")
    custom_params: Optional[dict] = Field(None, alias="customParams", description="Paramètres custom (merge avec defaults)")
    ws_target: str = Field("", alias="wsTarget", description="WebSocket cible (override)")
    callback_url: str = Field("", alias="callbackUrl", description="URL de callback status")
    timeout_sec: int = Field(30, description="Timeout sonnerie en secondes")
    model_config = {"populate_by_name": True}


class _TransferCallRequest(BaseModel):
    """Requête POST /api/calls/{call_sid}/transfer — transfert aveugle."""
    destination: str = Field(..., description="SIP URI ou tel: URI de destination")


class _WsSession:
    """Bridge audio entre un appel SIP et le WebSocket (protocole Twilio Media Streams)."""

    def __init__(
        self,
        bridge: SipBridge,
        call_sid: str,
        caller_phone: str,
        callee_phone: str,
        direction: CallDirection,
        custom_params: dict,
        ws_target: str,
        audio_cfg: AudioConfig,
    ):
        self.bridge = bridge
        self.call_sid = call_sid
        self.caller_phone = caller_phone
        self.callee_phone = callee_phone
        self.direction = direction
        self.custom_params = custom_params
        self.ws_target = ws_target
        self.audio_cfg = audio_cfg
        self.audio_port: Optional[Any] = None
        self._alive = True
        self._tag = call_sid[:8]

    async def run(self, audio_port):
        self.audio_port = audio_port
        logger.info(f"[{self._tag}] WS session → {self.ws_target}")

        try:
            async with websockets.connect(self.ws_target) as ws:
                # Event "start" — identique Twilio Media Streams
                await ws.send(json.dumps({
                    "event": "start",
                    "start": {
                        "streamSid": self.call_sid,
                        "accountSid": "PJSIP-LOCAL",
                        "callSid": self.call_sid,
                        "customParameters": {
                            "callerPhone": self.caller_phone,
                            "direction": self.direction.value,
                            "to": self.callee_phone,
                            **self.custom_params,
                        },
                    },
                }))

                await asyncio.gather(
                    self._sip_to_ws(ws),
                    self._ws_to_sip(ws),
                    self._watchdog(),
                )

        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"[{self._tag}] WS fermé: {e}")
        except ConnectionRefusedError:
            logger.error(f"[{self._tag}] Connexion refusée: {self.ws_target}")
        except Exception as e:
            logger.error(f"[{self._tag}] Erreur session: {e}")
        finally:
            self._alive = False
            # Raccrocher l'appel SIP quand la session WS se termine
            record = self.bridge.active_calls.get(self.call_sid)
            call_still_active = (
                record and record._call_ref
                and record.status not in (
                    CallStatus.COMPLETED, CallStatus.FAILED,
                    CallStatus.CANCELLED,
                )
            )
            if call_still_active:
                logger.info(f"[{self._tag}] WS session ended — sending SIP BYE (hangup)")
                def _hangup_sip():
                    import time
                    tid = threading.get_ident()
                    if tid not in self.bridge._registered_thread_ids:
                        try:
                            self.bridge._endpoint.libRegisterThread(f"hangup-{tid}")
                            self.bridge._registered_thread_ids.add(tid)
                            logger.debug(f"[{self.call_sid[:8]}] hangup thread {tid} registered")
                        except Exception as e:
                            logger.warning(f"[{self.call_sid[:8]}] hangup libRegisterThread {tid} failed: {e}")
                    try:
                        prm = pj.CallOpParam()
                        record._call_ref.hangup(prm)
                        logger.info(f"[{self.call_sid[:8]}] SIP hangup sent")
                        # Laisser pjsip traiter le BYE avant de rendre la main
                        time.sleep(0.3)
                    except Exception as e:
                        logger.warning(f"[{self.call_sid[:8]}] SIP hangup failed: {e}")
                try:
                    await self.bridge.loop.run_in_executor(
                        self.bridge._executor, _hangup_sip
                    )
                except Exception:
                    pass
            else:
                logger.info(f"[{self._tag}] WS session ended — no active SIP call to hangup")
            logger.info(f"[{self._tag}] Session terminée")

    async def _watchdog(self):
        max_dur = self.bridge.config.max_call_duration
        elapsed = 0
        while self._alive:
            await asyncio.sleep(1)
            elapsed += 1
            if max_dur > 0 and elapsed >= max_dur:
                logger.info(f"[{self._tag}] Durée max ({max_dur}s) atteinte → fin")
                self._alive = False
                break

    async def _sip_to_ws(self, ws):
        ts_ms = 0
        poll_interval = self.audio_cfg.frame_ms / 1000.0  # 20ms

        try:
            while self._alive:
                pcm = self.audio_port.get_frames()
                if pcm and len(pcm) > 0:
                    ulaw = pcm16_to_ulaw(pcm)
                    payload = base64.b64encode(ulaw).decode("ascii")
                    await ws.send(json.dumps({
                        "event": "media",
                        "media": {"payload": payload, "timestamp": ts_ms},
                    }))
                    ts_ms += self.audio_cfg.frame_ms
                else:
                    await asyncio.sleep(poll_interval)

                # Check for marks whose audio has been fully played through SIP
                ready_marks = self.audio_port.get_ready_marks()
                for mark_name in ready_marks:
                    logger.debug(f"[{self._tag}] sip→ws: mark '{mark_name}' echo (audio consumed)")
                    await ws.send(json.dumps({
                        "event": "mark",
                        "mark": {"name": mark_name},
                    }))
        except Exception as e:
            if self._alive:
                logger.error(f"[{self._tag}] sip→ws: {e}")
        finally:
            try:
                await ws.send(json.dumps({"event": "stop"}))
            except Exception:
                pass

    async def _ws_to_sip(self, ws):
        try:
            async for raw in ws:
                data = json.loads(raw)
                event = data.get("event", "")

                if event == "media":
                    payload = data.get("media", {}).get("payload", "")
                    if payload and self.audio_port:
                        ulaw = base64.b64decode(payload)
                        pcm = ulaw_to_pcm16(ulaw)
                        self.audio_port.feed_audio(pcm)

                elif event == "clear":
                    logger.debug(f"[{self._tag}] ws→sip: clear (barge-in)")
                    if self.audio_port:
                        self.audio_port.clear_audio()

                elif event == "stop":
                    logger.info(f"[{self._tag}] ws→sip: STOP event received — will hangup SIP")
                    self._alive = False
                    break

                elif event == "mark":
                    mark_name = data.get("mark", {}).get("name", "")
                    if self.audio_port:
                        self.audio_port.queue_mark(mark_name)
                    else:
                        # No audio port — echo immediately as fallback
                        logger.debug(f"[{self._tag}] ws→sip: mark '{mark_name}' — no audio_port, echo immediately")
                        await ws.send(json.dumps({
                            "event": "mark",
                            "mark": {"name": mark_name},
                        }))

                else:
                    logger.info(f"[{self._tag}] ws→sip: unknown event '{event}'")

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[{self._tag}] ws→sip: WebSocket closed by server")
        except Exception as e:
            if self._alive:
                logger.error(f"[{self._tag}] ws→sip: {e}")
        finally:
            self._alive = False

    def stop(self):
        self._alive = False


# ── PJSIP handlers (conditionnels) ────────────────────────

if HAS_PJSIP:

    class _AudioPort(pj.AudioMediaPort):
        """
        Audio bridge using AudioMediaPort callbacks (pjproject 2.14.1+).
        onFrameReceived: SIP audio → rx_queue (polled by WS session)
        onFrameRequested: tx_buffer → SIP playback
        """

        def __init__(self, call_sid: str, audio_cfg: AudioConfig):
            super().__init__()
            self.call_sid = call_sid
            self.audio_cfg = audio_cfg
            self._rx_queue: queue.Queue[bytes] = queue.Queue()
            self._tx_buffer = b""
            self._tx_lock = threading.Lock()
            # Deferred mark echo — track how much audio has been fed vs consumed
            self._tx_total_fed: int = 0       # bytes appended via feed_audio()
            self._tx_total_consumed: int = 0  # bytes sent to SIP via onFrameRequested()
            self._pending_marks: list[tuple[str, int]] = []  # (mark_name, trigger_at_byte)

        # NO __del__ — calling pjsip methods from a destructor is unsafe:
        # 1. If triggered during a pjsip audio callback → reentrant mutex → SIGSEGV
        # 2. If triggered from GC on unregistered thread → pj_thread_this → SIGABRT
        # Instead, explicit cleanup in onCallState(DISCONNECTED) calls
        # unregisterMediaPort() from the pjsip thread, which sets
        # id = PJSUA_INVALID_ID. The C++ destructor then becomes a no-op.

        def onFrameReceived(self, frame):
            """Called by PJSIP when audio arrives from remote party."""
            if frame.type == pj.PJMEDIA_FRAME_TYPE_AUDIO and frame.size > 0:
                pcm = bytes(frame.buf[:frame.size])
                self._rx_queue.put(pcm)

        def onFrameRequested(self, frame):
            """Called by PJSIP when it needs audio to send to remote party."""
            needed = self.audio_cfg.bytes_per_frame
            with self._tx_lock:
                if len(self._tx_buffer) >= needed:
                    chunk = self._tx_buffer[:needed]
                    self._tx_buffer = self._tx_buffer[needed:]
                    self._tx_total_consumed += needed
                else:
                    chunk = b"\x00" * needed

            frame.buf.resize(len(chunk))
            for i, b in enumerate(chunk):
                frame.buf[i] = b
            frame.size = len(chunk)
            frame.type = pj.PJMEDIA_FRAME_TYPE_AUDIO

        def get_frames(self) -> Optional[bytes]:
            """Non-blocking read of captured audio (SIP → us)."""
            try:
                return self._rx_queue.get_nowait()
            except queue.Empty:
                return None

        def feed_audio(self, pcm: bytes):
            """Push audio for playback (us → SIP)."""
            with self._tx_lock:
                self._tx_buffer += pcm
                self._tx_total_fed += len(pcm)

        def clear_audio(self):
            """Clear playback buffer (barge-in). Also discards pending marks."""
            with self._tx_lock:
                self._tx_buffer = b""
                self._pending_marks.clear()

        def queue_mark(self, mark_name: str):
            """Queue a mark to be echoed when all preceding audio has been played."""
            with self._tx_lock:
                trigger_at = self._tx_total_fed
                self._pending_marks.append((mark_name, trigger_at))
                logger.debug(
                    f"[{self.call_sid[:8]}] mark '{mark_name}' queued at byte {trigger_at} "
                    f"(consumed={self._tx_total_consumed}, buffered={len(self._tx_buffer)})"
                )

        def get_ready_marks(self) -> list[str]:
            """Return marks whose audio has been fully consumed by SIP."""
            ready = []
            with self._tx_lock:
                remaining = []
                for name, trigger_at in self._pending_marks:
                    if self._tx_total_consumed >= trigger_at:
                        ready.append(name)
                    else:
                        remaining.append((name, trigger_at))
                self._pending_marks = remaining
            return ready


    class _SipCallHandler(pj.Call):

        def __init__(self, bridge: SipBridge, account,
                     direction: CallDirection,
                     custom_params: dict = None,
                     ws_target: str = "",
                     callback_url: str = "", to_number: str = "",
                     call_id=pj.PJSUA_INVALID_ID):
            super().__init__(account, call_id)
            self.bridge = bridge
            self.call_sid = str(uuid.uuid4())
            self.direction = direction
            self.custom_params = custom_params or dict(bridge.config.custom_params)
            self.ws_target = ws_target or bridge.config.ws_target
            self.callback_url = callback_url
            self.to_number = to_number
            self.audio_port: Optional[_AudioPort] = None
            self.session: Optional[_WsSession] = None
            self._task: Optional[asyncio.Task] = None
            self._connected = False

        def onCallState(self, prm):
            ci = self.getInfo()
            logger.info(f"[{self.call_sid[:8]}] Call state: {ci.stateText} (SIP {ci.lastStatusCode})")

            status_map = {
                pj.PJSIP_INV_STATE_CALLING: CallStatus.INITIATED,
                pj.PJSIP_INV_STATE_INCOMING: CallStatus.RINGING,
                pj.PJSIP_INV_STATE_EARLY: CallStatus.RINGING,
                pj.PJSIP_INV_STATE_CONNECTING: CallStatus.ANSWERED,
                pj.PJSIP_INV_STATE_CONFIRMED: CallStatus.ACTIVE,
            }

            record = self.bridge.active_calls.get(self.call_sid)

            if ci.state == pj.PJSIP_INV_STATE_DISCONNECTED:
                self._connected = False
                duration_s = 0
                if record and record.answered_at:
                    try:
                        answered = datetime.fromisoformat(record.answered_at)
                        duration_s = int((datetime.now(timezone.utc) - answered).total_seconds())
                    except Exception:
                        pass
                logger.info(f"[{self.call_sid[:8]}] DISCONNECTED — SIP {ci.lastStatusCode}, duration={duration_s}s, reason={ci.lastReason}")

                final_status = CallStatus.COMPLETED
                sip_code = ci.lastStatusCode
                if sip_code == 486 or sip_code == 600:
                    final_status = CallStatus.BUSY
                elif sip_code == 408 or sip_code == 480:
                    final_status = CallStatus.NO_ANSWER
                elif sip_code >= 400:
                    final_status = CallStatus.FAILED

                if record:
                    now = datetime.now(timezone.utc)
                    record.status = final_status
                    record.ended_at = now.isoformat()
                    if record.answered_at:
                        answered = datetime.fromisoformat(record.answered_at)
                        record.duration_sec = int((now - answered).total_seconds())
                    self.bridge.loop.call_soon_threadsafe(
                        lambda: asyncio.ensure_future(
                            self.bridge.fire_callback(record, "completed")
                        )
                    )
                    self.bridge.loop.call_soon_threadsafe(
                        lambda sid=self.call_sid: asyncio.get_event_loop().call_later(
                            30, lambda: self.bridge.active_calls.pop(sid, None)
                        )
                    )

                # Drop all references to AudioPort so Python's destructor runs.
                # The C++ destructor calls pjsua_conf_remove_port() which needs
                # a registered thread. This pjsip callback thread is registered,
                # and the asyncio thread is registered at startup in run().
                # We drop refs here so the destructor runs in one of these.
                port = self.audio_port
                self.audio_port = None
                if self.session:
                    self.session.audio_port = None
                    self.session.stop()
                # Explicitly delete from this (registered) pjsip thread
                if port is not None:
                    port_id = port.getPortId()
                    del port
                    logger.info(f"[{self.call_sid[:8]}] AudioPort destroyed (port_id was {port_id})")

                # Nettoyer la ref call pour éviter que le GC Python
                # détruise l'objet Call depuis un thread non-enregistré
                if record:
                    record._call_ref = None

                if self._task and not self._task.done():
                    self.bridge.loop.call_soon_threadsafe(self._task.cancel)

            elif ci.state in status_map and record:
                new_status = status_map[ci.state]
                if record.status != new_status:
                    record.status = new_status
                    if new_status in (CallStatus.ANSWERED, CallStatus.ACTIVE):
                        record.answered_at = datetime.now(timezone.utc).isoformat()
                    self.bridge.loop.call_soon_threadsafe(
                        lambda evt=new_status.value: asyncio.ensure_future(
                            self.bridge.fire_callback(record, evt)
                        )
                    )

        def onCallMediaState(self, prm):
            ci = self.getInfo()
            for idx, mi in enumerate(ci.media):
                if (
                    mi.type == pj.PJMEDIA_TYPE_AUDIO
                    and mi.status == pj.PJSUA_CALL_MEDIA_ACTIVE
                ):
                    aud_med = self.getAudioMedia(idx)

                    audio_cfg = self.bridge.config.audio
                    self.audio_port = _AudioPort(self.call_sid, audio_cfg)

                    fmt = pj.MediaFormatAudio()
                    fmt.type = pj.PJMEDIA_TYPE_AUDIO
                    fmt.clockRate = audio_cfg.clock_rate
                    fmt.channelCount = audio_cfg.channel_count
                    fmt.bitsPerSample = audio_cfg.bits_per_sample
                    fmt.frameTimeUsec = audio_cfg.frame_ms * 1000

                    self.audio_port.createPort("bridge", fmt)
                    aud_med.startTransmit(self.audio_port)
                    self.audio_port.startTransmit(aud_med)
                    self._connected = True

                    caller = self._parse_caller(ci.remoteUri)
                    callee = self._parse_caller(ci.localUri)
                    logger.info(f"[{self.call_sid[:8]}] Audio actif — {caller} → {callee}")

                    self.session = _WsSession(
                        bridge=self.bridge,
                        call_sid=self.call_sid,
                        caller_phone=caller,
                        callee_phone=self.to_number or callee,
                        direction=self.direction,
                        custom_params=self.custom_params,
                        ws_target=self.ws_target,
                        audio_cfg=audio_cfg,
                    )
                    self.bridge.loop.call_soon_threadsafe(self._start_session)
                    break

        def _start_session(self):
            self._task = asyncio.ensure_future(
                self.session.run(self.audio_port)
            )

            def on_done(task):
                # Le hangup SIP est géré dans _WsSession.run() finally
                logger.debug(f"[{self.call_sid[:8]}] WS session task done (connected={self._connected})")

            self._task.add_done_callback(on_done)

        @staticmethod
        def _parse_caller(sip_uri: str) -> str:
            try:
                clean = sip_uri.replace("<", "").replace(">", "").replace('"', "")
                if "sip:" in clean:
                    return _normalize_number(clean.split("sip:")[1].split("@")[0])
            except Exception:
                pass
            return sip_uri


    class _SipAccountHandler(pj.Account):

        def __init__(self, bridge: SipBridge):
            super().__init__()
            self.bridge = bridge

        def onIncomingCall(self, prm):
            call = _SipCallHandler(self.bridge, self, CallDirection.INBOUND, call_id=prm.callId)
            ci = call.getInfo()
            caller = _SipCallHandler._parse_caller(ci.remoteUri)
            callee = _SipCallHandler._parse_caller(ci.localUri)
            logger.info(f"Appel entrant: {caller} → {callee}")

            active_count = sum(
                1 for r in self.bridge.active_calls.values()
                if r.status in (CallStatus.ACTIVE, CallStatus.ANSWERED, CallStatus.RINGING)
            )
            if active_count >= self.bridge.config.max_concurrent_calls:
                logger.warning(f"Max appels atteint ({active_count}) → rejeter")
                reject = pj.CallOpParam()
                reject.statusCode = 486
                call.hangup(reject)
                return

            record = CallRecord(
                sid=call.call_sid,
                direction=CallDirection.INBOUND,
                from_number=caller,
                to_number=callee,
                status=CallStatus.RINGING,
                custom_params=dict(self.bridge.config.custom_params),
                created_at=datetime.now(timezone.utc).isoformat(),
                ws_target=self.bridge.config.ws_target,
                callback_url="",
                _call_ref=call,
            )
            self.bridge.active_calls[call.call_sid] = record

            bridge = self.bridge

            async def handle_incoming():
                decision = await bridge.fire_incoming_callback(caller, callee)
                action = decision.get("action", "accept")

                if action == "reject":
                    logger.info(f"[{call.call_sid[:8]}] Rejeté par callback")
                    record.status = CallStatus.FAILED
                    try:
                        reject = pj.CallOpParam()
                        reject.statusCode = int(decision.get("statusCode", 486))
                        call.hangup(reject)
                    except Exception:
                        pass
                    return

                if action == "ignore":
                    logger.info(f"[{call.call_sid[:8]}] Ignoré par callback")
                    return

                # Le callback peut override les custom params
                if decision.get("customParams") and isinstance(decision["customParams"], dict):
                    call.custom_params.update(decision["customParams"])
                    record.custom_params.update(decision["customParams"])
                if decision.get("wsTarget"):
                    call.ws_target = decision["wsTarget"]
                    record.ws_target = decision["wsTarget"]
                if decision.get("callbackUrl"):
                    call.callback_url = decision["callbackUrl"]
                    record.callback_url = decision["callbackUrl"]

                await bridge.fire_callback(record, "ringing")

            self.bridge.loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(handle_incoming())
            )

            if self.bridge.config.auto_answer:
                answer = pj.CallOpParam()
                answer.statusCode = 200
                call.answer(answer)

        def onRegState(self, prm):
            ai = self.getInfo()
            was_registered = self.bridge._sip_registered
            # Cache registration state for thread-safe access from /health
            self.bridge._sip_registered = bool(ai.regIsActive)
            if ai.regIsActive:
                logger.info(f"SIP REGISTERED — {ai.uri} (code {ai.regStatus}, expires {ai.regExpiresSec}s)")
            elif ai.regStatus // 100 == 2:
                self.bridge._sip_registered = False
                logger.info(f"SIP UNREGISTERED — {ai.uri} (code {ai.regStatus})")
            else:
                self.bridge._sip_registered = False
                logger.error(f"SIP REGISTRATION FAILED — {ai.uri} (code {ai.regStatus}: {ai.regStatusText})")
            # Alerte si on perd la registration (on était enregistré, on ne l'est plus)
            if was_registered and not self.bridge._sip_registered:
                logger.error(f"[ALERTE] Registration SIP PERDUE — les appels entrants ne seront plus recus ! (code {ai.regStatus}: {ai.regStatusText})")
