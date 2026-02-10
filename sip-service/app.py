"""
Serveur vocal IA pour prise de commande restaurant
Twilio Programmable Voice + Media Streams + OpenAI Realtime API

Architecture:
  Client appelle le numéro Twilio
    → Twilio stream l'audio en WebSocket (µ-law 8kHz)
    → Ce serveur proxy vers OpenAI Realtime API
    → OpenAI répond en audio
    → Ce serveur renvoie l'audio à Twilio
    → Le client entend la réponse

  Données chargées dynamiquement depuis l'API Next.js :
    - System prompt avec menu, prix, options
    - FAQ / base de connaissances
    - Contexte client (prénom, adresse, historique)
    - Config livraison (frais, minimum, rayon)
    - Tools (function calling) : check_availability, confirm_order,
      confirm_reservation, save_customer_info, log_new_faq, leave_message
"""

import os
import json
import asyncio
import websockets
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.websockets import WebSocketDisconnect
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
from dotenv import load_dotenv
import httpx
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# ============================================================
# CONFIGURATION
# ============================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PORT = int(os.getenv("PORT", 5050))
NEXT_API_URL = os.getenv("NEXT_API_URL", "http://localhost:3000")
RESTAURANT_ID = os.getenv("RESTAURANT_ID", "")

# Événements OpenAI à logger (pour debug)
LOG_EVENT_TYPES = [
    "error",
    "response.done",
    "input_audio_buffer.speech_started",
    "input_audio_buffer.speech_stopped",
    "response.content.done",
    "session.created",
    "session.updated",
]

# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
async def index():
    return "<h1>Serveur vocal AlloResto</h1><p>Le serveur tourne. Configurez Twilio webhook vers /incoming-call</p>"


@app.api_route("/incoming-call", methods=["GET", "POST"])
async def incoming_call(request: Request):
    """
    Twilio appelle cette URL quand un appel arrive.
    On répond avec du TwiML qui connecte l'appel à notre WebSocket.
    """
    form_data = {}
    if request.method == "POST":
        form_data = dict(await request.form())
    else:
        form_data = dict(request.query_params)

    caller_phone = form_data.get("From", "")

    response = VoiceResponse()
    response.pause(length=1)

    host = request.headers.get("host", request.url.hostname)
    connect = Connect()
    stream = Stream(url=f"wss://{host}/media-stream")
    stream.parameter(name="callerPhone", value=caller_phone)
    stream.parameter(name="restaurantId", value=RESTAURANT_ID)
    connect.append(stream)
    response.append(connect)

    return HTMLResponse(content=str(response), media_type="application/xml")


# ============================================================
# API HELPERS — Communication avec Next.js
# ============================================================

async def fetch_ai_config(restaurant_id: str, caller_phone: str = "") -> dict:
    """Charge le system prompt, tools, voice, customer context depuis l'API Next.js."""
    params = {"restaurantId": restaurant_id}
    if caller_phone:
        params["callerPhone"] = caller_phone

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{NEXT_API_URL}/api/ai", params=params)
        resp.raise_for_status()
        return resp.json()


async def api_post(path: str, data: dict) -> dict:
    """POST vers l'API Next.js."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{NEXT_API_URL}{path}", json=data)
        resp.raise_for_status()
        return resp.json()


async def api_patch(path: str, data: dict) -> dict:
    """PATCH vers l'API Next.js."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(f"{NEXT_API_URL}{path}", json=data)
        resp.raise_for_status()
        return resp.json()


async def check_phone_blocked(restaurant_id: str, phone: str) -> bool:
    """Vérifie si un numéro est bloqué via GET /api/blocked-phones/check."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{NEXT_API_URL}/api/blocked-phones/check",
                params={"restaurantId": restaurant_id, "phone": phone},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("blocked", False)
    except Exception as e:
        logger.error(f"Erreur verification blocage: {e}")
        return False  # En cas d'erreur, on ne bloque pas


# ============================================================
# TOOL HANDLERS — Chaque function call d'OpenAI appelle l'API
# ============================================================

async def handle_check_availability(args: dict, ctx: dict) -> dict:
    """Vérifie la disponibilité (pickup, delivery, reservation) via l'API unifiée."""
    try:
        payload = {
            "restaurantId": ctx["restaurant_id"],
            "mode": args.get("mode", "pickup"),
        }
        if args.get("requested_time"):
            payload["requestedTime"] = args["requested_time"]
        if args.get("customer_address"):
            payload["customerAddress"] = args["customer_address"]
        if args.get("customer_city"):
            payload["customerCity"] = args["customer_city"]
        if args.get("customer_postal_code"):
            payload["customerPostalCode"] = args["customer_postal_code"]
        if args.get("party_size"):
            payload["partySize"] = args["party_size"]
        if args.get("seating_preference"):
            payload["seatingPreference"] = args["seating_preference"]

        result = await api_post("/api/availability/check", payload)

        # Stocker dans le contexte pour confirm_order / confirm_reservation
        ctx["last_availability_check"] = result

        return result
    except Exception as e:
        logger.error(f"Erreur check_availability: {e}")
        return {"available": False, "error": str(e)}


async def handle_confirm_order(args: dict, ctx: dict) -> dict:
    """Enregistre la commande via POST /api/orders.

    L'heure estimée vient du dernier check_availability (stocké dans ctx).
    """
    availability = ctx.get("last_availability_check") or {}
    order_type = args.get("order_type", "pickup")

    # estimatedReadyAt depuis le dernier check_availability
    estimated_ready_at = availability.get("estimatedTimeISO")
    heure_str = availability.get("estimatedTime", "")

    # Fallback si pas de check_availability (ne devrait pas arriver)
    if not estimated_ready_at:
        paris_now = datetime.now(ZoneInfo("Europe/Paris"))
        prep_min = ctx.get("avg_prep_time_min", 30)
        ready_paris = paris_now + timedelta(minutes=prep_min)
        estimated_ready_at = ready_paris.astimezone(timezone.utc).isoformat()
        heure_str = ready_paris.strftime("%H:%M")

    order_data = {
        "restaurantId": ctx["restaurant_id"],
        "callId": ctx.get("call_id"),
        "customerId": ctx.get("customer_id"),
        "customerPhone": ctx.get("caller_phone", ""),
        "total": args.get("total", 0),
        "orderType": order_type,
        "deliveryAddress": availability.get("customerAddressFormatted") if order_type == "delivery" else None,
        "deliveryDistanceKm": availability.get("deliveryDistanceKm") if order_type == "delivery" else None,
        "deliveryLat": availability.get("customerLat") if order_type == "delivery" else None,
        "deliveryLng": availability.get("customerLng") if order_type == "delivery" else None,
        "deliveryFee": args.get("delivery_fee", 0),
        "estimatedReadyAt": estimated_ready_at,
        "notes": args.get("notes", ""),
        "paymentMethod": args.get("payment_method", "cash"),
        "items": [
            {
                "itemName": item["name"],
                "quantity": item.get("quantity", 1),
                "price": item.get("unit_price", 0),
                "options": item.get("selected_options"),
                "notes": item.get("notes"),
            }
            for item in args.get("items", [])
        ],
    }

    try:
        result = await api_post("/api/orders", order_data)
        order_id = result.get("id", "unknown")
        logger.info(f"Commande {order_id} creee: {args.get('total', 0)}EUR, pret a {heure_str}")
        mode = "livree" if order_type == "delivery" else "prete"
        return {
            "success": True,
            "order_id": order_id,
            "message": f"Commande de {args.get('total', 0)}EUR enregistree",
            "heure_estimee": heure_str,
            "mode": mode,
        }
    except Exception as e:
        logger.error(f"Erreur creation commande: {e}")
        return {"success": False, "error": str(e)}


async def handle_confirm_reservation(args: dict, ctx: dict) -> dict:
    """Enregistre une réservation via POST /api/reservations."""
    availability = ctx.get("last_availability_check") or {}

    # Utiliser l'heure confirmée par check_availability
    reservation_time_iso = availability.get("estimatedTimeISO")
    heure_str = availability.get("estimatedTime", args.get("reservation_time", ""))

    # Fallback : parser l'heure depuis les args si pas de check
    if not reservation_time_iso and args.get("reservation_time"):
        paris_now = datetime.now(ZoneInfo("Europe/Paris"))
        try:
            h, m = map(int, args["reservation_time"].split(":"))
            resa_time = paris_now.replace(hour=h, minute=m, second=0, microsecond=0)
            if resa_time <= paris_now:
                resa_time += timedelta(days=1)
            reservation_time_iso = resa_time.astimezone(timezone.utc).isoformat()
        except Exception:
            reservation_time_iso = paris_now.isoformat()

    reservation_data = {
        "restaurantId": ctx["restaurant_id"],
        "callId": ctx.get("call_id"),
        "customerId": ctx.get("customer_id"),
        "customerName": args.get("customer_name", ""),
        "customerPhone": args.get("customer_phone", ctx.get("caller_phone", "")),
        "partySize": args.get("party_size", 2),
        "reservationTime": reservation_time_iso,
        "status": "confirmed",
        "seatingPreference": args.get("seating_preference"),
        "notes": args.get("notes"),
    }

    try:
        result = await api_post("/api/reservations", reservation_data)
        reservation_id = result.get("id", "unknown")
        logger.info(f"Reservation {reservation_id} creee pour {args.get('party_size', 2)} pers a {heure_str}")
        return {
            "success": True,
            "reservation_id": reservation_id,
            "message": f"Table reservee pour {args.get('party_size', 2)} personnes a {heure_str}",
            "heure": heure_str,
        }
    except Exception as e:
        logger.error(f"Erreur creation reservation: {e}")
        return {"success": False, "error": str(e)}


async def handle_save_customer(args: dict, ctx: dict) -> dict:
    """Sauvegarde les infos client via POST /api/customers (upsert)."""
    customer_data = {
        "restaurantId": ctx["restaurant_id"],
        "phone": ctx.get("caller_phone", ""),
    }
    if args.get("first_name"):
        customer_data["firstName"] = args["first_name"]
    if args.get("delivery_address"):
        customer_data["deliveryAddress"] = args["delivery_address"]
    if args.get("delivery_city"):
        customer_data["deliveryCity"] = args["delivery_city"]
    if args.get("delivery_postal_code"):
        customer_data["deliveryPostalCode"] = args["delivery_postal_code"]
    if args.get("delivery_notes"):
        customer_data["deliveryNotes"] = args["delivery_notes"]

    try:
        result = await api_post("/api/customers", customer_data)
        if result.get("id"):
            ctx["customer_id"] = result["id"]
        return {"success": True, "message": "Informations client enregistrees"}
    except Exception as e:
        logger.error(f"Erreur sauvegarde client: {e}")
        return {"success": False, "error": str(e)}


async def handle_log_faq(args: dict, ctx: dict) -> dict:
    """Remonte une question FAQ inconnue via POST /api/faq."""
    try:
        await api_post("/api/faq", {
            "restaurantId": ctx["restaurant_id"],
            "question": args.get("question", ""),
            "category": args.get("category", "other"),
            "callerPhone": ctx.get("caller_phone", ""),
        })
        return {"success": True, "message": "Question remontee au restaurateur"}
    except Exception as e:
        logger.error(f"Erreur log FAQ: {e}")
        return {"success": True, "message": "Question notee"}


async def handle_leave_message(args: dict, ctx: dict) -> dict:
    """Crée un message pour le restaurant via POST /api/messages."""
    try:
        message_data = {
            "restaurantId": ctx["restaurant_id"],
            "callId": ctx.get("call_id"),
            "callerPhone": ctx.get("caller_phone", ""),
            "callerName": args.get("caller_name"),
            "content": args.get("content", ""),
            "category": args.get("category", "other"),
            "isUrgent": args.get("is_urgent", False),
        }
        result = await api_post("/api/messages", message_data)
        ctx["message_left"] = True
        logger.info(f"Message cree: {result.get('id', 'unknown')}")
        return {"success": True, "message": "Message transmis au restaurant"}
    except Exception as e:
        logger.error(f"Erreur creation message: {e}")
        return {"success": True, "message": "Message note"}


TOOL_HANDLERS = {
    "check_availability": handle_check_availability,
    "confirm_order": handle_confirm_order,
    "confirm_reservation": handle_confirm_reservation,
    "save_customer_info": handle_save_customer,
    "log_new_faq": handle_log_faq,
    "leave_message": handle_leave_message,
}


# ============================================================
# CALL LIFECYCLE — Création et finalisation du call record
# ============================================================

async def create_call_record(ctx: dict) -> str | None:
    """Crée un call record au début de l'appel."""
    try:
        call = await api_post("/api/calls", {
            "restaurantId": ctx["restaurant_id"],
            "callerNumber": ctx.get("caller_phone", ""),
            "customerId": ctx.get("customer_id"),
            "startedAt": ctx["call_start"].isoformat(),
        })
        call_id = call.get("id")
        logger.info(f"Call record cree: {call_id}")
        return call_id
    except Exception as e:
        logger.error(f"Erreur creation call record: {e}")
        return None


async def finalize_call(ctx: dict):
    """Met à jour le call record en fin d'appel (durée, outcome, transcript)."""
    call_id = ctx.get("call_id")
    if not call_id:
        return

    now = datetime.now(timezone.utc)
    duration = int((now - ctx["call_start"]).total_seconds())

    # Déterminer l'outcome
    outcome = "abandoned"
    if ctx.get("order_placed"):
        outcome = "order_placed"
    elif ctx.get("reservation_placed"):
        outcome = "reservation_placed"
    elif ctx.get("message_left"):
        outcome = "message_left"
    elif ctx.get("had_conversation"):
        outcome = "info_only"

    # Auto-créer un message si conversation mais ni commande ni réservation ni message
    if ctx.get("had_conversation") and not ctx.get("order_placed") and not ctx.get("reservation_placed") and not ctx.get("message_left"):
        try:
            # Résumer la conversation dans un message automatique
            transcript_summary = ""
            for entry in (ctx.get("transcript") or [])[-6:]:
                role = "Client" if entry["role"] == "user" else "IA"
                transcript_summary += f"{role}: {entry['content'][:100]}\n"

            await api_post("/api/messages", {
                "restaurantId": ctx["restaurant_id"],
                "callId": call_id,
                "callerPhone": ctx.get("caller_phone", ""),
                "content": f"Appel sans commande ni reservation.\n\nDernieres echanges:\n{transcript_summary.strip()}",
                "category": "info_request",
                "isUrgent": False,
            })
            logger.info(f"Message auto-cree pour appel {call_id} sans commande/reservation")
        except Exception as e:
            logger.error(f"Erreur creation message auto: {e}")

    updates: dict = {
        "id": call_id,
        "endedAt": now.isoformat(),
        "durationSec": duration,
        "outcome": outcome,
    }

    # Ajouter le transcript si disponible
    if ctx.get("transcript"):
        updates["transcript"] = ctx["transcript"]

    try:
        await api_patch("/api/calls", updates)
        logger.info(f"Call {call_id} finalise ({duration}s, {outcome})")
    except Exception as e:
        logger.error(f"Erreur finalisation call: {e}")


# ============================================================
# FUNCTION CALL ROUTER
# ============================================================

async def handle_function_call(response: dict, openai_ws, ctx: dict):
    """Route les function calls d'OpenAI vers les handlers appropriés."""
    function_name = response.get("name", "")
    call_id = response.get("call_id", "")

    try:
        arguments = json.loads(response.get("arguments", "{}"))
    except json.JSONDecodeError:
        arguments = {}

    logger.info(f"Tool call: {function_name}")
    logger.info(f"Args: {json.dumps(arguments, indent=2, ensure_ascii=False)}")

    handler = TOOL_HANDLERS.get(function_name)
    if handler:
        result = await handler(arguments, ctx)
        # Marquer si une commande ou réservation a été passée
        if function_name == "confirm_order" and result.get("success"):
            ctx["order_placed"] = True
        elif function_name == "confirm_reservation" and result.get("success"):
            ctx["reservation_placed"] = True
        elif function_name == "leave_message" and result.get("success"):
            ctx["message_left"] = True
    else:
        result = {"error": f"Fonction inconnue: {function_name}"}

    # Répondre à OpenAI
    await openai_ws.send(json.dumps({
        "type": "conversation.item.create",
        "item": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": json.dumps(result, ensure_ascii=False),
        },
    }))
    await openai_ws.send(json.dumps({"type": "response.create"}))


# ============================================================
# WEBSOCKET — Media Stream
# ============================================================

@app.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    """
    WebSocket bidirectionnel:
    - Reçoit l'audio de Twilio (µ-law 8kHz, base64)
    - Envoie à OpenAI Realtime API
    - Reçoit la réponse audio d'OpenAI
    - Renvoie à Twilio
    """
    await websocket.accept()
    logger.info("Nouvel appel connecte au WebSocket")

    # Contexte de l'appel — enrichi au fil de la conversation
    ctx = {
        "restaurant_id": RESTAURANT_ID,
        "caller_phone": "",
        "call_id": None,
        "customer_id": None,
        "call_start": datetime.now(timezone.utc),
        "order_placed": False,
        "reservation_placed": False,
        "message_left": False,
        "had_conversation": False,
        "transcript": [],
        # Config restaurant (rempli au chargement de l'AI config)
        "avg_prep_time_min": 30,
        "delivery_enabled": False,
        # Résultat du dernier check_availability (enrichi par le handler)
        "last_availability_check": None,
    }

    ai_config = None
    stream_sid = None
    latest_media_timestamp = 0
    last_assistant_item = None
    mark_queue = []
    response_start_timestamp_twilio = None

    # Connexion à OpenAI Realtime API
    openai_ws_url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1",
    }

    async with websockets.connect(openai_ws_url, additional_headers=headers) as openai_ws:

        async def send_session_update():
            """Configure la session OpenAI avec les données chargées de la BDD."""
            session_update = {
                "type": "session.update",
                "session": {
                    "turn_detection": {"type": "server_vad"},
                    "input_audio_format": "g711_ulaw",
                    "output_audio_format": "g711_ulaw",
                    "voice": ai_config.get("voice", "sage"),
                    "instructions": ai_config["systemPrompt"],
                    "modalities": ["text", "audio"],
                    "temperature": 0.7,
                    "tools": ai_config["tools"],
                    "tool_choice": "auto",
                    "input_audio_transcription": {"model": "whisper-1"},
                },
            }
            await openai_ws.send(json.dumps(session_update))

            # Message d'accueil personnalisé
            customer = ai_config.get("customerContext")
            if customer and customer.get("firstName"):
                greeting = (
                    f"Le client {customer['firstName']} vient d'appeler "
                    f"(client fidele, {customer['totalOrders']} commandes). "
                    f"Accueille-le par son prenom et demande ce qu'il souhaite commander."
                )
            else:
                greeting = (
                    "Un nouveau client vient d'appeler. "
                    "Accueille-le chaleureusement, presente-toi brievement "
                    "et demande ce qu'il souhaite commander."
                )

            await openai_ws.send(json.dumps({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": greeting}],
                },
            }))
            await openai_ws.send(json.dumps({"type": "response.create"}))

        # ------------------------------------------------
        # TASK 1: Twilio → OpenAI
        # ------------------------------------------------
        async def receive_from_twilio():
            nonlocal stream_sid, latest_media_timestamp, ai_config

            try:
                async for message in websocket.iter_text():
                    data = json.loads(message)

                    if data["event"] == "media" and openai_ws.open:
                        latest_media_timestamp = int(data["media"]["timestamp"])
                        await openai_ws.send(json.dumps({
                            "type": "input_audio_buffer.append",
                            "audio": data["media"]["payload"],
                        }))

                    elif data["event"] == "start":
                        stream_sid = data["start"]["streamSid"]
                        logger.info(f"Stream demarre: {stream_sid}")
                        latest_media_timestamp = 0

                        # Extraire les paramètres custom (callerPhone, restaurantId)
                        custom_params = data["start"].get("customParameters", {})
                        caller_phone = custom_params.get("callerPhone", "")
                        restaurant_id = custom_params.get("restaurantId", RESTAURANT_ID)

                        ctx["caller_phone"] = caller_phone
                        ctx["restaurant_id"] = restaurant_id

                        # 0. Vérifier si le numéro est bloqué
                        if caller_phone and await check_phone_blocked(restaurant_id, caller_phone):
                            logger.info(f"Numero bloque: {caller_phone} — raccrocher")
                            # Fermer le WebSocket Twilio → Twilio raccroche
                            await websocket.close()
                            return

                        # 1. Charger la config AI depuis l'API Next.js
                        try:
                            ai_config = await fetch_ai_config(restaurant_id, caller_phone)
                            logger.info(f"Config AI chargee pour restaurant {restaurant_id}")

                            ctx["avg_prep_time_min"] = ai_config.get("avgPrepTimeMin", 30)
                            ctx["delivery_enabled"] = ai_config.get("deliveryEnabled", False)

                            customer = ai_config.get("customerContext")
                            if customer:
                                ctx["customer_id"] = customer.get("id")
                        except Exception as e:
                            logger.error(f"Erreur chargement config AI: {e}")
                            ai_config = {
                                "systemPrompt": (
                                    "Tu es un assistant vocal de restaurant. "
                                    "Le menu n'est pas disponible actuellement. "
                                    "Excuse-toi et demande au client de rappeler."
                                ),
                                "tools": [],
                                "voice": "sage",
                                "customerContext": None,
                            }

                        # 2. Configurer la session OpenAI
                        await send_session_update()
                        logger.info("Session OpenAI configuree")

                        # 3. Créer le call record
                        ctx["call_id"] = await create_call_record(ctx)

                    elif data["event"] == "mark":
                        if mark_queue:
                            mark_queue.pop(0)

                    elif data["event"] == "stop":
                        logger.info("Stream arrete par Twilio")
                        await finalize_call(ctx)

            except WebSocketDisconnect:
                logger.info("Client deconnecte")
                await finalize_call(ctx)
                if openai_ws.open:
                    await openai_ws.close()

        # ------------------------------------------------
        # TASK 2: OpenAI → Twilio
        # ------------------------------------------------
        async def send_to_twilio():
            nonlocal last_assistant_item, response_start_timestamp_twilio

            try:
                async for openai_message in openai_ws:
                    response = json.loads(openai_message)
                    response_type = response.get("type", "")

                    if response_type in LOG_EVENT_TYPES:
                        logger.info(f"OpenAI: {response_type}")

                    # Audio delta → renvoyer à Twilio
                    if response_type == "response.audio.delta" and "delta" in response:
                        await websocket.send_json({
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {"payload": response["delta"]},
                        })
                        if response_start_timestamp_twilio is None:
                            response_start_timestamp_twilio = latest_media_timestamp

                    # Transcript de la réponse IA (texte)
                    if response_type == "response.audio_transcript.done":
                        text = response.get("transcript", "")
                        if text:
                            ctx["had_conversation"] = True
                            ctx["transcript"].append({
                                "role": "assistant",
                                "content": text,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })

                    # Transcript de l'input utilisateur (Whisper)
                    if response_type == "conversation.item.input_audio_transcription.completed":
                        text = response.get("transcript", "")
                        if text:
                            ctx["had_conversation"] = True
                            ctx["transcript"].append({
                                "role": "user",
                                "content": text,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })

                    # Interruption — le client parle pendant que l'IA répond
                    if response_type == "input_audio_buffer.speech_started":
                        logger.info("Client interrompt l'IA")
                        if mark_queue and response_start_timestamp_twilio is not None:
                            elapsed = latest_media_timestamp - response_start_timestamp_twilio
                            await websocket.send_json({
                                "event": "clear",
                                "streamSid": stream_sid,
                            })
                            if last_assistant_item:
                                await openai_ws.send(json.dumps({
                                    "type": "conversation.item.truncate",
                                    "item_id": last_assistant_item,
                                    "content_index": 0,
                                    "audio_end_ms": elapsed,
                                }))
                            mark_queue.clear()
                        response_start_timestamp_twilio = None

                    # Track le dernier item assistant (pour les interruptions)
                    if response_type == "response.output_item.added":
                        item = response.get("item", {})
                        if item.get("role") == "assistant":
                            last_assistant_item = item.get("id")

                    # Function calling
                    if response_type == "response.function_call_arguments.done":
                        await handle_function_call(response, openai_ws, ctx)

                    # Marquer la fin d'un segment audio
                    if response_type == "response.audio.done":
                        await websocket.send_json({
                            "event": "mark",
                            "streamSid": stream_sid,
                            "mark": {"name": "responsePart"},
                        })
                        mark_queue.append("responsePart")

            except Exception as e:
                logger.error(f"Erreur OpenAI: {e}")

        # Lancer les deux tâches en parallèle
        await asyncio.gather(receive_from_twilio(), send_to_twilio())


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY manquant dans .env")
    if not RESTAURANT_ID:
        raise ValueError("RESTAURANT_ID manquant dans .env")

    logger.info(f"Serveur vocal AlloResto demarre sur le port {PORT}")
    logger.info(f"API Next.js: {NEXT_API_URL}")
    logger.info(f"Restaurant: {RESTAURANT_ID}")
    logger.info(f"Webhook Twilio: https://VOTRE_DOMAINE/incoming-call")

    uvicorn.run(app, host="0.0.0.0", port=PORT)
