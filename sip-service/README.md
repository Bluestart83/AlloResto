# SIP Service — AlloResto

Service vocal IA pour restaurants : proxy OpenAI Realtime + pont SIP (pjsip).

## Architecture

```
                 ┌──────────────────────────────────────────┐
                 │     Service Manager (Node.js :8080)       │
                 │  Découvre les restaurants via l'API        │
                 │  Démarre/arrête/surveille les agents       │
                 └──────┬──────────────┬─────────────────────┘
                        │              │
              ┌─────────▼──┐   ┌───────▼────────┐
              │  app.ts     │   │  sipbridge      │
              │  (:5050+)   │   │  (:5060+)       │
              │  Fastify +  │◄──│  SIP ↔ WS       │
              │  OpenAI     │   │  (pjsip/pjsua2) │
              │  Realtime   │   │  Python          │
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
| **SIP Bridge** (`sipBridge: true`) | app.ts + sipbridge | Client → Trunk SIP → sipbridge → WS → OpenAI |
| **Twilio** (`sipBridge: false`) | app.ts seul | Client → Twilio → webhook → WS → OpenAI |

`app.ts` est identique dans les deux modes. Il reçoit les mêmes events
WebSocket (`start`, `media`, `mark`, `stop`).

---

## Quick Start

### Prérequis

- Node.js 20+
- Python 3.12+ (uniquement pour sipbridge)
- Compte OpenAI avec accès Realtime API
- (Mode SIP) pjsua2 compilé avec support Python
- Next.js doit tourner (`cd web && npm run dev`)

### Installation

```bash
cd sip-service
npm install

# Pour le mode SIP : installer pjsua2 dans le venv Python
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Configuration (.env)

| Variable | Requis | Défaut | Description |
|----------|--------|--------|-------------|
| `OPENAI_API_KEY` | Oui | — | Clé API OpenAI |
| `ENCRYPTION_KEY` | Oui | — | Clé de chiffrement (64 car. hex) |
| `NEXT_API_URL` | Non | `http://localhost:3000` | URL de l'API Next.js |
| `SERVICE_MANAGER_PORT` | Non | `8080` | Port API admin du manager |
| `APP_BASE_PORT` | Non | `5050` | Port de base pour app.ts |
| `BRIDGE_BASE_PORT` | Non | `5060` | Port de base pour sipbridge |

```bash
# Générer la clé de chiffrement
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Cette clé doit être **identique** dans `sip-service/.env` et `web/.env.local`.

### Lancement

```bash
# 1. Next.js (doit tourner en premier)
cd web && npm run dev

# 2. Service manager — mode dev (tsx, hot debug)
cd sip-service && npm run dev

# 2b. Ou mode prod (JS compilé)
cd sip-service && npm run build && npm start
```

---

## Modes dev vs prod

| | Dev | Prod |
|---|---|---|
| **Commande** | `npm run dev` | `npm run build && npm start` |
| **Exécution** | `tsx` (TypeScript direct) | `node dist/` (JS compilé) |
| **Spawn app.ts** | `npx tsx app.ts` | `node dist/app.js` |
| **NODE_ENV** | `development` | _(non défini)_ |

Le service-manager détecte `NODE_ENV=development` et adapte automatiquement
la commande de spawn pour `app.ts`.

### Scripts npm

| Script | Description |
|--------|-------------|
| `npm run dev` | Lance le service-manager en mode dev (tsx) |
| `npm run dev:app` | Lance app.ts seul en mode dev (debug/test) |
| `npm run build` | Compile TS → JS dans `dist/` |
| `npm start` | Lance le service-manager en production |
| `npm run start:app` | Lance app.ts seul en production |

### Test manuel (un seul restaurant)

```bash
# Mode dev — app.ts seul (sans manager)
RESTAURANT_ID=xxx npm run dev:app

# Mode prod
RESTAURANT_ID=xxx npm run start:app
```

---

## Service Manager

Le **service manager** gère tous les restaurants en un seul processus.

### Ce qu'il fait

1. Appelle `GET /api/sip/agents` pour découvrir les restaurants actifs
2. Alloue des ports automatiquement (5050, 5051… / 5060, 5061…)
3. Démarre app.ts + sipbridge par restaurant
4. Surveille la santé toutes les 30s (auto-restart si crash, max 3 tentatives / 5 min)
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

## Communication avec le Dashboard

Le service appelle l'API Next.js via HTTP :

```
GET  /api/ai                  → system prompt + tools + SIP credentials
GET  /api/sip/agents          → liste des restaurants actifs (pour le manager)
POST /api/availability/check  → vérification disponibilité
POST /api/customers           → lookup/create client
POST /api/calls               → log appel
PATCH /api/calls              → finaliser appel (durée, outcome, transcript)
POST /api/orders              → créer commande
PATCH /api/orders             → annuler commande
GET  /api/orders/status       → statut commande par téléphone
POST /api/reservations        → créer réservation
GET  /api/reservations/lookup → chercher réservation par téléphone
PATCH /api/reservations       → annuler réservation
POST /api/messages            → laisser un message
POST /api/faq                 → remonter question FAQ
GET  /api/blocked-phones/check → vérifier si numéro bloqué
```

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

## Fichiers

| Fichier | Rôle |
|---------|------|
| `service-manager.ts` | Gestionnaire principal (discovery, spawn, health, API admin) |
| `app.ts` | Proxy vocal OpenAI Realtime (Fastify + WebSocket) |
| `main-sipbridge.py` | Point d'entrée CLI pour sipbridge (Python/pjsip) |
| `sipbridge.py` | Bibliothèque pont SIP ↔ WebSocket (pjsua2) |
| `dist/` | Build de production (`npm run build`) |
| `logs/` | Logs des sous-processus (`{restaurantId}-app.log`, `{restaurantId}-bridge.log`) |

## Arrêt

`CTRL+C` ou `SIGTERM` arrête proprement tous les agents.
Le sipbridge utilise `os._exit(0)` pour éviter les processus zombie pjsip sur macOS.
