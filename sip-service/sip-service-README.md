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

## Setup

```bash
# Créer le venv et installer les dépendances
python3 -m venv venv
venv/bin/pip install -r requirements.txt

# Pour le mode SIP direct — installer pjsua2 (C extension)
venv/bin/pip install /chemin/vers/pjsua2-*.whl
# ou: venv/bin/pip install -r sip-service-requirements.txt
```

Les scripts `start.sh` et `start-sipbridge.sh` utilisent directement `venv/bin/python` (pas besoin de `source activate`).

### Configuration (.env)

Le `.env` est un symlink vers le `.env` racine du projet. Variables requises :

```bash
OPENAI_API_KEY=sk-...
RESTAURANT_ID=uuid-du-restaurant

# Mode SIP (optionnel — si absent, mode Twilio uniquement)
SIP_USERNAME=0033972360682
SIP_PASSWORD=secret
SIP_DOMAIN=sip.ovh.fr
```

Voir `start-sipbridge.sh` pour toutes les variables SIP/NAT/TURN.

## Quick Start

### Mode Twilio

```bash
# Configurer .env puis :
./start.sh
# → app.py démarre sur :5050
# → Configurer webhook Twilio → http://DOMAINE:5050/incoming-call
```

### Mode SIP direct

```bash
# Tout en un (app.py + sipbridge) — définir SIP_USERNAME dans .env
./start.sh

# Ou séparément
venv/bin/python app.py           # terminal 1 (port 5050)
./start-sipbridge.sh             # terminal 2 (port 5060)
```
