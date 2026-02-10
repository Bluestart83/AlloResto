# SIP Service — AlloResto

Service vocal IA pour restaurants : proxy OpenAI Realtime + pont SIP (pjsip).

## Architecture

```
                 ┌──────────────────────────────────────────┐
                 │          Service Manager (:8080)          │
                 │  Découvre les restaurants via l'API       │
                 │  Démarre/arrête/surveille les agents      │
                 └──────┬──────────────┬────────────────────┘
                        │              │
              ┌─────────▼──┐   ┌───────▼────────┐
              │  app.py     │   │  sipbridge      │
              │  (:5050+)   │   │  (:5060+)       │
              │  OpenAI     │◄──│  SIP ↔ WS       │
              │  Realtime   │   │  (pjsip/pjsua2) │
              └──────┬──────┘   └────────┬────────┘
                     │                   │
              ┌──────▼──────┐    ┌───────▼────────┐
              │  Next.js    │    │  Trunk SIP      │
              │  API (:3000)│    │  (OVH, Twilio…) │
              └─────────────┘    └─────────────────┘
```

**Deux modes par restaurant :**

| Mode | Processus | Flux audio |
|------|-----------|------------|
| **SIP Bridge** (`sipBridge: true`) | app.py + sipbridge | Client → Trunk SIP → sipbridge → WS → OpenAI |
| **Twilio** (`sipBridge: false`) | app.py seul | Client → Twilio → webhook → WS → OpenAI |

`app.py` est identique dans les deux modes. Il reçoit les mêmes events
WebSocket (`start`, `media`, `mark`, `stop`).

---

## Service Manager

Le **service manager** remplace les scripts shell (`test.sh`). C'est un processus
unique qui gère tous les restaurants.

### Ce qu'il fait

1. Appelle `GET /api/sip/agents` pour découvrir les restaurants actifs
2. Alloue des ports automatiquement (5050, 5051… / 5060, 5061…)
3. Démarre app.py + sipbridge par restaurant
4. Surveille la santé toutes les 30s (auto-restart si crash, backoff exponentiel)
5. Rafraîchit la liste toutes les 5 min (détecte ajouts/suppressions)
6. Expose une API admin REST sur le port 8080

### API Admin

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/health` | Santé globale du manager |
| `GET` | `/agents` | Liste tous les agents (état, ports, appels) |
| `GET` | `/agents/{id}/status` | Détail d'un agent (force health check) |
| `POST` | `/agents/{id}/start` | Démarrer un agent |
| `POST` | `/agents/{id}/stop` | Arrêter un agent |
| `POST` | `/agents/{id}/restart` | Redémarrer un agent |
| `POST` | `/refresh` | Rafraîchir la liste depuis la BDD |

```bash
# Exemples
curl http://localhost:8080/health
curl http://localhost:8080/agents
curl -X POST http://localhost:8080/agents/<restaurant-id>/restart
```

### Interface Admin (Backoffice)

Page **Serveurs Vocaux** : `http://localhost:3000/admin/servers`

- Tableau avec état, appels en cours, mode (SIP/Twilio), uptime, ports
- Recherche par nom de client
- Tri par nom, état, nombre d'appels
- Actions start/stop/restart
- Rafraîchissement auto toutes les 10s

---

## Prérequis

- Python 3.12+
- Compte OpenAI avec accès Realtime API
- (Mode SIP) pjsua2 compilé avec support Python
- Next.js doit tourner (`cd web && npm run dev`)

## Installation

```bash
cd sip-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Configuration

Variables d'environnement (`.env`) :

| Variable | Requis | Défaut | Description |
|----------|--------|--------|-------------|
| `OPENAI_API_KEY` | Oui | — | Clé API OpenAI |
| `ENCRYPTION_KEY` | Oui | — | Clé de chiffrement (64 car. hex) |
| `NEXT_API_URL` | Non | `http://localhost:3000` | URL de l'API Next.js |
| `SERVICE_MANAGER_PORT` | Non | `8080` | Port API admin du manager |
| `APP_BASE_PORT` | Non | `5050` | Port de base pour app.py |
| `BRIDGE_BASE_PORT` | Non | `5060` | Port de base pour sipbridge |

### Générer la clé de chiffrement

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cette clé doit être **identique** dans `sip-service/.env` et `web/.env.local`.

## Lancement

```bash
# 1. Next.js (doit tourner en premier)
cd web && npm run dev

# 2. Service manager
cd sip-service && ./venv/bin/python service_manager.py
```

### Test manuel (sans manager)

```bash
# Twilio seul
OPENAI_API_KEY=sk-... RESTAURANT_ID=xxx ./venv/bin/python app.py

# SIP direct (app.py + sipbridge)
./test.sh

# SIP bridge seul (avancé)
./venv/bin/python main-sipbridge.py \
    --sip-username 33491234567 \
    --sip-password s3cr3t \
    --sip-domain sip.trunk.com \
    --param restaurantId=uuid
```

---

## Chiffrement SIP

Les mots de passe SIP sont chiffrés en BDD (table `phone_lines`).

| | |
|---|---|
| **Algorithme** | AES-256-GCM |
| **Dérivation** | PBKDF2 (master key + phoneLineId comme sel) |
| **Format** | `iv:authTag:ciphertext` (base64) |
| **Migration** | `isEncrypted()` détecte les anciens mots de passe en clair |

Service : `web/src/services/sip-encryption.service.ts`

---

## Communication avec le Dashboard

Le service appelle l'API Next.js via HTTP :

```
GET  /api/ai                  → system prompt + tools + SIP credentials
GET  /api/sip/agents          → liste des restaurants actifs (pour le manager)
POST /api/availability/check  → vérification disponibilité
POST /api/customers           → lookup/create client
POST /api/calls               → log appel
POST /api/orders              → créer commande
POST /api/reservations        → créer réservation
POST /api/messages            → laisser un message
POST /api/faq                 → remonter question FAQ
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `service_manager.py` | Gestionnaire principal (discovery, spawn, health, API admin) |
| `app.py` | Proxy vocal OpenAI Realtime (FastAPI + WebSocket) |
| `sipbridge.py` | Bibliothèque pont SIP ↔ WebSocket (pjsua2) |
| `main-sipbridge.py` | Point d'entrée CLI pour sipbridge |
| `test.sh` | Script de test manuel (ancien `start.sh`) |
| `start-sipbridge.sh` | Lanceur shell pour sipbridge |
| `requirements.txt` | Dépendances Python |

## Arrêt

`CTRL+C` ou `SIGTERM` arrête proprement tous les agents.
Le sipbridge utilise `os._exit(0)` pour éviter les processus zombie pjsip sur macOS.
