# AlloResto -- Integration Vocale

## Vue d'ensemble

AlloResto ne possede plus de moteur vocal propre. La gestion des appels (OpenAI Realtime API, transport Twilio/SIP, execution des tools, suivi des couts et tokens) est delegue a **sip-agent-server**, un serveur externe specialise.

AlloResto fournit :
- L'API de configuration de session (`/api/ai`) -- prompt dynamique, tools, contexte client
- Les API d'execution des tools metier (`/api/ai/tools/*`, `/api/availability/check`)
- Le SIP Bridge (`sip-service/sipbridge.py`) pour le transport SIP/pjsip

---

## Pattern externalSessionUrl

sip-agent-server utilise le pattern `externalSessionUrl` pour charger dynamiquement la configuration IA a chaque appel entrant :

```
sip-agent-server  ──GET──>  /api/ai?restaurantId=xxx&callerPhone=0612345678
                  <──JSON──  { systemPrompt, tools, greeting, initialContext, ... }
```

L'URL est configuree sur l'Agent dans sip-agent-server :
```
externalSessionUrl = "http://localhost:3000/api/ai"
```

A chaque nouvel appel, sip-agent-server :
1. Appelle `GET /api/ai?restaurantId=xxx&callerPhone=xxx`
2. Recoit la config complete (prompt, tools, contexte)
3. Ouvre une session OpenAI Realtime avec le prompt
4. Injecte le `greeting` comme premier message
5. Stocke `initialContext` dans son ContextStore interne

---

## Format de reponse /api/ai

```json
{
  "systemPrompt": "ROLE: Tu es l'agent vocal de Chez Luigi...",
  "tools": [
    { "type": "function", "name": "check_availability", "description": "...", "parameters": {...} },
    { "type": "function", "name": "confirm_order", ... },
    { "type": "function", "name": "save_customer_info", ... },
    { "type": "function", "name": "log_new_faq", ... },
    { "type": "function", "name": "leave_message", ... },
    { "type": "function", "name": "confirm_reservation", ... },
    { "type": "function", "name": "check_order_status", ... },
    { "type": "function", "name": "cancel_order", ... },
    { "type": "function", "name": "lookup_reservation", ... },
    { "type": "function", "name": "cancel_reservation", ... },
    { "type": "function", "name": "transfer_call", ... },
    { "type": "function", "name": "end_call", ... }
  ],
  "voice": "sage",
  "greeting": "Un nouveau client vient d'appeler. Accueille-le...",
  "initialContext": {
    "item_map": { "1": { "id": "uuid-margherita", "name": "Margherita" }, "2": {...} },
    "customer_id": "uuid-client | null",
    "customer_name": "Jean | null",
    "customer_delivery_lat": 48.8566,
    "customer_delivery_lng": 2.3522,
    "avg_prep_time_min": 25,
    "delivery_enabled": true,
    "restaurant_id": "uuid-resto",
    "transfer_phone": "+33612345678 | null"
  },
  "sipCredentials": { "domain": "sip.provider.com", "username": "user", "password": "***", "source": "client" },
  "itemMap": { ... },
  "aiCostMarginPct": 30,
  "currency": "EUR",
  "exchangeRateToLocal": 0.92,
  "timezone": "Europe/Paris",
  "avgPrepTimeMin": 25,
  "deliveryEnabled": true,
  "reservationEnabled": true,
  "transferEnabled": true,
  "transferPhoneNumber": "+33612345678",
  "transferAutomatic": false
}
```

### initialContext

Contenu pre-charge dans le ContextStore de sip-agent-server. Ces valeurs sont accessibles par les ToolExecutors pendant l'appel :

| Cle                        | Type               | Description                                        |
| -------------------------- | ------------------ | -------------------------------------------------- |
| `item_map`                 | `Record<N, {id, name}>` | Mapping #N vers UUID + nom (articles + formules) |
| `customer_id`              | `string \| null`   | ID client connu (ou null si nouveau)               |
| `customer_name`            | `string \| null`   | Prenom du client connu                             |
| `customer_delivery_lat`    | `number \| null`   | Latitude adresse livraison enregistree             |
| `customer_delivery_lng`    | `number \| null`   | Longitude adresse livraison enregistree            |
| `avg_prep_time_min`        | `number`           | Temps moyen de preparation (minutes)               |
| `delivery_enabled`         | `boolean`          | Livraison activee pour ce restaurant               |
| `restaurant_id`            | `string`           | ID du restaurant                                   |
| `transfer_phone`           | `string \| null`   | Numero de transfert (si active)                    |

Pendant l'appel, sip-agent-server enrichit le contexte (ex: `last_availability_check` apres un appel a `check_availability`).

---

## API d'execution des tools (thin wrappers)

Ces API sont appelees par sip-agent-server quand l'IA invoque un tool. Le body contient les arguments IA + les variables du ContextStore.

### POST /api/ai/tools/confirm-order

Resolution des references `#N` en UUID via `item_map`, creation de la commande en BDD, scheduling via le moteur de planning.

Body :
```json
{
  "restaurantId": "uuid",
  "order_type": "pickup|delivery|dine_in",
  "items": [
    { "id": 3, "quantity": 2, "unit_price": 9.50, "selected_options": [...], "notes": "sans oignons" }
  ],
  "total": 19.00,
  "delivery_fee": 0,
  "payment_method": "cash",
  "notes": "",
  "item_map": { "3": { "id": "uuid", "name": "Margherita" } },
  "call_id": "uuid",
  "customer_id": "uuid",
  "customer_name": "Jean",
  "caller_phone": "0612345678",
  "last_availability_check": {
    "estimatedTimeISO": "2025-01-15T12:30:00Z",
    "estimatedTime": "12:30",
    "customerAddressFormatted": "12 rue de la Paix, 75002 Paris",
    "deliveryDistanceKm": 3.2,
    "customerLat": 48.8566,
    "customerLng": 2.3522
  }
}
```

Retour :
```json
{
  "success": true,
  "order_id": "uuid",
  "order_number": 42,
  "message": "Commande de 19EUR enregistree",
  "heure_estimee": "12:30",
  "mode": "prete"
}
```

### POST /api/ai/tools/cancel-order

Annulation d'une commande (uniquement si statut `pending` ou `confirmed`).

Body :
```json
{
  "restaurantId": "uuid",
  "order_number": 42,
  "caller_phone": "0612345678"
}
```

---

## ToolConfigs dans sip-agent-server

12 tools sont definis dans sip-agent-server pour chaque agent AlloResto :

| Tool                    | Type        | Description                                            |
| ----------------------- | ----------- | ------------------------------------------------------ |
| `check_availability`    | http_api    | Verification disponibilite (appelle `/api/availability/check`) |
| `confirm_order`         | http_api    | Confirmation commande (appelle `/api/ai/tools/confirm-order`)  |
| `confirm_reservation`   | http_api    | Confirmation reservation (appelle `/api/reservations`)         |
| `save_customer_info`    | http_api    | Sauvegarde prenom/adresse (appelle `/api/customers`)           |
| `log_new_faq`           | http_api    | Remontee question FAQ (appelle `/api/faq`)                     |
| `leave_message`         | http_api    | Message pour le restaurant (appelle `/api/messages`)           |
| `check_order_status`    | http_api    | Suivi commande par telephone (appelle `/api/orders/status`)    |
| `cancel_order`          | http_api    | Annulation commande (appelle `/api/ai/tools/cancel-order`)     |
| `lookup_reservation`    | http_api    | Recherche reservations (appelle `/api/reservations/lookup`)    |
| `cancel_reservation`    | http_api    | Annulation reservation (appelle `/api/reservations`)           |
| `transfer_call`         | built_in    | Transfert d'appel vers un humain (gere en interne)             |
| `end_call`              | built_in    | Raccrochage (gere en interne)                                  |

Les tools `transfer_call` et `end_call` sont geres directement par sip-agent-server (pas d'appel HTTP vers AlloResto).

---

## SIP Bridge

Le SIP Bridge reste dans `sip-service/` d'AlloResto :

```
sip-service/
  sipbridge.py           # Librairie pjsip + FastAPI REST
  main-sipbridge.py      # Point d'entree
```

Fonctionnement :
1. Le SIP Bridge s'enregistre aupres du serveur SIP (Twilio, OVH, etc.)
2. A la reception d'un appel, il pousse un evenement dans la queue Redis
3. Un worker sip-agent-server prend l'appel et gere la session

Contraintes pjsip :
- Ne JAMAIS appeler les methodes pjsip/pjsua2 C++ depuis les threads uvicorn (crash assertion)
- L'etat SIP est cache dans un booleen Python (`_sip_registered`), mis a jour depuis le callback `onRegState`
- Les sous-processus utilisent `stdout=logfile, stderr=STDOUT` (pas PIPE, pour eviter le blocage buffer)
- `start_new_session=True` + `PYTHONUNBUFFERED=1` pour les processus enfants

---

## Page d'administration

La page `/admin/servers` affiche l'etat des workers et agents depuis sip-agent-server :

```
Page admin  ──GET──>  /api/admin/servers (Next.js)
                        ──GET──>  sip-agent-server /api/workers
                        ──GET──>  sip-agent-server /api/agents
                      <──JSON──  { workers: [...], agents: [...], serverOnline: bool }
```

L'API `/api/admin/servers` est un proxy : AlloResto n'interroge jamais sip-agent-server directement depuis le frontend.

---

## Script de seed

Le script `scripts/seed-alloresto.ts` dans sip-agent-server cree les objets necessaires :
- **Account** : compte AlloResto
- **Agent** : agent vocal avec `externalSessionUrl` pointant vers `/api/ai`
- **ToolConfigs** : les 12 tools listes ci-dessus, avec URLs vers les API AlloResto

---

## Variables d'environnement

| Variable                | Defaut                    | Description                                      |
| ----------------------- | ------------------------- | ------------------------------------------------ |
| `SIP_AGENT_SERVER_URL`  | `http://localhost:4000`   | URL de sip-agent-server                          |
| `ENCRYPTION_KEY`        | _(requis)_                | Cle AES-256 pour chiffrement SIP (64 hex chars)  |
| `SIP_DOMAIN`            | `sip.twilio.com`          | Domaine SIP fallback (ligne demo)                |
| `SIP_USERNAME`          | _(vide)_                  | Username SIP fallback                            |
| `SIP_PASSWORD`          | _(vide)_                  | Password SIP fallback                            |
