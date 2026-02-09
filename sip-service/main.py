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
"""

import os
import json
import base64
import asyncio
import websockets
from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.websockets import WebSocketDisconnect
from twilio.twiml.voice_response import VoiceResponse, Connect, Say, Stream
from dotenv import load_dotenv
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
VOICE = "sage"  # Options: alloy, ash, ballad, coral, echo, sage, shimmer, verse

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
# MENU DU RESTAURANT (à terme: chargé depuis une BDD/API)
# ============================================================

RESTAURANT_NAME = "Chez Marco"

MENU = """
🍕 PIZZAS:
- Margherita: 9€
- Quatre Fromages: 11€ 
- Regina (jambon, champignons): 10€
- Calzone: 12€

🥗 SALADES:
- César: 8€
- Italienne: 7€

🍝 PÂTES:
- Carbonara: 10€
- Bolognaise: 9€
- Pesto: 9€

🥤 BOISSONS:
- Coca-Cola (33cl): 2.50€
- Orangina (33cl): 2.50€
- Eau minérale (50cl): 1.50€
- Bière pression (25cl): 3€

🍰 DESSERTS:
- Tiramisu: 6€
- Panna Cotta: 5€
"""

# ============================================================
# SYSTEM PROMPT - Le cœur de l'IA
# ============================================================

SYSTEM_MESSAGE = f"""
Tu es l'assistant vocal de "{RESTAURANT_NAME}" pour la prise de commande téléphonique.

## Ton rôle
- Accueillir chaleureusement le client
- Prendre sa commande à partir du menu
- Confirmer chaque article ajouté
- Récapituler la commande complète avec le total
- Demander si c'est pour livraison ou retrait sur place
- Si livraison: demander l'adresse et le numéro de téléphone
- Proposer un créneau de retrait/livraison (30-45 min)

## Le menu
{MENU}

## Règles importantes
- Parle TOUJOURS en français
- Sois naturel, chaleureux et concis (c'est un appel téléphone, pas un chat)
- Si le client demande quelque chose hors menu, dis poliment que ce n'est pas disponible
- Calcule toujours le total au fur et à mesure
- Quand la commande est finalisée, utilise la fonction confirm_order pour l'enregistrer
- Tu peux gérer les modifications ("en fait non, remplace la Margherita par une Calzone")
- Si le client demande des infos (horaires, allergènes), réponds au mieux

## Style vocal
- Phrases courtes
- Pas de listes à puces (c'est de l'audio!)
- Confirme chaque item: "Parfait, une Margherita à 9 euros, c'est noté!"
- Récapitule naturellement: "Alors on a une Margherita, une César et deux Cocas, ça fait 22 euros au total"

## Horaires
Le restaurant est ouvert du mardi au dimanche, de 11h30 à 14h et de 18h30 à 22h30.
Livraison possible dans un rayon de 5km.
"""

# ============================================================
# TOOLS / FUNCTION CALLING
# ============================================================

TOOLS = [
    {
        "type": "function",
        "name": "confirm_order",
        "description": "Enregistre la commande finalisée du client. Appeler quand le client a confirmé sa commande complète.",
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "Liste des articles commandés",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Nom de l'article"},
                            "quantity": {"type": "integer", "description": "Quantité"},
                            "unit_price": {"type": "number", "description": "Prix unitaire en euros"},
                            "notes": {"type": "string", "description": "Modifications (ex: sans oignons)"},
                        },
                        "required": ["name", "quantity", "unit_price"],
                    },
                },
                "total": {"type": "number", "description": "Total de la commande en euros"},
                "order_type": {
                    "type": "string",
                    "enum": ["pickup", "delivery"],
                    "description": "Retrait sur place ou livraison",
                },
                "customer_name": {"type": "string", "description": "Nom du client"},
                "customer_phone": {"type": "string", "description": "Numéro de téléphone du client"},
                "delivery_address": {"type": "string", "description": "Adresse de livraison (si livraison)"},
                "estimated_time": {"type": "string", "description": "Heure estimée de retrait/livraison"},
            },
            "required": ["items", "total", "order_type"],
        },
    }
]

# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI()


@app.get("/", response_class=HTMLResponse)
async def index():
    return "<h1>🍕 Serveur vocal {}</h1><p>Le serveur tourne. Appelez le numéro Twilio!</p>".format(
        RESTAURANT_NAME
    )


@app.api_route("/incoming-call", methods=["GET", "POST"])
async def incoming_call(request: Request):
    """
    Twilio appelle cette URL quand un appel arrive.
    On répond avec du TwiML qui connecte l'appel à notre WebSocket.
    """
    response = VoiceResponse()
    response.say(
        f"Bienvenue chez {RESTAURANT_NAME}, veuillez patienter, je vous mets en relation avec notre assistant.",
        voice="Google.fr-FR-Wavenet-A",
        language="fr-FR",
    )
    response.pause(length=1)

    host = request.headers.get("host", request.url.hostname)
    connect = Connect()
    stream = Stream(url=f"wss://{host}/media-stream")
    connect.append(stream)
    response.append(connect)

    return HTMLResponse(content=str(response), media_type="application/xml")


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
    logger.info("📞 Nouvel appel connecté au WebSocket")

    # Connexion à OpenAI Realtime API
    openai_ws_url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "OpenAI-Beta": "realtime=v1",
    }

    async with websockets.connect(openai_ws_url, additional_headers=headers) as openai_ws:
        # State
        stream_sid = None
        latest_media_timestamp = 0
        last_assistant_item = None
        mark_queue = []
        response_start_timestamp_twilio = None

        # Envoyer la config de session à OpenAI
        await send_session_update(openai_ws)
        logger.info("✅ Session OpenAI configurée")

        # ------------------------------------------------
        # TASK 1: Recevoir l'audio de Twilio → OpenAI
        # ------------------------------------------------
        async def receive_from_twilio():
            nonlocal stream_sid, latest_media_timestamp
            try:
                async for message in websocket.iter_text():
                    data = json.loads(message)

                    if data["event"] == "media" and openai_ws.open:
                        latest_media_timestamp = int(data["media"]["timestamp"])
                        audio_append = {
                            "type": "input_audio_buffer.append",
                            "audio": data["media"]["payload"],
                        }
                        await openai_ws.send(json.dumps(audio_append))

                    elif data["event"] == "start":
                        stream_sid = data["start"]["streamSid"]
                        logger.info(f"📡 Stream démarré: {stream_sid}")
                        latest_media_timestamp = 0
                        response_start_timestamp_twilio = None

                    elif data["event"] == "mark":
                        if mark_queue:
                            mark_queue.pop(0)

            except WebSocketDisconnect:
                logger.info("📴 Client déconnecté")
                if openai_ws.open:
                    await openai_ws.close()

        # ------------------------------------------------
        # TASK 2: Recevoir la réponse d'OpenAI → Twilio
        # ------------------------------------------------
        async def send_to_twilio():
            nonlocal stream_sid, last_assistant_item, response_start_timestamp_twilio

            try:
                async for openai_message in openai_ws:
                    response = json.loads(openai_message)
                    response_type = response.get("type", "")

                    if response_type in LOG_EVENT_TYPES:
                        logger.info(f"🤖 OpenAI event: {response_type}")

                    # Audio de la réponse → renvoyer à Twilio
                    if response_type == "response.audio.delta" and "delta" in response:
                        audio_payload = base64.b64encode(
                            base64.b64decode(response["delta"])
                        ).decode("utf-8")
                        audio_delta = {
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {"payload": audio_payload},
                        }
                        await websocket.send_json(audio_delta)

                        if response_start_timestamp_twilio is None:
                            response_start_timestamp_twilio = latest_media_timestamp

                    # Gestion des interruptions (le client parle pendant que l'IA parle)
                    if response_type == "input_audio_buffer.speech_started":
                        logger.info("🗣️ Client interrompt l'IA")
                        await handle_speech_started_event(
                            websocket, openai_ws, stream_sid, 
                            response_start_timestamp_twilio, latest_media_timestamp,
                            last_assistant_item, mark_queue
                        )
                        response_start_timestamp_twilio = None

                    # Track le dernier item assistant pour les interruptions
                    if response_type == "response.output_item.added":
                        item = response.get("item", {})
                        if item.get("role") == "assistant":
                            last_assistant_item = item.get("id")

                    # Function calling - commande confirmée!
                    if response_type == "response.function_call_arguments.done":
                        await handle_function_call(response, openai_ws)

                    if response_type == "response.audio.done":
                        # Marquer la fin de la réponse audio
                        mark_event = {
                            "event": "mark",
                            "streamSid": stream_sid,
                            "mark": {"name": "responsePart"},
                        }
                        await websocket.send_json(mark_event)
                        mark_queue.append("responsePart")

            except Exception as e:
                logger.error(f"❌ Erreur OpenAI: {e}")

        # Lancer les deux tâches en parallèle
        await asyncio.gather(receive_from_twilio(), send_to_twilio())


# ============================================================
# HELPERS
# ============================================================


async def send_session_update(openai_ws):
    """Configure la session OpenAI Realtime avec le prompt resto et les tools."""
    session_update = {
        "type": "session.update",
        "session": {
            "turn_detection": {"type": "server_vad"},
            "input_audio_format": "g711_ulaw",
            "output_audio_format": "g711_ulaw",
            "voice": VOICE,
            "instructions": SYSTEM_MESSAGE,
            "modalities": ["text", "audio"],
            "temperature": 0.7,
            "tools": TOOLS,
            "tool_choice": "auto",
            "input_audio_transcription": {
                "model": "whisper-1",
            },
        },
    }
    await openai_ws.send(json.dumps(session_update))

    # Déclencher le message d'accueil
    initial_conversation_item = {
        "type": "conversation.item.create",
        "item": {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "Salue le client qui vient d'appeler. Présente-toi brièvement et demande-lui ce qu'il souhaite commander. Sois chaleureux et concis.",
                }
            ],
        },
    }
    await openai_ws.send(json.dumps(initial_conversation_item))
    await openai_ws.send(json.dumps({"type": "response.create"}))


async def handle_speech_started_event(
    websocket, openai_ws, stream_sid, 
    response_start_timestamp_twilio, latest_media_timestamp,
    last_assistant_item, mark_queue
):
    """Gère l'interruption: le client parle pendant que l'IA répond."""
    if mark_queue and response_start_timestamp_twilio is not None:
        elapsed_time = latest_media_timestamp - response_start_timestamp_twilio

        # Vider le buffer audio de Twilio
        await websocket.send_json({"event": "clear", "streamSid": stream_sid})

        # Tronquer la réponse OpenAI
        if last_assistant_item:
            truncate_event = {
                "type": "conversation.item.truncate",
                "item_id": last_assistant_item,
                "content_index": 0,
                "audio_end_ms": elapsed_time,
            }
            await openai_ws.send(json.dumps(truncate_event))

        mark_queue.clear()


async def handle_function_call(response, openai_ws):
    """
    Traite les function calls d'OpenAI (ex: confirm_order).
    C'est ici que tu envoies la commande à ton dashboard Next.js!
    """
    function_name = response.get("name", "")
    call_id = response.get("call_id", "")
    
    try:
        arguments = json.loads(response.get("arguments", "{}"))
    except json.JSONDecodeError:
        arguments = {}

    logger.info(f"📋 Function call: {function_name}")
    logger.info(f"📦 Arguments: {json.dumps(arguments, indent=2, ensure_ascii=False)}")

    if function_name == "confirm_order":
        # =============================================
        # 🚀 ICI: Envoie la commande à ton backend!
        # =============================================
        # Exemples:
        # - POST vers ton API Next.js
        # - WebSocket vers ton dashboard
        # - Sauvegarde en BDD
        # - Envoi d'une notification push au resto
        #
        # import httpx
        # async with httpx.AsyncClient() as client:
        #     await client.post("https://ton-dashboard.com/api/orders", json=arguments)
        
        order_total = arguments.get("total", 0)
        items_count = len(arguments.get("items", []))
        
        logger.info(f"✅ COMMANDE CONFIRMÉE: {items_count} articles, total {order_total}€")

        # Répondre à OpenAI que la fonction a réussi
        function_output = {
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps({
                    "success": True,
                    "order_id": "CMD-" + str(hash(json.dumps(arguments)))[-6:],
                    "message": f"Commande de {order_total}€ enregistrée avec succès",
                    "estimated_time": "35 minutes",
                }),
            },
        }
        await openai_ws.send(json.dumps(function_output))
        await openai_ws.send(json.dumps({"type": "response.create"}))


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    if not OPENAI_API_KEY:
        raise ValueError("❌ OPENAI_API_KEY manquant dans .env")
    
    logger.info(f"🍕 Serveur vocal '{RESTAURANT_NAME}' démarré sur le port {PORT}")
    logger.info(f"📞 Configurez Twilio webhook vers: https://VOTRE_DOMAINE/incoming-call")
    
    uvicorn.run(app, host="0.0.0.0", port=PORT)
