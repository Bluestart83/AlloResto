# SIP-BRIDGE.md — Documentation complète du SIP Bridge

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [API REST](#2-api-rest)
3. [Configuration](#3-configuration)
4. [Audio & Codecs](#4-audio--codecs)
5. [Callbacks HTTP](#5-callbacks-http)
6. [Appels entrants](#6-appels-entrants)
7. [Appels sortants](#7-appels-sortants)
8. [Protocole WebSocket](#8-protocole-websocket)
9. [Exemples](#9-exemples)
10. [Dépannage](#10-dépannage)

---

## 1. Vue d'ensemble

Le SIP bridge est une lib générique (`sipbridge.py`) + un CLI (`main-sipbridge.py`).
Il remplace Twilio : expose une API REST pour piloter les appels et bridge l'audio
SIP vers le même WebSocket `/media-stream` que Twilio Media Streams.

La lib ne contient aucune logique applicative — les paramètres custom
(`restaurantId`, etc.) sont passés en passthrough via `customParameters`,
exactement comme Twilio.

```
                    sipbridge
                    ┌──────────────────────────────────┐
                    │                                  │
  SIP entrant ────→ │  PJSIP                          │
                    │    ↕ Audio PCM 8kHz              │
                    │  AudioPort                       │
                    │    ↕ PCM ↔ µ-law ↔ base64       │ ──→ WS /media-stream
                    │  WsSession                       │      (app.py)
                    │    ↕ Protocole Twilio             │
  REST API ───────→ │  FastAPI (:5060)                 │
    POST /api/calls │    → Appels sortants SIP         │
    GET  /api/calls │    → Liste appels actifs         │
    DELETE /api/...  │    → Raccrocher                  │
    GET  /health    │    → Status                      │
                    │                                  │
  Callbacks ←────── │  HTTP POST vers callback_url     │
                    └──────────────────────────────────┘
```

### Fichiers

| Fichier | Rôle |
|---------|------|
| `sipbridge.py` | Lib — classe `SipBridge`, configs dataclasses, PJSIP, FastAPI |
| `main-sipbridge.py` | CLI — argparse, construit `BridgeConfig`, lance le bridge |
| `start-sipbridge.sh` | Script — lit les variables d'env, appelle le CLI |
| `start.sh` | Script — lance `app.py` + sipbridge ensemble |

---

## 2. API REST

Le service expose une API sur le port configuré (défaut: 5060).

### GET /health

Status du service.

```json
{
  "status": "ok",
  "sip_registered": true,
  "sip_account": "user@sip.twilio.com",
  "ws_target": "ws://localhost:5050/media-stream",
  "active_calls": 2,
  "max_concurrent_calls": 10,
  "audio": {
    "codec": "PCMU/8000",
    "clock_rate": 8000,
    "frame_ms": 20,
    "ec_enabled": true,
    "vad_enabled": false
  }
}
```

### GET /api/calls

Liste des appels actifs et récents (gardés 30s après raccrochage).

```json
[
  {
    "sid": "a1b2c3d4-...",
    "direction": "inbound",
    "from": "+33612345678",
    "to": "+33491234567",
    "status": "active",
    "customParams": {"restaurantId": "xxx"},
    "createdAt": "2025-01-15T14:30:00Z",
    "answeredAt": "2025-01-15T14:30:02Z",
    "endedAt": null,
    "durationSec": 0
  }
]
```

### POST /api/calls

Initier un appel sortant. Le bridge appelle le numéro en SIP, puis bridge l'audio vers le WebSocket.

```bash
curl -X POST http://localhost:5060/api/calls \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+33612345678",
    "from": "+33491234567",
    "customParams": {"restaurantId": "xxx"},
    "wsTarget": "ws://localhost:5050/media-stream",
    "callbackUrl": "http://localhost:3000/api/call-status",
    "timeoutSec": 30
  }'
```

Réponse (201) :
```json
{
  "sid": "a1b2c3d4-...",
  "direction": "outbound",
  "from": "+33491234567",
  "to": "+33612345678",
  "status": "initiated",
  "customParams": {"restaurantId": "xxx"},
  "createdAt": "2025-01-15T14:30:00Z"
}
```

**Paramètres :**

| Champ | Requis | Description |
|-------|--------|-------------|
| `to` | oui | Numéro ou SIP URI (`+33612345678` ou `sip:user@domain`) |
| `from` | | Caller ID affiché (défaut: SIP_USERNAME) |
| `customParams` | | Paramètres custom (merge avec les défauts du bridge) |
| `wsTarget` | | Override du WebSocket cible |
| `callbackUrl` | | URL de callback status pour cet appel |
| `timeoutSec` | | Timeout sonnerie en secondes (défaut: 30) |

### DELETE /api/calls/{sid}

Raccrocher un appel.

```bash
curl -X DELETE http://localhost:5060/api/calls/a1b2c3d4-...
```

---

## 3. Configuration

La configuration est passée via **arguments CLI** (pas de variables d'env dans la lib).
Le script `start-sipbridge.sh` fait le mapping env → CLI.

### Arguments CLI (main-sipbridge.py)

```
SIP:
  --sip-domain          Domaine registrar (défaut: sip.twilio.com)
  --sip-username        Username SIP (requis)
  --sip-password        Mot de passe SIP
  --sip-port            Port local (0=auto)
  --sip-transport       udp | tcp | tls (défaut: udp)
  --sip-reg-timeout     Ré-enregistrement en sec (défaut: 300)

NAT:
  --stun-server         Serveur STUN (ex: stun.l.google.com:19302)
  --turn-server         Serveur TURN
  --turn-username       Username TURN
  --turn-password       Password TURN
  --no-ice              Désactiver ICE

Audio:
  --no-ec               Désactiver echo cancellation
  --ec-tail-ms          EC tail en ms (défaut: 200)
  --vad                 Activer VAD
  --rx-gain             Gain audio reçu en dB (défaut: 0)
  --tx-gain             Gain audio envoyé en dB (défaut: 0)

Bridge:
  --ws-target           WebSocket cible (défaut: ws://localhost:5050/media-stream)
  --api-port            Port API REST (défaut: 5060)
  --no-auto-answer      Ne pas décrocher automatiquement
  --max-call-duration   Durée max appel en sec (défaut: 600, 0=illimité)
  --max-concurrent-calls  Max appels simultanés (défaut: 10)
  --param key=value     Paramètre custom (répétable)

Callbacks:
  --status-callback-url     URL callback status
  --incoming-callback-url   URL appelée avant de décrocher
  --callback-method         POST | GET (défaut: POST)
  --callback-timeout        Timeout en sec (défaut: 5)
```

### Variables d'env (start-sipbridge.sh)

Le script `start-sipbridge.sh` lit ces variables et les convertit en arguments CLI :

| Variable | Requis | Description |
|----------|--------|-------------|
| `SIP_USERNAME` | oui | Username SIP |
| `SIP_PASSWORD` | | Mot de passe SIP |
| `SIP_DOMAIN` | | Domaine registrar (défaut: sip.twilio.com) |
| `SIP_PORT` | | Port SIP local (défaut: 0) |
| `SIP_TRANSPORT` | | Transport (défaut: udp) |
| `RESTAURANT_ID` | oui | Passé en `--param restaurantId=...` |
| `WS_TARGET` | | WebSocket cible (défaut: ws://localhost:5050/media-stream) |
| `BRIDGE_API_PORT` | | Port API REST (défaut: 5060) |
| `MAX_CALL_DURATION` | | Durée max appel (défaut: 600) |
| `MAX_CONCURRENT_CALLS` | | Max simultanés (défaut: 10) |
| `STUN_SERVER` | | Serveur STUN |
| `TURN_SERVER` | | Serveur TURN |
| `TURN_USERNAME` | | Username TURN |
| `TURN_PASSWORD` | | Password TURN |
| `STATUS_CALLBACK_URL` | | URL callback status |
| `INCOMING_CALLBACK_URL` | | URL callback entrants |

---

## 4. Audio & Codecs

### Codec négocié

Le bridge force **G.711 µ-law (PCMU)** en priorité max car c'est le codec natif de Twilio Media Streams. L'audio est transmis en base64 sur le WebSocket.

Chaîne de traitement pour chaque frame (20ms) :

```
ENTRANT (client → IA) :
  SIP audio → PJSIP décode → PCM 16-bit 8kHz
    → AudioPort.onFrameReceived
    → pcm16_to_ulaw (320 bytes → 160 bytes)
    → base64 encode (160 → ~216 chars)
    → WebSocket {"event":"media","media":{"payload":"..."}}

SORTANT (IA → client) :
  WebSocket {"event":"media","media":{"payload":"..."}}
    → base64 decode → µ-law (160 bytes)
    → ulaw_to_pcm16 (160 → 320 bytes)
    → AudioPort.feed_audio (buffer)
    → AudioPort.onFrameRequested → PJSIP encode → SIP audio
```

### Echo cancellation

Activé par défaut (200ms tail). Important pour les lignes analogiques (HT841) car le coupleur FXO peut générer de l'écho. Ajuster `--ec-tail-ms` si nécessaire (100-400ms).

### Gain

Si le client est trop faible : `--rx-gain 6` (amplifie de 6dB).
Si l'IA est trop forte : `--tx-gain -3` (atténue de 3dB).

---

## 5. Callbacks HTTP

### Status callback

À chaque changement d'état d'un appel, le bridge POST vers l'URL de callback :

```json
{
  "sid": "a1b2c3d4-...",
  "direction": "inbound",
  "from": "+33612345678",
  "to": "+33491234567",
  "status": "answered",
  "customParams": {"restaurantId": "xxx"},
  "event": "answered",
  "timestamp": "2025-01-15T14:30:02Z"
}
```

**Events :** `initiated`, `ringing`, `answered`, `completed`

**Status possibles :**

| Status | Description |
|--------|-------------|
| `initiated` | Appel sortant lancé |
| `ringing` | Ça sonne |
| `answered` | Décroché |
| `active` | Media audio connecté |
| `completed` | Terminé normalement |
| `failed` | Erreur SIP (4xx/5xx) |
| `busy` | Occupé (486) |
| `no-answer` | Pas de réponse (408/480) |
| `cancelled` | Raccroché via API |

### Incoming callback

Pour les appels entrants, le bridge peut appeler l'URL de callback AVANT de décrocher. Cela permet au backend de :
- Décider d'accepter ou rejeter (numéro bloqué, hors horaires...)
- Override les customParams (router vers un autre restaurant, etc.)
- Choisir un WebSocket différent

**Requête envoyée :**
```json
{
  "from": "+33612345678",
  "to": "+33491234567",
  "timestamp": "2025-01-15T14:30:00Z"
}
```

**Réponse attendue :**

```json
// Accepter (défaut)
{ "action": "accept" }

// Accepter avec override
{
  "action": "accept",
  "customParams": {"restaurantId": "autre-resto"},
  "wsTarget": "ws://autre-serveur/media-stream",
  "callbackUrl": "http://mon-backend/status"
}

// Rejeter
{ "action": "reject", "statusCode": 486 }

// Ignorer (ne pas décrocher, laisser sonner)
{ "action": "ignore" }
```

---

## 6. Appels entrants

Flow complet d'un appel entrant :

```
1. SIP INVITE arrive
2. PJSIP → _SipAccountHandler.onIncomingCall()
3. Vérif max_concurrent_calls → 486 Busy si dépassé
4. CallRecord créé (status=ringing)
5. Si incoming-callback-url configuré :
   → POST vers l'URL
   → Attend décision (accept/reject/ignore)
   → Override customParams/wsTarget si fourni
6. Si auto-answer → répondre 200 OK
7. Media connecté → AudioPort branché
8. WsSession démarre :
   → Connexion WebSocket vers app.py
   → Event "start" avec callerPhone + customParameters
   → Audio bidirectionnel
9. Client raccroche → Event "stop"
10. CallRecord mis à jour (duration, status)
11. Callback "completed" si configuré
12. Nettoyage après 30s
```

---

## 7. Appels sortants

Cas d'usage :
- Rappeler un client dont la commande est prête
- Confirmer une réservation
- Appel de test

```bash
# Appeler un client
curl -X POST http://localhost:5060/api/calls \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+33612345678",
    "customParams": {"restaurantId": "pizza-bella-napoli"}
  }'
```

Flow :
```
1. POST /api/calls reçu
2. PJSIP envoie SIP INVITE
3. Callback "initiated"
4. Le téléphone sonne → callback "ringing"
5. Le client décroche → callback "answered"
6. Media connecté → WsSession vers app.py
7. app.py reçoit la connexion comme un appel Twilio normal
8. OpenAI Realtime conversation
9. Fin d'appel → callback "completed"
```

---

## 8. Protocole WebSocket

Le protocole est **100% identique à Twilio Media Streams**. `app.py` ne peut pas distinguer si l'audio vient de Twilio ou du SIP bridge.

### Events émis (bridge → app.py)

**start** — Début d'appel
```json
{
  "event": "start",
  "start": {
    "streamSid": "a1b2c3d4-...",
    "accountSid": "PJSIP-LOCAL",
    "callSid": "a1b2c3d4-...",
    "customParameters": {
      "callerPhone": "+33612345678",
      "direction": "inbound",
      "to": "+33491234567",
      "restaurantId": "xxx"
    }
  }
}
```

**media** — Audio (toutes les 20ms)
```json
{
  "event": "media",
  "media": {
    "payload": "//uQ...",
    "timestamp": 0
  }
}
```

**stop** — Fin d'appel
```json
{ "event": "stop" }
```

### Events reçus (app.py → bridge)

**media** — Audio IA
```json
{
  "event": "media",
  "streamSid": "a1b2c3d4-...",
  "media": { "payload": "//uQ..." }
}
```

**clear** — Interruption (vider le buffer audio)
```json
{
  "event": "clear",
  "streamSid": "a1b2c3d4-..."
}
```

**mark** — Marqueur fin de segment
```json
{
  "event": "mark",
  "streamSid": "a1b2c3d4-...",
  "mark": { "name": "responsePart" }
}
```

---

## 9. Exemples

### Lancement rapide

```bash
# Tout en un (app.py + sipbridge)
OPENAI_API_KEY=sk-... \
SIP_USERNAME=33491234567 \
SIP_PASSWORD=s3cr3t \
RESTAURANT_ID=pizza-bella-napoli \
./start.sh
```

### CLI avancé

```bash
python main-sipbridge.py \
    --sip-domain sip.trunk-provider.com \
    --sip-username 33491234567 \
    --sip-password s3cr3t \
    --param restaurantId=pizza-bella-napoli \
    --param tenantId=acme-corp \
    --stun-server stun.l.google.com:19302 \
    --status-callback-url http://localhost:3000/api/sip/status \
    --incoming-callback-url http://localhost:3000/api/sip/incoming
```

### Appel sortant avec callback

```bash
# Lancer un appel
curl -X POST http://localhost:5060/api/calls \
  -d '{"to":"+33612345678","callbackUrl":"http://mon-backend/status"}'

# Surveiller le status
curl http://localhost:5060/api/calls

# Raccrocher
curl -X DELETE http://localhost:5060/api/calls/SID_DE_LAPPEL
```

### Monitoring

```bash
# Health check
curl http://localhost:5060/health

# Nombre d'appels en cours
curl -s http://localhost:5060/api/calls | python3 -c "
import json,sys
calls = json.load(sys.stdin)
active = [c for c in calls if c['status'] in ('active','answered')]
print(f'{len(active)} appels actifs')
"
```

---

## 10. Dépannage

### pjsua2 non disponible

pjsua2 est une C extension compilée pour une version **spécifique** de Python. Le wheel `cp312` ne marche pas avec Python 3.13.

```bash
# Vérifier la version du venv
venv/bin/python --version

# Installer le bon wheel (doit matcher cpXYZ)
venv/bin/pip install /chemin/vers/pjsua2-2.14.0-cp312-cp312-macosx_26_0_arm64.whl

# Tester
venv/bin/python -c "import pjsua2 as pj; print('OK')"
```

Si la version ne matche pas : recréer le venv avec la bonne version de Python, ou recompiler pjsua2.

### PJSIP ne s'enregistre pas

```bash
# Vérifier le health
curl http://localhost:5060/health
# → sip_registered: false

# Vérifier le DNS
nslookup sip.ovh.fr

# Vérifier le port
netstat -ulnp | grep 5060
```

### Pas d'audio

1. Vérifier que PCMU est le codec négocié (logs PJSIP)
2. Vérifier les ports RTP ouverts (10000-20000/udp)
3. Tester avec TURN si derrière un NAT restrictif
4. Vérifier `--no-ec` — désactiver si l'écho est pire

### Appel sortant échoue

```bash
# Vérifier que le trunk SIP autorise les appels sortants
# Certains trunks SIP n'autorisent que les entrants

# Vérifier le format du numéro
# Utiliser le format E.164 : +33612345678
# Ou un SIP URI complet : sip:+33612345678@sip.domain.com
```

### WebSocket ne se connecte pas

```bash
# Vérifier que app.py tourne
curl http://localhost:5050/

# Vérifier --ws-target
# Si app.py est sur un autre serveur, utiliser l'IP/domaine
```

### Latence audio

- Vérifier la connexion internet (< 50ms ping vers le trunk SIP)
- Réduire `--ec-tail-ms` si pas d'écho (100ms au lieu de 200ms)
- Utiliser STUN au lieu de TURN si possible (évite le relay)
- `frame_ms=20` est optimal — ne pas changer
