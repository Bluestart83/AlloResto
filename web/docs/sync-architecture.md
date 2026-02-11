# Architecture de synchronisation — Services externes

## Vue d'ensemble

Le systeme de synchronisation permet la communication bidirectionnelle entre AlloResto et les plateformes de reservation/commande (Zenchef, TheFork, SevenRooms, UberEats, Deliveroo, etc.).

```
┌─────────────┐     outbound      ┌──────────────┐
│  AlloResto  │ ───────────────→  │   Zenchef    │
│  (local)    │ ←───────────────  │  TheFork     │
└─────────────┘     inbound       │  UberEats    │
                   (webhooks)     │  ...         │
                                  └──────────────┘
```

## Entites synchronisables

Le systeme gere la synchronisation de 8 types d'entites :

| Type | Entite locale | Description |
|------|---------------|-------------|
| `reservation` | `Reservation` | Reservations clients (avec service, offre, salle, tables) |
| `order` | `Order` | Commandes (pickup, livraison) |
| `menu_item` | `MenuItem` | Plats et articles du menu |
| `offer` | `Offer` | Offres/formules/promotions |
| `table` | `DiningTable` | Tables individuelles |
| `dining_room` | `DiningRoom` | Salles de restaurant |
| `dining_service` | `DiningService` | Services (Dejeuner, Diner, Brunch, etc.) |
| `customer` | `Customer` | Clients (fiche contact) |

### Modele de donnees — Entites cles

#### DiningService (ex: Service)

Un **service** represente un creneau horaire recurrent (Dejeuner, Diner, Brunch). Chaque restaurant peut definir plusieurs services avec des capacites et horaires differents.

| Champ | Type | Description |
|-------|------|-------------|
| `name` | VARCHAR | Nom du service (ex: "Dejeuner") |
| `type` | VARCHAR | standard, brunch, evenement |
| `dayOfWeek` | JSON | Jours actifs [1=Lun..7=Dim] |
| `startTime` / `endTime` | VARCHAR | Horaires du service (HH:MM) |
| `lastSeatingTime` | VARCHAR | Derniere prise en charge |
| `maxCovers` | INT | Capacite maximale de couverts |
| `slotIntervalMin` | INT | Intervalle entre creneaux (min) |
| `defaultDurationMin` | INT | Duree par defaut d'un repas (min) |
| `requiresPrepayment` | BOOLEAN | Prepaiement requis ? |
| `prepaymentAmount` | DECIMAL | Montant du prepaiement |
| `autoConfirm` | BOOLEAN | Confirmation automatique ? |
| `diningRoomIds` | JSON | Salles concernees (null = toutes) |
| `isPrivate` | BOOLEAN | Service non public ? |
| `isActive` | BOOLEAN | Actif ? |

#### Offer

Une **offre** represente une promotion, un menu special, ou un evenement bookable.

| Champ | Type | Description |
|-------|------|-------------|
| `name` | VARCHAR | Nom de l'offre |
| `description` | TEXT | Description |
| `type` | VARCHAR | menu, promo, happy_hour, evenement |
| `menuItemId` | UUID | Lien vers un MenuItem (formule, optionnel) |
| `discountPercent` | INT | Reduction en % |
| `startDate` / `endDate` | DATE | Dates de validite |
| `isPermanent` | BOOLEAN | Offre permanente ? |
| `minPartySize` / `maxPartySize` | INT | Taille du groupe |
| `hasPrepayment` | BOOLEAN | Prepaiement ? |
| `prepaymentAmount` | DECIMAL | Montant |
| `prepaymentType` | VARCHAR | per_person, flat |
| `isBookable` | BOOLEAN | Reservable par telephone/IA ? |
| `isActive` | BOOLEAN | Active ? |

#### Reservation — champs de liaison

Les reservations portent des FK vers les entites de reference :

| Champ | Type | Description |
|-------|------|-------------|
| `serviceId` | UUID | FK → DiningService (creneau choisi) |
| `offerId` | UUID | FK → Offer (offre selectionnee) |
| `diningRoomId` | UUID | FK → DiningRoom (salle assignee) |
| `tableIds` | JSON | IDs des tables assignees |

Ces champs sont **optionnels** — ils ne sont remplis que si le restaurant utilise les services/offres et si le client ou le restaurateur fait un choix.

---

## Tables SQL (prefix `sync_`)

### `sync_platform_configs`
Configuration par restaurant et par plateforme.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `restaurant_id` | VARCHAR | FK → restaurants |
| `platform` | VARCHAR(50) | "zenchef", "thefork", "sevenrooms", etc. |
| `credentials` | JSON | API keys, tokens (chiffre cote applicatif) |
| `master_for` | JSON | Types d'entites dont cette plateforme est source de verite (ex: `["reservation"]`) |
| `sync_entities` | JSON | Types a synchroniser (ex: `["reservation", "order"]`) |
| `supports_webhook` | BOOLEAN | La plateforme envoie des webhooks ? |
| `webhook_url` | VARCHAR(500) | URL webhook enregistree |
| `webhook_secret` | VARCHAR(255) | Secret HMAC pour valider les webhooks |
| `poll_interval_sec` | INT | Intervalle de polling fallback (defaut: 300s) |
| `is_active` | BOOLEAN | Config active ? |
| `last_sync_at` | DATETIME | Derniere sync reussie |
| `last_error` | TEXT | Derniere erreur |

**Contrainte unique** : `(restaurant_id, platform)`

### `sync_external_mappings`
Mapping polymorphe entre entites locales et IDs externes.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `entity_type` | VARCHAR(50) | "reservation", "order", "customer", "table", "dining_room", "dining_service", "offer", etc. |
| `entity_id` | VARCHAR | ID local de l'entite |
| `platform` | VARCHAR(50) | "zenchef", "thefork", etc. |
| `external_id` | VARCHAR(255) | ID sur la plateforme |
| `external_secondary_id` | VARCHAR(255) | ID secondaire (optionnel) |
| `external_raw_data` | JSON | Donnees brutes de la plateforme |
| `sync_status` | VARCHAR(20) | "synced", "pending", "conflict" |
| `synced_at` | DATETIME | Derniere sync |

**Contraintes uniques** : `(entity_type, entity_id, platform)` et `(platform, external_id, entity_type)`

### `sync_logs`
Journal d'audit de toutes les operations de synchronisation.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `restaurant_id` | VARCHAR | FK → restaurants |
| `entity_type` | VARCHAR(50) | "reservation", "order", etc. |
| `entity_id` | VARCHAR | ID local (nullable si creation inbound) |
| `platform` | VARCHAR(50) | Plateforme concernee |
| `external_id` | VARCHAR(255) | ID externe |
| `direction` | VARCHAR(10) | "inbound" ou "outbound" |
| `action` | VARCHAR(20) | "create", "update", "cancel", "status_change", etc. |
| `status` | VARCHAR(10) | "success", "failed", "conflict", "retry", "skipped" |
| `request_payload` | JSON | Donnees envoyees/recues |
| `response_payload` | JSON | Reponse de la plateforme |
| `error_message` | TEXT | Message d'erreur |
| `conflict_resolution` | TEXT | Description de la resolution du conflit |
| `retry_count` | INT | Nombre de tentatives (defaut: 0) |
| `next_retry_at` | DATETIME | Prochaine tentative (exponential backoff) |
| `duration_ms` | INT | Duree de l'operation |

---

## Structure des fichiers

```
web/src/services/sync/
├── mastering.service.ts              Logique de mastering (qui est source de verite)
├── sync-log.service.ts               Ecriture/lecture SyncLogs + retry scheduling
├── external-mapping.service.ts       CRUD SyncExternalMapping
├── backfill.service.ts               Scripts de migration
│
├── connectors/
│   ├── connector.interface.ts        Interface PlatformConnector + DTOs
│   ├── connector.registry.ts         Factory : getConnector(platform, restaurantId)
│   │
│   └── zenchef/                      Premier connecteur implemente
│       ├── zenchef.types.ts          Types API Zenchef (Formitable v1.2)
│       ├── zenchef.mapper.ts         Mapping interne ↔ Zenchef (bidirectionnel)
│       ├── zenchef.webhooks.ts       Parsing/validation webhooks
│       └── zenchef.connector.ts      Implementation PlatformConnector
│
└── workers/
    ├── outbound-sync.worker.ts       Push vers les plateformes
    ├── inbound-sync.worker.ts        Traitement webhooks entrants
    └── retry.worker.ts               Retry des syncs echouees
```

## Routes API

| Route | Methode | Description |
|-------|---------|-------------|
| `/api/webhooks/zenchef` | POST | Reception webhooks Zenchef |
| `/api/sync/retry` | POST | Declenchement retries (cron/manuel) |
| `/api/sync/retry` | GET | Nombre de retries en attente |
| `/api/dining-services` | GET/POST/PATCH/DELETE | CRUD services (DiningService) |
| `/api/offers` | GET/POST/PATCH/DELETE | CRUD offres (Offer) |
| `/api/rooms` | GET/POST/PATCH/DELETE | CRUD salles (DiningRoom) |
| `/api/reservations` | GET/POST/PATCH | Reservations (avec serviceId, offerId, diningRoomId, tableIds) |

---

## DTOs (Data Transfer Objects)

Les DTOs sont les structures neutres utilisees pour echanger les donnees entre les connecteurs et notre systeme. Ils sont definis dans `connector.interface.ts`.

### ReservationSyncDTO

```typescript
interface ReservationSyncDTO {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  adults?: number;
  children?: number;
  reservationTime: string;       // ISO 8601
  durationMin?: number;
  serviceExternalId?: string;    // ID externe du service sur la plateforme
  diningRoomExternalId?: string; // ID externe de la salle
  tableExternalIds?: string[];   // IDs externes des tables
  offerExternalId?: string;      // ID externe de l'offre
  status?: string;
  notes?: string;
  allergies?: string[];
  dietaryRestrictions?: string[];
  occasion?: string;
}
```

> **Important** : les champs `*ExternalId` contiennent des IDs **de la plateforme cible**, pas nos IDs locaux. La resolution se fait via `SyncExternalMapping`.

### Autres DTOs

| DTO | Usage |
|-----|-------|
| `OrderSyncDTO` | Commandes (statut, items, total, adresse) |
| `MenuItemSyncDTO` | Articles menu (nom, prix, allergenes, options) |
| `OfferSyncDTO` | Offres/formules (etapes, items eligibles) |
| `MenuSyncDTO` | Carte complete (categories + items + offres) |
| `TableSyncDTO` | Tables (label, places, salle) |
| `DiningRoomSyncDTO` | Salles (nom, capacite) |
| `CustomerSyncDTO` | Clients (nom, tel, email, allergies, statut VIP) |
| `AvailabilitySlot` | Creneaux disponibles (heure, places restantes) |

---

## Interface PlatformConnector

Chaque connecteur implemente cette interface :

```typescript
interface PlatformConnector {
  readonly platform: string;

  // Auth
  authenticate(credentials: Record<string, any>): Promise<void>;

  // Reservations
  createReservation(data: ReservationSyncDTO): Promise<SyncEntityResult>;
  updateReservation(externalId: string, data: Partial<ReservationSyncDTO>): Promise<SyncEntityResult>;
  cancelReservation(externalId: string, reason?: string): Promise<void>;

  // Commandes (optionnel)
  syncOrder?(externalId: string, data: Partial<OrderSyncDTO>): Promise<SyncEntityResult>;

  // Menu complet (optionnel)
  pushMenu?(menu: MenuSyncDTO): Promise<{ items: SyncEntityResult[]; offers: SyncEntityResult[] }>;
  pullMenu?(): Promise<MenuSyncDTO>;
  pushMenuItems?(items: MenuItemSyncDTO[]): Promise<SyncEntityResult[]>;
  pullMenuItems?(): Promise<{ externalId: string; data: MenuItemSyncDTO }[]>;
  pushOffers?(offers: OfferSyncDTO[]): Promise<SyncEntityResult[]>;
  pullOffers?(): Promise<{ externalId: string; data: OfferSyncDTO }[]>;

  // Plan de salle (optionnel)
  pushTables?(tables: TableSyncDTO[]): Promise<SyncEntityResult[]>;
  pullTables?(): Promise<{ externalId: string; data: TableSyncDTO }[]>;
  pushDiningRooms?(rooms: DiningRoomSyncDTO[]): Promise<SyncEntityResult[]>;
  pullDiningRooms?(): Promise<{ externalId: string; data: DiningRoomSyncDTO }[]>;

  // Clients (optionnel)
  syncCustomer?(externalId: string | null, data: CustomerSyncDTO): Promise<SyncEntityResult>;
  pullCustomers?(since?: Date): Promise<{ externalId: string; data: CustomerSyncDTO }[]>;

  // Disponibilites
  getAvailability(date: string, partySize: number): Promise<AvailabilitySlot[]>;
  pushAvailability?(services: { externalId: string; slots: AvailabilitySlot[] }[]): Promise<void>;

  // Generique (fallback)
  syncEntity(type: string, localData: Record<string, any>, externalId?: string): Promise<SyncEntityResult>;

  // Webhooks
  parseWebhook(headers: Record<string, string>, body: Record<string, any>): Promise<WebhookEvent>;
}
```

Les methodes marquees `?` sont optionnelles — chaque connecteur implemente celles que la plateforme supporte.

---

## Flux outbound (local → plateforme)

```
POST/PATCH /api/reservations
  │
  ▼
syncReservationOutbound(reservation, action)
  │
  ├─ Trouve toutes les plateformes connectees (SyncPlatformConfig + SyncExternalMapping)
  │
  ├─ Pour chaque plateforme :
  │   ├─ Check mastering (getReservationMaster)
  │   │   └─ Si la plateforme est master → skip (log "skipped")
  │   │
  │   ├─ reservationToDTO(reservation, platform)    ← ASYNC
  │   │   └─ Resout les IDs externes via SyncExternalMapping :
  │   │       serviceId      → serviceExternalId       (entity_type: "dining_service")
  │   │       offerId        → offerExternalId         (entity_type: "offer")
  │   │       diningRoomId   → diningRoomExternalId    (entity_type: "dining_room")
  │   │       tableIds[]     → tableExternalIds[]      (entity_type: "table")
  │   │
  │   ├─ Gestion des cas speciaux :
  │   │   ├─ cancelled/no_show → connector.cancelReservation()
  │   │   ├─ seated → connector.checkinBooking()    (Zenchef specifique)
  │   │   └─ completed → connector.checkoutBooking() (Zenchef specifique)
  │   │
  │   ├─ Create ou Update via le connecteur
  │   │
  │   ├─ Upsert mapping (SyncExternalMapping)
  │   │
  │   └─ createSyncLog(direction: "outbound")
  │
  └─ En cas d'erreur → scheduleRetry() (exponential backoff)
```

### Resolution des IDs externes (outbound)

Quand une reservation locale a un `serviceId`, `offerId`, `diningRoomId` ou `tableIds`, la fonction `reservationToDTO()` les transforme en IDs externes pour la plateforme cible. Elle interroge `SyncExternalMapping` pour chaque ID local :

```
findMapping("dining_service", reservation.serviceId, "zenchef")
  → SyncExternalMapping.externalId = "zc_service_abc123"
```

Si le mapping n'existe pas (entite pas encore synchee vers cette plateforme), le champ `*ExternalId` reste `undefined` dans le DTO — la plateforme ignorera ce champ.

---

## Flux inbound (plateforme → local)

```
POST /api/webhooks/zenchef
  │
  ├─ Identifie le restaurant via credentials.restaurantUid
  ├─ Valide la signature HMAC
  │
  ▼
processInboundWebhook(platform, restaurantId, body)
  │
  ├─ connector.parseWebhook() → WebhookEvent
  │   └─ Extrait les IDs externes : service_uid, section_uid, offer_uid, tables[].uid
  │
  ├─ Route par eventType :
  │   ├─ reservation.created → handleReservationCreated
  │   │   ├─ Check doublons (mapping ou externalReferenceId)
  │   │   ├─ Upsert customer
  │   │   ├─ resolveExternalIds(platform, data)  ← NOUVEAU
  │   │   │   └─ Resout les IDs externes → locaux via SyncExternalMapping :
  │   │   │       serviceExternalId    → serviceId       (entity_type: "dining_service")
  │   │   │       offerExternalId      → offerId         (entity_type: "offer")
  │   │   │       diningRoomExternalId → diningRoomId    (entity_type: "dining_room")
  │   │   │       tableExternalIds[]   → tableIds[]      (entity_type: "table")
  │   │   ├─ Cree Reservation (avec serviceId, offerId, diningRoomId, tableIds)
  │   │   └─ Cree mapping
  │   │
  │   ├─ reservation.updated → handleReservationUpdated
  │   │   ├─ Find mapping
  │   │   ├─ resolveExternalIds(platform, data)
  │   │   ├─ Check mastering + resolveConflict()
  │   │   │   ├─ remote wins → applique donnees fusionnees (incl. serviceId, offerId, etc.)
  │   │   │   └─ local wins → log "conflict", skip
  │   │   └─ Incremente version
  │   │
  │   ├─ reservation.cancelled → handleReservationCancelled
  │   │   ├─ Check mastering (seated/completed → ignore cancel)
  │   │   └─ Update status = "cancelled"
  │   │
  │   └─ reservation.status_changed → handleReservationStatusChanged
  │       └─ Check mastering, update status
  │
  └─ createSyncLog(direction: "inbound")
```

### Resolution des IDs externes (inbound)

Quand un webhook arrive avec des IDs de la plateforme (`service_uid`, `section_uid`, `offer_uid`, `tables[].uid`), le worker inbound les transforme en IDs locaux via `resolveExternalIds()` :

```
findByExternalId("zenchef", "zc_service_abc123", "dining_service")
  → SyncExternalMapping.entityId = "local-uuid-du-service"
```

Si le mapping n'existe pas (entite pas encore importee depuis cette plateforme), l'ID local reste `null` — la reservation sera creee sans cette liaison.

---

## Mastering (source de verite)

Le mastering determine qui "gagne" en cas de conflit :

- **Par defaut** : `self` (notre outil est master)
- **Si `SyncPlatformConfig.masterFor` contient le type d'entite** : la plateforme est master
- **Cas special reservations** : une fois le client `seated`, `completed` ou `no_show`, c'est toujours `self` qui est master (on ne revient pas en arriere)

```
getReservationMaster(reservation):
  si reservation.status in [seated, completed, no_show] → "self"
  si reservation.source in [zenchef, thefork, ...] → reservation.source
  sinon → "self"
```

### Resolution de conflits

```
resolveConflict(entityType, localData, remoteData, platform, master):
  si master === platform → remote gagne (merged = local + remote overlay)
  si master === "self" → local gagne (exception: allergies = union)
  fallback → local gagne
```

Les champs `serviceId`, `offerId`, `diningRoomId`, `tableIds` participent a la resolution de conflits : si la plateforme est master, ses valeurs ecrasent les locales.

---

## Retry (exponential backoff)

Delais : **1 min → 5 min → 30 min → 2h → 8h** (max 5 tentatives).

- Les SyncLogs en `status=retry` sont relances par `POST /api/sync/retry`
- A appeler via un cron (ex: toutes les minutes)
- Les retries outbound rechargent l'entite et relancent le sync
- Les retries inbound re-traitent le requestPayload stocke (sans re-validation signature)

---

## Ajouter un nouveau connecteur

Pour ajouter une nouvelle plateforme (ex: TheFork) :

### 1. Creer le dossier
```
web/src/services/sync/connectors/thefork/
├── thefork.types.ts          Types API TheFork
├── thefork.mapper.ts         Mapping interne ↔ TheFork
├── thefork.webhooks.ts       Parsing webhooks
└── thefork.connector.ts      Implementation PlatformConnector
```

### 2. Types (`thefork.types.ts`)
Definir les types bruts de l'API TheFork (requetes, reponses, webhooks).

### 3. Mapper (`thefork.mapper.ts`)

Fonctions de mapping bidirectionnel :

```typescript
// Outbound : DTO → requete API
function toTheForkReservation(dto: ReservationSyncDTO, locale: string): TheForkBookingRequest;

// Inbound : reponse API → DTO
function fromTheForkReservation(resp: TheForkBookingResponse): ReservationSyncDTO;

// Status mapping
function mapTheForkStatusToLocal(status: string): string;

// Entite locale → DTO (async pour resolution des IDs externes)
async function reservationToDTO(r: Reservation, platform?: string): Promise<ReservationSyncDTO>;
```

**Important** : `reservationToDTO()` doit etre **async** et accepter un parametre `platform` optionnel pour resoudre les IDs locaux en IDs externes via `SyncExternalMapping`. Si le mapper est specifique a une seule plateforme, on peut reutiliser la fonction du mapper Zenchef comme reference.

#### Mapping des IDs de reference

Chaque plateforme a sa propre facon de nommer les concepts :

| Concept local | Zenchef | TheFork (exemple) |
|---------------|---------|-------------------|
| DiningService | `service_uid` | `shift_id` |
| DiningRoom | `section_uid` | `area_id` |
| DiningTable | `tables[].uid` | `table_ids[]` |
| Offer | `offer_uid` | `deal_id` |

Le mapper doit :
- **Outbound** : injecter les IDs externes dans la requete API
- **Inbound** : extraire les IDs externes du webhook/reponse et les mettre dans le DTO (`serviceExternalId`, `diningRoomExternalId`, `tableExternalIds`, `offerExternalId`)

### 4. Webhooks (`thefork.webhooks.ts`)

- Validation signature (si applicable)
- `parseTheForkWebhook(body)` → `WebhookEvent`
- **Doit extraire et passer** les IDs externes de service/salle/offre/tables dans `event.data` :

```typescript
return {
  eventType: "reservation.created",
  externalId: body.booking_id,
  rawPayload: body,
  data: {
    customerName: body.guest_name,
    // ...
    serviceExternalId: body.shift_id || undefined,
    diningRoomExternalId: body.area_id || undefined,
    tableExternalIds: body.table_ids || undefined,
    offerExternalId: body.deal_id || undefined,
  },
};
```

### 5. Connector (`thefork.connector.ts`)

Implementer `PlatformConnector` :
- `authenticate()` — init avec credentials
- `createReservation()` / `updateReservation()` / `cancelReservation()`
- `getAvailability()`
- `syncEntity()`
- `parseWebhook()`
- Methodes optionnelles selon les capacites de la plateforme

### 6. Enregistrer dans le registry

Dans `connector.registry.ts`, ajouter :
```typescript
import { TheForkConnector } from "./thefork/thefork.connector";

const CONNECTOR_CONSTRUCTORS = {
  zenchef: ZenchefConnector,
  thefork: TheForkConnector,  // ← ajouter
};
```

### 7. Route webhook

Creer `web/src/app/api/webhooks/thefork/route.ts` (copier/adapter le pattern Zenchef).

### 8. Ajouter dans le mastering

Dans `mastering.service.ts`, la plateforme "thefork" est deja dans `PLATFORM_SOURCES`.

### 9. Configurer en base

Creer un `SyncPlatformConfig` pour chaque restaurant :
```json
{
  "platform": "thefork",
  "credentials": { "apiKey": "...", "restaurantUid": "..." },
  "masterFor": ["reservation"],
  "syncEntities": ["reservation"],
  "supportsWebhook": true,
  "webhookUrl": "https://mondomaine.com/api/webhooks/thefork",
  "isActive": true
}
```

### 10. Backfill des mappings existants

Si la plateforme a deja des donnees (services, salles, tables, offres), il faut creer les `SyncExternalMapping` correspondants pour que la resolution d'IDs fonctionne :

```typescript
// Exemple : mapper les services existants
for (const localService of localServices) {
  const externalService = await connector.findServiceByName(localService.name);
  if (externalService) {
    await upsertMapping({
      entityType: "dining_service",
      entityId: localService.id,
      platform: "thefork",
      externalId: externalService.externalId,
    });
  }
}
```

Sans ces mappings, les reservations seront synchees **sans** les liaisons service/salle/offre.

---

## Zenchef — Details specifiques

- **API** : Formitable REST API v1.2 (`https://api.formitable.com/api/v1.2/`)
- **Auth** : Header `ApiKey: <key>`
- **Mapping IDs** :
  - Service → `service_uid`
  - Salle → `section_uid`
  - Table → `tables[].uid`
  - Offre → `offer_uid`
- **Particularites** :
  - `PUT /booking/{uid}` = remplacement total (le connecteur fait GET + merge avant PUT)
  - Checkin/Checkout = endpoints separees (`PUT /booking/checkin/{uid}`)
  - `external_reference_id` = notre `reservation.id` local (pour le lookup inverse)
  - Polling fallback : `GET /booking/latest/{intervalMin}/{filter}` (accepted/changed/canceled)
- **Webhooks** : booking.created, booking.accepted, booking.changed, booking.canceled, booking.checkin, booking.checkout
- **Rate limit** : 100 req/min
- **Contact API** : api-tech-help@zenchef.com

---

## Integration IA

L'IA vocale (OpenAI Realtime) est informee des services et offres du restaurant :

### Prompt systeme

Les fonctions `buildServicesText()` et `buildOffersText()` dans `ai-prompt.service.ts` generent des sections de prompt injectees dans la configuration IA :

- **Services** : jours, horaires, capacite, duree par defaut, prepaiement
- **Offres bookables** : nom, description, type, taille de groupe, dates, lien formule

### Outil `confirm_reservation`

L'outil de reservation IA accepte des parametres optionnels :
- `service_id` — si le client choisit un service specifique
- `offer_id` — si le client choisit une offre

L'IA est instruite de proposer les offres disponibles lors d'une reservation.

### Outil `check_availability`

Retourne desormais `serviceId` et `serviceName` quand un service correspond au creneau demande, ce qui permet a l'IA d'informer le client du service concerne.

---

## Diagramme de resolution d'IDs

```
                    OUTBOUND (local → plateforme)
                    ==============================

  Reservation locale              SyncExternalMapping           Requete API
  ┌──────────────┐    findMapping()    ┌────────────────┐     ┌──────────────┐
  │ serviceId    │ ──────────────────→ │ dining_service │ ──→ │ service_uid  │
  │ offerId      │ ──────────────────→ │ offer          │ ──→ │ offer_uid    │
  │ diningRoomId │ ──────────────────→ │ dining_room    │ ──→ │ section_uid  │
  │ tableIds[]   │ ──────────────────→ │ table          │ ──→ │ tables[]     │
  └──────────────┘                     └────────────────┘     └──────────────┘


                    INBOUND (plateforme → local)
                    ============================

  Webhook payload             SyncExternalMapping              Reservation locale
  ┌──────────────┐   findByExternalId()   ┌────────────────┐   ┌──────────────┐
  │ service_uid  │ ──────────────────────→ │ dining_service │ → │ serviceId    │
  │ offer_uid    │ ──────────────────────→ │ offer          │ → │ offerId      │
  │ section_uid  │ ──────────────────────→ │ dining_room    │ → │ diningRoomId │
  │ tables[]     │ ──────────────────────→ │ table          │ → │ tableIds[]   │
  └──────────────┘                         └────────────────┘   └──────────────┘
```
