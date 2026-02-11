# Optimisation de tournees de livraison

## Vue d'ensemble

Le systeme d'optimisation de tournees permet de regrouper plusieurs commandes de livraison en une seule tournee optimisee. Le livreur recoit une **feuille de route** avec la sequence d'arrets optimale, les ETAs, et un lien Google Maps pour le guidage GPS.

## Architecture

```
Page Courier (selection commandes)
    |
    v
POST /api/delivery-trips { restaurantId, orderIds[] }
    |
    v
route-optimization.service.ts
    |-- Google Directions API (optimizeWaypoints: true)
    |-- Fallback: haversine + nearest-neighbor
    |
    v
DeliveryTrip entity (stops ordonnes, ETAs, Google Maps URL)
    |
    v
Page Feuille de Route (/livraisons/[tripId])
    |-- Liste des arrets avec ETAs
    |-- Bouton "Livre" par arret
    |-- Lien Google Maps
```

## Entite DeliveryTrip

Table `delivery_trips` :

| Champ | Type | Description |
|-------|------|-------------|
| id | UUID | Cle primaire |
| restaurantId | FK | Restaurant proprietaire |
| status | varchar | `planning` / `in_progress` / `completed` / `cancelled` |
| stops | JSON | Tableau ordonne de `TripStop` |
| totalDistanceKm | decimal | Distance totale de la tournee |
| totalDurationMin | int | Duree totale estimee (inclut temps de remise) |
| orderCount | int | Nombre de commandes |
| googleMapsUrl | text | URL pre-calculee pour navigation |
| overviewPolyline | text | Polyline Google (pour carte future) |
| startedAt | datetime | Debut de la tournee |
| completedAt | datetime | Fin de la tournee |

### TripStop (JSON)

```typescript
interface TripStop {
  orderId: string;
  sequence: number;          // 0-based, ordre optimise
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  estimatedArrival: string;  // ISO datetime
  legDistanceKm: number;    // distance depuis le stop precedent
  legDurationMin: number;    // duree depuis le stop precedent
  deliveredAt: string | null; // null jusqu'a confirmation
  orderTotal: number;
  itemCount: number;
  notes: string | null;
}
```

### Relation avec Order

L'entite `Order` a un champ `tripId` (FK nullable) qui lie une commande a sa tournee.

## API Endpoints

### POST /api/delivery-trips

Cree une tournee optimisee a partir de commandes selectionnees.

**Body:**
```json
{
  "restaurantId": "uuid",
  "orderIds": ["uuid1", "uuid2", "uuid3"]
}
```

**Validations:**
- Toutes les commandes doivent etre du meme restaurant
- Toutes doivent etre de type `delivery` et en status `ready`
- Aucune ne doit deja avoir un `tripId`
- Le restaurant doit avoir des coordonnees (lat/lng)

**Resultat:** Cree le DeliveryTrip, optimise la route, met les commandes en status `delivering`.

### GET /api/delivery-trips?restaurantId=xxx&status=active|completed|all

Liste les tournees. `active` = `planning` + `in_progress`.

### GET /api/delivery-trips/[tripId]

Detail d'une tournee avec tous les stops.

### PATCH /api/delivery-trips/[tripId]

Actions disponibles :

| Action | Body | Effet |
|--------|------|-------|
| `start` | `{ action: "start" }` | Status → `in_progress` |
| `deliver_stop` | `{ action: "deliver_stop", orderId: "uuid" }` | Marque le stop livre, commande → `completed`. Auto-complete si tous livres. |
| `complete` | `{ action: "complete" }` | Termine la tournee, toutes les commandes restantes → `completed` |
| `cancel` | `{ action: "cancel" }` | Annule la tournee, commandes → `ready`, tripId → null |

## Optimisation de route

### Google Directions API (principal)

Utilise `optimizeWaypoints: true` qui resout le TSP (Travelling Salesman Problem) pour reordonner les waypoints.

- **Origin:** coordonnees du restaurant
- **Destination:** restaurant (circuit complet pour optimisation)
- **Waypoints:** toutes les adresses de livraison
- **Cout:** ~0.01 EUR par appel
- **Limite:** 25 waypoints max

L'API retourne `waypoint_order` (indices reordonnes) et `legs` (distance/duree par segment).

### Fallback: Nearest-Neighbor (gratuit)

Si l'API Google echoue ou n'est pas configuree :
1. Part du restaurant
2. A chaque etape, choisit le stop le plus proche (haversine)
3. Applique un facteur 1.4x sur les distances + estimation 25 km/h

### Constantes

- `DWELL_TIME_MIN = 3` — temps de remise par arret
- Le retour au restaurant n'est pas compte dans la tournee du livreur

## Pages UI

### /place/[restaurantId]/livraisons

Liste de toutes les tournees avec onglets : En cours / Terminees / Toutes.

### /place/[restaurantId]/livraisons/[tripId]

**Feuille de route** mobile-first :
- Resume : nb arrets, distance, duree, barre de progression
- Liste des stops en ordre optimise
- Par stop : nom client, telephone (cliquable), adresse, articles, ETA
- Bouton "Livre" par stop
- Lien "Ouvrir dans Google Maps" pour navigation GPS
- Bouton "Terminer la tournee" / "Annuler"
- Auto-refresh 30s

### /place/[restaurantId]/planning/courier (modifie)

Ajout du bouton "Tournee (N)" a cote de "Prendre N commande(s)" quand des commandes sont selectionnees. Affiche aussi les tournees actives en haut de la page.

## Flux livreur typique

1. Livreur ouvre la **page courier** sur son telephone
2. Voit les commandes pretes a livrer
3. Selectionne 3-5 commandes → clique **"Tournee (5)"**
4. Le systeme optimise la route via Google Directions
5. Redirect vers la **feuille de route**
6. Clique **"Ouvrir dans Google Maps"** pour le guidage GPS
7. A chaque arret, clique **"Livre"** pour confirmer
8. Une fois tous les stops livres → **"Terminer la tournee"**

## Fichiers

| Fichier | Role |
|---------|------|
| `web/src/db/entities/DeliveryTrip.ts` | Entite TypeORM |
| `web/src/db/entities/Order.ts` | Champ `tripId` ajoute |
| `web/src/services/route-optimization.service.ts` | Logique d'optimisation |
| `web/src/app/api/delivery-trips/route.ts` | API GET + POST |
| `web/src/app/api/delivery-trips/[tripId]/route.ts` | API GET + PATCH |
| `web/src/app/place/[restaurantId]/livraisons/page.tsx` | Liste des tournees |
| `web/src/app/place/[restaurantId]/livraisons/[tripId]/page.tsx` | Feuille de route |
| `web/src/app/place/[restaurantId]/planning/courier/page.tsx` | Page courier (modifiee) |
