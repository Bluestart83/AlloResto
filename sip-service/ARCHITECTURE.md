# Architecture SIP Service — AlloResto

## Vue d'ensemble

Le service vocal AlloResto transforme un appel téléphonique en commande vocale IA.
Trois processus coopèrent par restaurant :

```
Appel SIP (OVH/Twilio)
        │
        ▼
┌─────────────────┐      WebSocket        ┌─────────────────┐      WebSocket       ┌──────────────┐
│  main-sipbridge │  ──────────────────►   │     app.py      │  ──────────────────►  │  OpenAI      │
│  (pjsip + REST) │  Twilio Media Stream   │  (FastAPI proxy) │  Realtime API        │  Realtime    │
│  port: 506x     │  ◄──────────────────   │  port: 505x     │  ◄──────────────────  │  GPT-4o      │
└─────────────────┘      audio µ-law       └─────────────────┘      audio + tools    └──────────────┘
        │                                          │
        │ /health, /api/calls                      │ /incoming-call (TwiML)
        ▼                                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    service_manager.py                             │
│         FastAPI admin API (port 8090)                             │
│         - Découverte restaurants via GET /api/sip/agents          │
│         - Spawn/kill des processus app.py + sipbridge            │
│         - Health monitoring (30s loop)                            │
│         - Auto-restart (max 3x / 5 min)                          │
└──────────────────────────────────────────────────────────────────┘
        │
        │ GET /agents, POST /agents/{id}/start|stop|restart
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js (port 3000)                            │
│         - /api/sip/agents → liste restaurants SIP-enabled        │
│         - /api/admin/servers → proxy vers service_manager        │
│         - /admin/servers → page admin "Serveurs Vocaux"          │
│         - /place/[id]/settings → config SIP par restaurant       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Fichiers Python

| Fichier | Rôle | Port par défaut |
|---|---|---|
| `app.py` | Proxy OpenAI Realtime. Reçoit l'audio Twilio/sipbridge en WebSocket, le forward à OpenAI, renvoie les réponses audio. Expose aussi `/incoming-call` (TwiML) pour Twilio. | 5050+ |
| `sipbridge.py` | Bibliothèque SIP Bridge (pjsip/pjsua2). Gère l'enregistrement SIP, décroche les appels, pont audio SIP ↔ WebSocket (protocole Twilio Media Streams). REST API : `/health`, `/api/calls`. | 5060+ |
| `main-sipbridge.py` | CLI entry point pour sipbridge.py. Parse les args (`--sip-domain`, `--sip-username`, `--sip-password`, etc.) et lance `SipBridge.run()`. | - |
| `service_manager.py` | Daemon principal. Découvre les restaurants, spawn les processus, monitoring, API admin. | 8090 |

---

## Flux de démarrage du Service Manager

```
1. Chargement .env (dotenv)
2. Démarrage uvicorn (API admin) sur SERVICE_MANAGER_PORT
3. Refresh initial (background, non-bloquant) :
   a. GET http://localhost:3000/api/sip/agents
   b. Pour chaque restaurant retourné :
      - Alloue ports (app: 505x, bridge: 506x)
      - Spawn app.py avec env: PORT, RESTAURANT_ID, OPENAI_API_KEY
      - Si sipBridge=true : spawn main-sipbridge.py avec args SIP
      - Attend /health du bridge (timeout 30s)
4. Boucles background :
   - health_loop : toutes les 30s, vérifie /health des processus
   - refresh_loop : toutes les 300s, resync avec la DB
```

---

## Configuration (.env)

```bash
# Obligatoire
OPENAI_API_KEY=sk-...
ENCRYPTION_KEY=<64-char hex>   # AES-256-GCM pour mots de passe SIP en BDD

# Service Manager
SERVICE_MANAGER_PORT=8090      # Port API admin
APP_BASE_PORT=5050             # Port de départ pour app.py
BRIDGE_BASE_PORT=5060          # Port de départ pour sipbridge
MAX_CALL_DURATION=600          # Durée max d'un appel en sec (défaut: 600 = 10 min, 0=illimité)

# Next.js
NEXT_API_URL=http://localhost:3000    # Utilisé par le service manager
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SERVICE_MANAGER_URL=http://localhost:8090  # Utilisé par l'admin web

# SIP (fallback global, chaque restaurant a ses propres credentials en BDD)
SIP_DOMAIN=sip.ovh.fr
SIP_USERNAME=0033972360682
SIP_PASSWORD=...
RESTAURANT_ID=...              # Uniquement pour lancement manuel de app.py
```

---

## Base de données (TypeORM / SQLite)

### Restaurant
- `sipEnabled` (bool, default false) — active la découverte par le service manager
- `sipBridge` (bool, default false) — true=SIP Bridge (pjsip), false=Twilio webhook

### PhoneLine
- `restaurantId` — FK vers Restaurant
- `phoneNumber` — numéro affiché
- `provider` — "sip" ou "twilio"
- `sipDomain`, `sipUsername`, `sipPassword` (chiffré AES-256-GCM)
- `twilioTrunkSid` — pour le mode Twilio
- `isActive` — la ligne est-elle active ?

### Chiffrement SIP
- Service : `web/src/services/sip-encryption.service.ts`
- Algo : AES-256-GCM + PBKDF2(masterKey, phoneLineId, 100000, sha256)
- Format stocké : `iv:authTag:ciphertext` (base64)
- `ENCRYPTION_KEY` partagée entre Next.js et sip-service

---

## API Next.js

| Route | Méthode | Rôle |
|---|---|---|
| `/api/sip/agents` | GET | Retourne les restaurants `sipEnabled=true` avec credentials SIP déchiffrées. **Utilisé par le service manager.** |
| `/api/phone-lines` | GET | Config téléphone d'un restaurant (sans password). Params: `restaurantId` |
| `/api/phone-lines` | PUT | Crée/met à jour phone line + sipEnabled + sipBridge |
| `/api/admin/servers` | GET | Proxy : merge DB restaurants + statut live du service manager |
| `/api/admin/servers` | POST | Proxy : actions start/stop/restart/refresh vers service manager |

---

## API Service Manager (FastAPI)

| Route | Méthode | Rôle |
|---|---|---|
| `/health` | GET | `{status, activeAgents, totalAgents, totalActiveCalls, uptimeSeconds}` |
| `/agents` | GET | Liste agents avec state, ports, PIDs, uptime, activeCalls, restartCount |
| `/agents/{id}/status` | GET | Détail d'un agent (inclut health sipbridge) |
| `/agents/{id}/start` | POST | Démarre un agent |
| `/agents/{id}/stop` | POST | Arrête un agent |
| `/agents/{id}/restart` | POST | Restart un agent |
| `/refresh` | POST | Re-fetch la liste des restaurants depuis l'API Next.js |

---

## Pages Web (Next.js App Router)

| Route | Rôle |
|---|---|
| `/admin/servers` | Tableau des serveurs vocaux : nom, statut, appels, mode, uptime, actions |
| `/place/[restaurantId]/settings` | Config SIP : switch sipEnabled, mode SIP/Twilio, credentials, save |

---

## Problèmes connus

### 1. Processus pjsip zombies (UE state)
Les processus sipbridge utilisant pjsua2 peuvent rester en état "UE" (uninterruptible sleep)
après un `kill -9`. Ils occupent les ports SIP (5060-506x) indéfiniment.

**Impact** : Le service manager alloue de nouveaux ports à chaque restart, mais les anciens
ne se libèrent qu'au reboot de la machine.

**Workaround** : Le PortPool du service manager skip automatiquement les ports occupés.

### 2. Health check sipbridge timeout
Le sipbridge met parfois plus de 30s à devenir opérationnel (initialisation pjsip lente,
enregistrement SIP qui échoue...). Le service manager considère alors le démarrage comme
échoué et stop/restart l'agent.

**Impact** : Boucle de restart si le registrar SIP ne répond pas.

**Piste** : Augmenter le timeout ou rendre le health check plus progressif (process alive = starting,
HTTP ok = running).

### 3. Ctrl+C bloqué
Le graceful shutdown peut rester bloqué si `stop_all()` attend des processus pjsip zombies.

**Fix actuel** : `os._exit(0)` après 10s de timeout sur le signal handler.

### 4. Gestion des ports
Les ports sont alloués séquentiellement depuis APP_BASE_PORT et BRIDGE_BASE_PORT.
Si des ports sont occupés (anciens processus zombies), le pool les skip via un test `socket.bind`.
En développement, un reboot peut être nécessaire pour nettoyer les ports.

---

## Durée max d'appel (MAX_CALL_DURATION)

Défaut : **600 secondes (10 minutes)**, configurable via env `MAX_CALL_DURATION`.
Valeur `0` = illimité.

Double sécurité à deux niveaux :

| Niveau | Fichier | Mécanisme |
|---|---|---|
| SIP Bridge | `sipbridge.py` | Timer interne pjsip : raccroche l'appel SIP après `max_call_duration` secondes |
| Proxy audio | `app.py` | Watchdog asyncio : ferme le WebSocket OpenAI + finalise le call record après `MAX_CALL_DURATION` secondes |

Le service manager passe le paramètre `--max-call-duration` au sipbridge lors du spawn.
app.py lit `MAX_CALL_DURATION` depuis son env (transmis par le service manager).

---

## Modes de fonctionnement

### Mode SIP Bridge (`sipBridge = true`)
```
Appel entrant SIP (OVH) → sipbridge (pjsip) → WebSocket → app.py → OpenAI
```
- Nécessite : sipDomain, sipUsername, sipPassword
- 2 processus : app.py + main-sipbridge.py
- Le sipbridge gère l'enregistrement SIP et le pont audio

### Mode Twilio (`sipBridge = false`)
```
Appel entrant Twilio → webhook /incoming-call → TwiML → WebSocket → app.py → OpenAI
```
- Nécessite : numéro Twilio configuré pour webhook vers app.py
- 1 seul processus : app.py
- Twilio gère le SIP, app.py gère juste le proxy audio

---

## Démarrage en développement

```bash
# Terminal 1 : Next.js
cd web && npm run dev

# Terminal 2 : Service Manager
cd sip-service && ./venv/bin/python service_manager.py

# Vérification
curl http://localhost:8090/health
curl http://localhost:8090/agents
# Puis ouvrir http://localhost:3000/admin/servers
```

Pour lancer manuellement un sipbridge (debug) :
```bash
cd sip-service
./venv/bin/python main-sipbridge.py \
  --sip-domain sip.ovh.fr \
  --sip-username 0033972360682 \
  --sip-password <password> \
  --ws-target ws://localhost:5050/media-stream \
  --api-port 5060 \
  --param restaurantId=<uuid>
```
