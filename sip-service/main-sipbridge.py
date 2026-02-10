#!/usr/bin/env python3
"""
main-sipbridge.py — Point d'entrée CLI du SIP Bridge

Charge la configuration depuis la ligne de commande et lance le bridge.
Les paramètres custom (restaurantId, etc.) sont passés via --param key=value.

Usage :
    python main-sipbridge.py \
        --sip-username 33491234567 \
        --sip-password s3cr3t \
        --sip-domain sip.trunk-provider.com \
        --param restaurantId=pizza-bella-napoli

    Ou via le script de lancement :
        ./start-sipbridge.sh
"""

import argparse
import asyncio
import logging
import sys

from sipbridge import (
    SipBridge,
    BridgeConfig,
    SipConfig,
    NatConfig,
    AudioConfig,
    CallbackConfig,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)


def _parse_param(s: str) -> tuple[str, str]:
    """Parse 'key=value' → (key, value). Raises on bad format."""
    if "=" not in s:
        raise argparse.ArgumentTypeError(f"Format attendu : key=value, reçu : {s!r}")
    k, v = s.split("=", 1)
    return k.strip(), v.strip()


def parse_args(argv=None) -> BridgeConfig:
    p = argparse.ArgumentParser(
        prog="main-sipbridge",
        description="SIP Bridge — Twilio-compatible SIP ↔ WebSocket bridge.",
    )

    # ── SIP ──
    sip = p.add_argument_group("SIP")
    sip.add_argument("--sip-domain",    default="sip.twilio.com",   help="Domaine du registrar SIP (défaut: sip.twilio.com)")
    sip.add_argument("--sip-username",  required=True,              help="Username SIP (requis)")
    sip.add_argument("--sip-password",  default="",                 help="Mot de passe SIP")
    sip.add_argument("--sip-port",      type=int, default=0,        help="Port SIP local (0=auto)")
    sip.add_argument("--sip-transport", default="udp", choices=["udp", "tcp", "tls"], help="Transport SIP (défaut: udp)")
    sip.add_argument("--sip-reg-timeout", type=int, default=300,    help="Intervalle ré-enregistrement en sec (défaut: 300)")

    # ── NAT ──
    nat = p.add_argument_group("NAT")
    nat.add_argument("--stun-server",   default="",                 help="Serveur STUN (ex: stun.l.google.com:19302)")
    nat.add_argument("--turn-server",   default="",                 help="Serveur TURN (ex: mon-vps:3478)")
    nat.add_argument("--turn-username", default="",                 help="Username TURN")
    nat.add_argument("--turn-password", default="",                 help="Password TURN")
    nat.add_argument("--no-ice",        action="store_true",        help="Désactiver ICE")

    # ── Audio ──
    audio = p.add_argument_group("Audio")
    audio.add_argument("--no-ec",       action="store_true",        help="Désactiver l'echo cancellation")
    audio.add_argument("--ec-tail-ms",  type=int, default=200,      help="Echo cancel tail en ms (défaut: 200)")
    audio.add_argument("--vad",         action="store_true",        help="Activer VAD côté SIP")
    audio.add_argument("--rx-gain",     type=float, default=0.0,    help="Gain audio reçu du client en dB (défaut: 0)")
    audio.add_argument("--tx-gain",     type=float, default=0.0,    help="Gain audio envoyé au client en dB (défaut: 0)")

    # ── Bridge ──
    bridge = p.add_argument_group("Bridge")
    bridge.add_argument("--ws-target",          default="ws://localhost:5050/media-stream", help="WebSocket cible (défaut: ws://localhost:5050/media-stream)")
    bridge.add_argument("--api-port",           type=int, default=5060, help="Port de l'API REST (défaut: 5060)")
    bridge.add_argument("--no-auto-answer",     action="store_true", help="Ne pas décrocher automatiquement les appels entrants")
    bridge.add_argument("--max-call-duration",  type=int, default=600, help="Durée max d'un appel en sec, 0=illimité (défaut: 600)")
    bridge.add_argument("--max-concurrent-calls", type=int, default=10, help="Appels simultanés max (défaut: 10)")
    bridge.add_argument("--param", type=_parse_param, action="append", default=[], metavar="key=value",
                        help="Paramètre custom passé dans chaque WebSocket start (répétable)")

    # ── Callbacks ──
    cb = p.add_argument_group("Callbacks")
    cb.add_argument("--status-callback-url",    default="",         help="URL de callback status")
    cb.add_argument("--incoming-callback-url",  default="",         help="URL appelée avant de décrocher un appel entrant")
    cb.add_argument("--callback-method",        default="POST", choices=["POST", "GET"], help="Méthode HTTP des callbacks (défaut: POST)")
    cb.add_argument("--callback-timeout",       type=float, default=5.0, help="Timeout callbacks en sec (défaut: 5)")

    args = p.parse_args(argv)

    # Construire le dict de custom params
    custom_params = dict(args.param)

    return BridgeConfig(
        sip=SipConfig(
            domain=args.sip_domain,
            username=args.sip_username,
            password=args.sip_password,
            port=args.sip_port,
            transport=args.sip_transport,
            reg_timeout=args.sip_reg_timeout,
        ),
        nat=NatConfig(
            stun_server=args.stun_server,
            turn_server=args.turn_server,
            turn_username=args.turn_username,
            turn_password=args.turn_password,
            ice_enabled=not args.no_ice,
        ),
        audio=AudioConfig(
            ec_enabled=not args.no_ec,
            ec_tail_ms=args.ec_tail_ms,
            vad_enabled=args.vad,
            rx_gain=args.rx_gain,
            tx_gain=args.tx_gain,
        ),
        callbacks=CallbackConfig(
            status_callback_url=args.status_callback_url,
            incoming_callback_url=args.incoming_callback_url,
            callback_method=args.callback_method,
            callback_timeout=args.callback_timeout,
        ),
        ws_target=args.ws_target,
        api_port=args.api_port,
        custom_params=custom_params,
        auto_answer=not args.no_auto_answer,
        max_call_duration=args.max_call_duration,
        max_concurrent_calls=args.max_concurrent_calls,
    )


def main():
    config = parse_args()

    if not config.sip.username:
        print("Erreur: --sip-username est requis", file=sys.stderr)
        sys.exit(1)

    bridge = SipBridge(config)
    asyncio.run(bridge.run())


if __name__ == "__main__":
    main()
