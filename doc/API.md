# AlloResto -- Reference API

Toutes les routes sont sous `/api/`. Parametres communs : `restaurantId` (UUID) requis sur la plupart des endpoints.

---

## Restaurant et Menu

| Methode | Route                    | Description                                                        |
| ------- | ------------------------ | ------------------------------------------------------------------ |
| GET     | `/api/restaurants`       | Liste des restaurants actifs (ou un seul si `?id=xxx`)             |
| POST    | `/api/restaurants`       | Creer un restaurant                                                |
| PATCH   | `/api/restaurants`       | Modifier un restaurant                                             |
| GET     | `/api/menu`              | Menu complet (categories + items) pour un restaurant               |
| POST    | `/api/menu`              | Ajouter une categorie ou un item                                   |
| PATCH   | `/api/menu`              | Modifier une categorie ou un item                                  |
| DELETE  | `/api/menu`              | Supprimer une categorie ou un item                                 |
| GET     | `/api/rooms`             | Liste des salles d'un restaurant                                   |
| POST    | `/api/rooms`             | Creer une salle                                                    |
| PATCH   | `/api/rooms`             | Modifier une salle                                                 |
| DELETE  | `/api/rooms`             | Supprimer une salle                                                |
| GET     | `/api/tables`            | Liste des tables (`?restaurantId=X` ou `?roomId=X`)                |
| POST    | `/api/tables`            | Creer une table                                                    |
| PATCH   | `/api/tables`            | Modifier une table                                                 |
| DELETE  | `/api/tables`            | Supprimer une table                                                |
| GET     | `/api/faq`               | FAQ (`?status=pending`, `?for_prompt=true` pour les repondues)     |
| POST    | `/api/faq`               | Nouvelle question (remontee par l'IA via `log_new_faq`)            |
| PATCH   | `/api/faq`               | Repondre ou ignorer une question                                   |
| DELETE  | `/api/faq`               | Supprimer une FAQ                                                  |
| GET     | `/api/offers`            | Liste des offres/promotions                                        |
| POST    | `/api/offers`            | Creer une offre                                                    |
| PATCH   | `/api/offers`            | Modifier une offre                                                 |
| DELETE  | `/api/offers`            | Supprimer une offre                                                |
| GET     | `/api/dining-services`   | Liste des services (dejeuner, diner, etc.)                         |
| POST    | `/api/dining-services`   | Creer un service                                                   |
| PATCH   | `/api/dining-services`   | Modifier un service                                                |
| DELETE  | `/api/dining-services`   | Supprimer un service                                               |

---

## Commandes et Reservations

| Methode | Route                        | Description                                                      |
| ------- | ---------------------------- | ---------------------------------------------------------------- |
| GET     | `/api/orders`                | Liste des commandes (`?restaurantId=X&status=pending`)           |
| POST    | `/api/orders`                | Creer une commande (depuis le dashboard)                         |
| PATCH   | `/api/orders`                | Modifier le statut d'une commande                                |
| GET     | `/api/orders/status`         | Recherche commandes recentes par telephone (dernieres 24h)       |
| GET     | `/api/reservations`          | Liste des reservations (`?date=YYYY-MM-DD&status=...`)           |
| POST    | `/api/reservations`          | Creer une reservation                                            |
| PATCH   | `/api/reservations`          | Modifier statut/details d'une reservation                        |
| GET     | `/api/reservations/lookup`   | Recherche reservations a venir par telephone (pour annulation IA)|

---

## Clients

| Methode | Route              | Description                                                      |
| ------- | ------------------ | ---------------------------------------------------------------- |
| GET     | `/api/customers`   | Liste clients (`?restaurantId=X`) ou lookup (`?phone=xxx`)       |
| POST    | `/api/customers`   | Creer ou mettre a jour un client                                 |

---

## IA et Voix

| Methode | Route                            | Description                                                      |
| ------- | -------------------------------- | ---------------------------------------------------------------- |
| GET     | `/api/ai`                        | Config session IA : prompt, tools, contexte, credentials SIP     |
| POST    | `/api/ai/tools/confirm-order`    | Confirmation commande (resolution #N vers UUID, scheduling)      |
| POST    | `/api/ai/tools/cancel-order`     | Annulation commande (si statut pending/confirmed)                |
| POST    | `/api/availability/check`        | Verification disponibilite (pickup, delivery, reservation)       |

### GET /api/ai

Parametres query : `restaurantId` (requis), `callerPhone` (optionnel).

Retourne un objet `AiSessionConfig` :

```json
{
  "systemPrompt": "...",
  "tools": [{ "type": "function", "name": "check_availability", ... }],
  "voice": "sage",
  "greeting": "Un nouveau client vient d'appeler...",
  "initialContext": {
    "item_map": { "1": { "id": "uuid", "name": "Margherita" } },
    "customer_id": "uuid|null",
    "customer_name": "Jean|null",
    "avg_prep_time_min": 25,
    "restaurant_id": "uuid",
    "delivery_enabled": true
  },
  "sipCredentials": { "domain": "...", "username": "...", "password": "...", "source": "client" },
  "itemMap": { ... },
  "aiCostMarginPct": 30,
  "currency": "EUR",
  "exchangeRateToLocal": 0.92,
  "timezone": "Europe/Paris"
}
```

### POST /api/availability/check

Body :

```json
{
  "restaurantId": "uuid",
  "mode": "pickup|delivery|reservation",
  "requestedTime": "HH:MM",
  "customerAddress": "12 rue de la Paix",
  "customerCity": "Paris",
  "customerPostalCode": "75002",
  "customerLat": 48.8566,
  "customerLng": 2.3522,
  "partySize": 4,
  "seatingPreference": "window|outdoor|large_table|quiet|bar"
}
```

Retourne : `available`, `estimatedTime`, `estimatedTimeISO`, et selon le mode : `deliveryDistanceKm`, `deliveryDurationMin`, `deliveryFee`, `seatsAvailable`, `serviceId`, etc.

---

## Livraison

| Methode | Route                            | Description                                                  |
| ------- | -------------------------------- | ------------------------------------------------------------ |
| POST    | `/api/delivery/check`            | Verification zone de livraison (geocodage + distance)        |
| GET     | `/api/delivery-trips`            | Liste des tournees (`?status=active\|completed\|all`)        |
| POST    | `/api/delivery-trips`            | Creer une tournee (groupement de commandes + optimisation)   |
| GET     | `/api/delivery-trips/[tripId]`   | Detail d'une tournee                                         |
| PATCH   | `/api/delivery-trips/[tripId]`   | Modifier statut d'une tournee                                |

---

## Planning

| Methode | Route                             | Description                                              |
| ------- | --------------------------------- | -------------------------------------------------------- |
| GET     | `/api/planning/timeline`          | Timeline complete (commandes + charges externes)         |
| GET     | `/api/planning/available-slots`   | Creneaux disponibles pour prise de commande              |
| GET     | `/api/planning/external-loads`    | Liste des charges externes                               |
| POST    | `/api/planning/external-loads`    | Ajouter une charge externe                               |
| PATCH   | `/api/planning/external-loads`    | Modifier une charge externe                              |
| DELETE  | `/api/planning/external-loads`    | Supprimer une charge externe                             |

---

## Telephone et Communication

| Methode | Route                          | Description                                                |
| ------- | ------------------------------ | ---------------------------------------------------------- |
| GET     | `/api/phone-lines`             | Ligne telephonique d'un restaurant (sans mot de passe)     |
| PUT     | `/api/phone-lines`             | Configurer la ligne (domaine SIP, username, password)      |
| GET     | `/api/calls`                   | Journal des appels (`?limit=20`)                           |
| POST    | `/api/calls`                   | Creer un enregistrement d'appel                            |
| PATCH   | `/api/calls`                   | Mettre a jour un appel (duree, issue, couts)               |
| GET     | `/api/blocked-phones`          | Liste des numeros bloques                                  |
| POST    | `/api/blocked-phones`          | Bloquer un numero                                          |
| DELETE  | `/api/blocked-phones`          | Debloquer un numero                                        |
| GET     | `/api/blocked-phones/check`    | Verifier si un numero est bloque (`?phone=xxx`)            |
| GET     | `/api/messages`                | Messages laisses par les clients (`?unreadOnly=true`)      |
| POST    | `/api/messages`                | Enregistrer un message (via IA `leave_message`)            |
| PATCH   | `/api/messages`                | Marquer lu / modifier un message                           |
| DELETE  | `/api/messages`                | Supprimer un message                                       |

---

## Facturation et Abonnements

Routes proxy vers sip-agent-server. Authentification Better Auth requise (admin ou owner du restaurant).

| Methode | Route                                      | Description                                                      |
| ------- | ------------------------------------------ | ---------------------------------------------------------------- |
| GET     | `/api/plans/:restaurantId`                 | Plans disponibles pour le restaurant (plans actifs de l'account) |
| GET     | `/api/subscriptions/:restaurantId`         | Souscriptions actives du restaurant                              |
| POST    | `/api/subscriptions/:restaurantId`         | Souscrire a un plan. Body : `{ "planId": "xxx" }`               |
| DELETE  | `/api/subscriptions/:restaurantId/:subId`  | Annuler une souscription                                         |
| GET     | `/api/billing/:restaurantId/balance`       | Solde du compte                                                  |
| GET     | `/api/billing/:restaurantId/transactions`  | Historique des transactions                                      |

### Auto-souscription

A la creation d'un restaurant, le provisioning souscrit automatiquement au premier plan de base actif de l'account (plan par defaut).

---

## Statistiques et Tarification

| Methode | Route               | Description                                                        |
| ------- | ------------------- | ------------------------------------------------------------------ |
| GET     | `/api/stats`        | KPIs du jour, repartition horaire, stats hebdo, top clients        |
| GET     | `/api/ai-pricing`   | Configuration tarification (taux modeles, marge, couts telecom)    |
| PUT     | `/api/ai-pricing`   | Modifier la configuration tarification                             |

---

## Integration (Sync)

| Methode | Route                      | Description                                               |
| ------- | -------------------------- | --------------------------------------------------------- |
| GET     | `/api/sync-configs`        | Configurations de synchronisation plateforme              |
| POST    | `/api/sync-configs`        | Creer une config sync (Zenchef, etc.)                     |
| PATCH   | `/api/sync-configs`        | Modifier une config sync                                  |
| DELETE  | `/api/sync-configs`        | Supprimer une config sync                                 |
| POST    | `/api/sync/retry`          | Declencher le traitement des retries en attente           |
| GET     | `/api/sync/retry`          | Nombre de retries en attente                              |
| POST    | `/api/webhooks/zenchef`    | Reception des webhooks Zenchef (reservations entrantes)   |

---

## Administration

| Methode | Route                  | Description                                                      |
| ------- | ---------------------- | ---------------------------------------------------------------- |
| GET     | `/api/admin/servers`   | Workers + agents depuis sip-agent-server (proxy)                 |
| GET     | `/api/sip/agents`      | Liste des restaurants SIP actifs (pour decouverte SIP Bridge)    |

---

## Authentification

| Methode | Route               | Description                           |
| ------- | ------------------- | ------------------------------------- |
| *       | `/api/auth/[...all]`| Catch-all authentification (auth.js)  |

---

## Import

| Methode | Route                       | Description                                        |
| ------- | --------------------------- | -------------------------------------------------- |
| POST    | `/api/import`               | Pipeline d'import (action dans le body)            |

Actions disponibles (champ `action` du body) :

| Action           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `search-place`   | Recherche Google Places                              |
| `from-place`     | Import depuis Google Places (infos, photos, horaires)|
| `scan-menu`      | Scan photo(s) de menu via GPT-4o                     |
| `scrape-website` | Scrape page web du restaurant pour le menu           |
| `full`           | Pipeline complet (combine tout)                      |
| `from-json`      | Import direct depuis JSON                            |
| `persist`        | Sauvegarde en BDD                                    |
