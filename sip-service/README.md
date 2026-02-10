# SIP Service — Proxy vocal + Bridge SIP

Service téléphonique Python : reçoit les appels (Twilio ou SIP direct),
les connecte à OpenAI Realtime API pour la prise de commande vocale.

## Architecture

```
Mode A (Twilio) :
  Client → Twilio → webhook /incoming-call → WS /media-stream → OpenAI
                         (app.py)

Mode B (SIP direct) :
  Client → HT841 → SIP → sipbridge → WS /media-stream → OpenAI
                          (PJSIP)        (app.py)
```

`app.py` est identique dans les deux modes. Il reçoit les mêmes events
WebSocket (`start`, `media`, `mark`, `stop`), que l'audio vienne de
Twilio ou du SIP bridge.

## Fichiers

| Fichier | Description |
|---------|-------------|
| `app.py` | Proxy vocal FastAPI (Twilio webhook + WS + OpenAI Realtime) |
| `sipbridge.py` | Lib SIP bridge — classe `SipBridge` + configs (générique, Twilio-compatible) |
| `main-sipbridge.py` | CLI argparse — lance le SIP bridge avec les bons paramètres |
| `start.sh` | Lance `app.py` + SIP bridge ensemble |
| `start-sipbridge.sh` | Lance le SIP bridge seul |
| `requirements.txt` | Dépendances Python (mode Twilio) |
| `sip-service-requirements.txt` | Dépendances Python (mode SIP) |
| `SIP-BRIDGE.md` | Documentation complète du bridge SIP |

## Prérequis

- Python 3.10+
- Compte OpenAI avec accès Realtime API
- (Mode SIP) pjsua2 compilé avec support Python

## Installation

```bash
pip install -r requirements.txt
# Mode SIP : pip install -r sip-service-requirements.txt
```

## Lancement

### Mode Twilio (app.py seul)

```bash
OPENAI_API_KEY=sk-... RESTAURANT_ID=xxx python app.py
# Configurer webhook Twilio → https://DOMAINE/incoming-call
```

### Mode SIP direct (app.py + sipbridge)

```bash
# Tout en un
OPENAI_API_KEY=sk-... SIP_USERNAME=user SIP_PASSWORD=pass RESTAURANT_ID=xxx ./start.sh

# Ou séparément
python app.py                    # terminal 1 (port 5050)
./start-sipbridge.sh             # terminal 2 (port 5060)
```

### CLI SIP bridge (avancé)

```bash
python main-sipbridge.py \
    --sip-username 33491234567 \
    --sip-password s3cr3t \
    --sip-domain sip.trunk.com \
    --param restaurantId=pizza-napoli \
    --param tenantId=acme
```

## Communication avec le Dashboard

Le service appelle l'API Next.js via HTTP :

```
GET  http://localhost:3000/api/ai              → system prompt + tools + context
POST http://localhost:3000/api/availability/check → vérification dispo
POST http://localhost:3000/api/customers        → lookup/create client
POST http://localhost:3000/api/calls            → log appel
POST http://localhost:3000/api/orders           → créer commande
POST http://localhost:3000/api/reservations     → créer réservation
POST http://localhost:3000/api/messages         → laisser un message
POST http://localhost:3000/api/faq              → remonter question FAQ
```
