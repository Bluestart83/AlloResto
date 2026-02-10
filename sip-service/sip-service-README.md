# SIP Service — Serveur vocal VoiceOrder

## Deux modes, même `app.py`

| | Mode A : Twilio | Mode B : SIP direct |
|--|-----------------|---------------------|
| Quand | POC, pas de matériel | Ligne analogique, HT841 |
| Process | `app.py` seul | `app.py` + `sipbridge` |
| NAT | Géré par Twilio | coturn (TURN/STUN) |
| PJSIP requis | Non | Oui |
| Appels sortants | Via API Twilio | Via `POST /api/calls` (bridge) |
| Coût | ~0.008€/min Twilio | Gratuit (SIP direct) |

**`app.py` est identique dans les deux modes.** Il reçoit les mêmes events WebSocket (`start`, `media`, `mark`, `stop`), que l'audio vienne de Twilio ou du SIP bridge.

## Architecture

```
Mode A (Twilio) :
  Client → Twilio → webhook /incoming-call → WS /media-stream → OpenAI
                         (app.py)

Mode B (SIP direct) :
  Client → HT841 → SIP → sipbridge → WS /media-stream → OpenAI
                          (PJSIP)        (app.py)
```

## Fichiers

| Fichier | Description |
|---------|-------------|
| `app.py` | Proxy vocal FastAPI (Twilio webhook + WS + OpenAI Realtime) |
| `sipbridge.py` | Lib SIP bridge — classe `SipBridge` (générique, Twilio-compatible) |
| `main-sipbridge.py` | CLI argparse — configure et lance le SIP bridge |
| `start.sh` | Lance `app.py` + SIP bridge ensemble (CTRL+C arrête tout) |
| `start-sipbridge.sh` | Lance le SIP bridge seul (lit les variables d'env) |
| `requirements.txt` | Dépendances Python (mode Twilio) |
| `sip-service-requirements.txt` | Dépendances Python (mode SIP direct) |
| `SIP-BRIDGE.md` | Documentation complète du bridge SIP (API, config, protocole) |

## Quick Start

### Mode Twilio

```bash
pip install -r requirements.txt
OPENAI_API_KEY=sk-... RESTAURANT_ID=xxx python app.py
# Configurer webhook Twilio → https://DOMAINE/incoming-call
```

### Mode SIP direct

```bash
# Tout en un (app.py + sipbridge)
OPENAI_API_KEY=sk-... SIP_USERNAME=user SIP_PASSWORD=pass RESTAURANT_ID=xxx ./start.sh

# Ou séparément
python app.py                    # terminal 1 (port 5050)
./start-sipbridge.sh             # terminal 2 (port 5060)
```
