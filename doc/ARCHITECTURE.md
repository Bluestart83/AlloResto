# AlloResto -- Architecture

## Vue d'ensemble

AlloResto est une plateforme de gestion de restaurants avec prise de commande vocale par IA. Le systeme gere le menu, les commandes, les reservations, la livraison, la planification cuisine, et s'interface avec un serveur vocal externe (sip-agent-server) pour les appels telephoniques.

---

## Stack technique

| Couche         | Technologie                                    |
| -------------- | ---------------------------------------------- |
| Frontend       | Next.js 16 (App Router) + Turbopack + SWC      |
| UI             | Bootstrap 5 + bootstrap-icons                  |
| Graphiques     | chart.js / react-chartjs-2                      |
| ORM            | TypeORM                                         |
| Base de donnees | better-sqlite3                                 |
| IA (menu)      | OpenAI GPT-4o (extraction de menu)              |
| IA (voix)      | OpenAI Realtime API (via sip-agent-server)       |
| Geocodage      | Google Places API + SerpApi                      |

---

## Structure du monorepo

```
AlloResto/
  web/                   # Application Next.js principale
    src/
      app/               # Routes App Router (pages + API)
      db/entities/        # Entites TypeORM (22 fichiers)
      services/           # Services metier
      components/         # Composants React
      lib/                # Utilitaires (db.ts, etc.)
      types/              # Types TypeScript
  sip-service/            # SIP Bridge uniquement (voix via sip-agent-server)
    sipbridge.py          # Librairie SIP Bridge (pjsip + FastAPI REST)
    main-sipbridge.py     # Point d'entree sipbridge
  doc/                    # Documentation
```

Le moteur vocal (OpenAI Realtime, gestion Twilio/SIP, execution des tools, suivi des couts) a ete deporte vers **sip-agent-server** (projet separe). AlloResto conserve uniquement le SIP Bridge (`sipbridge.py`) et expose les API necessaires (`/api/ai`, `/api/ai/tools/*`, `/api/availability/check`).

---

## Services principaux

| Service                            | Fichier                                          | Role                                                              |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| AI Prompt                          | `services/ai-prompt.service.ts`                  | Construit le system prompt + tools + contexte pour une session IA  |
| Disponibilite                      | `services/availability.service.ts`               | Verification unifiee (retrait, livraison, reservation)             |
| Livraison                          | `services/delivery.service.ts`                   | Geocodage Google Maps + matrice de distance                        |
| Import restaurant                  | `services/restaurant-import.service.ts`           | Pipeline d'import (Google Places, scan menu IA, scrape web)        |
| Moteur de planning                 | `services/planning-engine.service.ts`             | Timeline cuisine, scheduling commandes, creneaux dispo             |
| Chiffrement SIP                    | `services/sip-encryption.service.ts`              | AES-256-GCM pour les mots de passe SIP                            |
| Optimisation tournees              | `services/route-optimization.service.ts`          | Optimisation des tournees de livraison                             |
| Taux de change                     | `services/exchange-rate.service.ts`               | Conversion USD vers devise locale (EUR, etc.)                      |

---

## Base de donnees -- Entites

22 entites TypeORM, stockees en SQLite :

| Entite                 | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `Restaurant`           | Configuration complete (menu, livraison, reservation, SIP, planning, IA) |
| `Customer`             | Client identifie par telephone + restaurant                 |
| `Order`                | Commande (pickup, delivery, dine_in) avec statut            |
| `OrderItem`            | Ligne de commande (article, quantite, options, prix)        |
| `MenuItem`             | Article du menu ou formule (categoryId=null pour formule)   |
| `MenuCategory`         | Categorie de menu (Entrees, Plats, etc.)                    |
| `Reservation`          | Reservation de table                                        |
| `DiningRoom`           | Salle de restaurant                                         |
| `DiningTable`          | Table dans une salle                                        |
| `DiningService`        | Service (dejeuner, diner, brunch) avec horaires et config    |
| `PhoneLine`            | Ligne telephonique SIP associee a un restaurant              |
| `Call`                 | Journal d'appel (duree, issue, couts)                       |
| `BlockedPhone`         | Numero bloque                                               |
| `Message`              | Message laisse par un client (rappel, reclamation)           |
| `Faq`                  | Question frequente (remontee IA ou saisie manuelle)          |
| `Offer`                | Offre / promotion (menu, reduction, evenement)               |
| `DeliveryTrip`         | Tournee de livraison (groupement de commandes)               |
| `ExternalLoad`         | Charge externe planning (dine_in, phone, incident, prep_batch) |
| `SyncPlatformConfig`   | Configuration de synchronisation plateforme (Zenchef, etc.)  |
| `SyncLog`              | Journal de synchronisation (succes, erreur, retry)           |
| `SyncExternalMapping`  | Mapping ID interne / ID plateforme externe                   |
| `PricingConfig`        | Configuration tarification IA (marges, taux, couts telecom)  |

---

## Pattern TypeORM + SWC/Turbopack

SWC ne peut pas emettre les metadonnees de decorateurs. Regles obligatoires :

1. **Type explicite** sur chaque `@Column()` :
   ```ts
   @Column({ type: "varchar", nullable: true })
   name: string | null;
   ```

2. **Relations en string** pour eviter les dependances circulaires :
   ```ts
   @ManyToOne("Restaurant", "menuItems")
   restaurant: Restaurant;
   ```

3. **`import type`** pour les imports d'entites dans les relations circulaires.

4. **Cast `.create()`** pour eviter les erreurs TS :
   ```ts
   ds.getRepository(Order).create(data as Partial<Order>) as Order
   ```

5. **Initialisation DB** : utiliser `getDb()` de `@/lib/db` (singleton, `AppDataSource.initialize()` une seule fois). FK checks desactives pendant `synchronize`.

---

## Moteur de planning

Le planning cuisine gere 4 ressources :

| Ressource      | Description                              |
| -------------- | ---------------------------------------- |
| `cuisine`      | Preparation en cuisine (poste principal) |
| `preparation`  | Preparation intermediaire                |
| `comptoir`     | Assemblage / remise au comptoir          |
| `livraison`    | Expedition / livreur                     |

Configuration :
- **Tailles de commande** : S (1-2 articles), M (3-5), L (6+) -- classification automatique via `classifyOrderSize()`
- **Bandes horaires** : capacite variable par tranche (rush / creux)
- **Profils par taille** : durees et buffers differents selon S/M/L
- **PlanningConfig** : stocke en JSON sur `Restaurant.planningConfig`

API :
- `GET /api/planning/timeline` -- timeline complete (commandes + charges externes)
- `GET /api/planning/available-slots` -- creneaux disponibles
- `GET/POST/PATCH/DELETE /api/planning/external-loads` -- charges hors-systeme

---

## Systeme de reservation

Flux de statuts :

```
pending --> confirmed --> seated --> completed
   |           |
   +--> cancelled    +--> no_show
```

Configuration sur `Restaurant` :
- `reservationEnabled` -- activation
- `totalSeats` -- capacite totale
- `avgMealDurationMin` -- duree moyenne d'un repas
- `minReservationAdvanceMin` -- delai minimum
- `maxReservationAdvanceDays` -- horizon maximum

La verification de disponibilite compte les reservations chevauchantes vs `totalSeats`. Les `DiningService` definissent les creneaux (jours, horaires, couverts max, prepaiement).

---

## Formules (menus composes)

Les formules sont des `MenuItem` avec `categoryId: null`. Leurs options utilisent un champ `source` :

| Source       | Description                                          |
| ------------ | ---------------------------------------------------- |
| `"category"` | Choix parmi tous les articles d'une categorie        |
| `"items"`    | Choix parmi des articles specifiques (ou item fixe)  |
| _(absent)_   | Format `choices` classique (variantes label + prix)  |

- `maxPrice` : filtre par prix maximum (pas de supplement)
- L'IA utilise `category_ref` / `item_refs` en strings, resolus en UUID dans `persistImport`
- Items et formules peuvent partager le meme nom (dedup via prefixe `formule:` vs `item:`)

---

## Integration vocale

AlloResto ne contient plus de moteur vocal propre. L'architecture repose sur **sip-agent-server** :

1. sip-agent-server appelle `GET /api/ai?restaurantId=xxx&callerPhone=xxx`
2. AlloResto retourne `{ systemPrompt, tools[], greeting, initialContext, sipCredentials, ... }`
3. sip-agent-server gere la session OpenAI Realtime et execute les tools
4. Les tools de confirmation appellent les API fines d'AlloResto :
   - `POST /api/ai/tools/confirm-order` -- resolution #N vers UUID, creation commande
   - `POST /api/ai/tools/cancel-order` -- annulation de commande
   - `POST /api/availability/check` -- verification de disponibilite

Voir [VOICE.md](./VOICE.md) pour les details.

---

## Chiffrement SIP

- Algorithme : AES-256-GCM avec derivation PBKDF2
- Cle : `ENCRYPTION_KEY` dans `.env` (64 caracteres hex = 32 octets)
- Sel : `phoneLineId` (UUID) par ligne
- Format stocke : `iv:authTag:ciphertext` (base64)
- Detection automatique plaintext vs chiffre via `isEncrypted()`
