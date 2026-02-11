# VoiceOrder AI

Systeme de commande vocale et de gestion de reservations par telephone pour restaurants. Un client appelle le numero habituel du restaurant, une IA prend sa commande ou sa reservation, verifie la disponibilite, propose les offres, et envoie le tout au dashboard du restaurateur — le tout sans Uber Eats ni ses 25-30% de commission.

## Le probleme

Les restaurants perdent entre 25% et 30% de chaque commande en ligne via les plateformes. Les petits restos n'ont pas les moyens ni le temps de developper leur propre solution. Pendant ce temps, le telephone sonne et personne ne repond quand c'est le rush.

## La solution

On remplace le telephone par une IA vocale qui :
1. Repond a chaque appel (zero appel manque)
2. Connait le menu, les prix, les options, les formules
3. Reconnait les clients fideles (prenom, adresse)
4. Verifie la zone de livraison en temps reel (Google Maps)
5. Calcule le total avec frais de livraison
6. Gere les reservations (disponibilite, services, offres)
7. Se synchronise avec les plateformes externes (Zenchef, TheFork...)
8. Envoie commandes et reservations sur le dashboard du restaurant

Le restaurant garde son numero de telephone existant. Zero friction.

## Architecture

```
┌───────── Client ──────────┐
│ Appelle le 04 91 XX XX XX │
└──────────┬────────────────┘
           │ Ligne analogique / SIP
           ▼
┌───────── VPS ─────────────────────────────────────────────────────────┐
│                                                                       │
│  SIP Bridge (pjsip)  ou  Twilio                                      │
│        ↓                                                              │
│  app.py (FastAPI) ←→ OpenAI Realtime API (GPT-4o)                    │
│        │                                                              │
│        │  Function calls :                                            │
│        │  → check_availability (pickup/delivery/reservation)          │
│        │  → confirm_order / confirm_reservation                       │
│        │  → save_customer_info / log_new_faq                          │
│        ↓                                                              │
│  Next.js 16 (Dashboard + API + ORM)                                   │
│        │                                                              │
│        ├─ Dashboard Bootstrap 5 (restaurateur)                        │
│        ├─ TypeORM → SQLite (dev) / PostgreSQL (prod)                  │
│        └─ Sync bidirectionnelle → Zenchef, TheFork, ...               │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

## Flow d'un appel

```
1. Client appelle le numero du restaurant
2. SIP Bridge recoit l'appel (ou Twilio webhook)
3. GET /api/ai/prompt → systeme recupere :
   - Menu complet avec prix, options, formules
   - Services actifs (Dejeuner, Diner, Brunch, horaires)
   - Offres disponibles (promos, menus speciaux)
   - Config livraison (rayon, frais, minimum, seuil gratuit)
   - Client connu ? → prenom + adresse memorisee
4. OpenAI Realtime demarre la conversation :
   - Client connu : "Bonjour Mohamed ! Meme adresse ?"
   - Nouveau : "Bienvenue ! C'est pour une commande ?"
5. Client commande → IA recapitule + calcule le total
   OU client reserve → IA verifie disponibilite, propose offres
6. Si livraison → check_delivery_address → Google Maps
   - "Vous etes a 2.3 km, livraison en ~35 minutes"
7. Client confirme → confirm_order/confirm_reservation → en BDD
8. Dashboard affiche la commande/reservation en temps reel
9. Sync outbound → Zenchef/TheFork si configure
```

## Structure du projet

```
voiceorder-ai/
├── .env.example                          Cles API (Google, OpenAI, SIP, TURN)
├── README.md                             Ce fichier
├── TODO.md                               Roadmap
├── QUICKSTART.md                         Guide d'installation
├── HARDWARE.md                           coturn + materiel SIP (HT841)
│
├── sip-service/                          🐍 Python (telephonie + IA vocale)
│   ├── app.py                            Proxy OpenAI Realtime (FastAPI)
│   ├── sipbridge.py                      SIP Bridge (pjsip/pjsua2)
│   ├── main-sipbridge.py                 CLI entry point SIP Bridge
│   ├── service_manager.py                Daemon multi-restaurant (spawn/monitor)
│   ├── ARCHITECTURE.md                   Doc architecture SIP
│   └── requirements.txt
│
├── web/                                  🟦 Next.js 16 (dashboard + API + ORM)
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── docs/
│   │   ├── sync-architecture.md          Doc synchronisation externe
│   │   └── google-oauth-setup.md         Setup OAuth Google
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── globals.css
│       │   │
│       │   ├── admin/
│       │   │   ├── customers/            Liste restaurants (admin)
│       │   │   ├── import/               Wizard import restaurant
│       │   │   └── servers/              Admin serveurs vocaux
│       │   │
│       │   ├── place/[restaurantId]/
│       │   │   ├── dashboard/            Dashboard restaurant
│       │   │   ├── planning/             Service Board (timeline, cuisine, livraison)
│       │   │   ├── orders/               Commandes + statuts
│       │   │   ├── reservations/         Reservations (avec service, offre, salle)
│       │   │   ├── salles/               Salles & Tables CRUD
│       │   │   ├── services/             Services (Dejeuner, Diner, Brunch) CRUD
│       │   │   ├── offres/               Offres & promotions CRUD
│       │   │   ├── menu/                 Menu CRUD
│       │   │   ├── formules/             Formules/combos CRUD
│       │   │   ├── messages/             Messages clients
│       │   │   ├── calls/                Log appels
│       │   │   ├── faq/                  FAQ CRUD
│       │   │   └── settings/             Parametres (SIP, planning, sync)
│       │   │
│       │   └── api/
│       │       ├── ai/                   Prompt + config IA (menu, services, offres)
│       │       ├── reservations/         CRUD reservations
│       │       ├── orders/               CRUD commandes
│       │       ├── dining-services/      CRUD services (DiningService)
│       │       ├── offers/               CRUD offres (Offer)
│       │       ├── rooms/                CRUD salles
│       │       ├── menu/                 CRUD menu
│       │       ├── customers/            Lookup clients
│       │       ├── availability/         Verification disponibilite
│       │       ├── delivery/             Geocodage + distance
│       │       ├── planning/             Timeline + slots
│       │       ├── sip/                  Config SIP agents
│       │       ├── admin/                Proxy admin
│       │       ├── webhooks/zenchef/     Webhook entrant Zenchef
│       │       └── sync/                 Retry sync
│       │
│       ├── components/
│       │   └── ui/Sidebar.tsx            Sidebar dynamique
│       │
│       ├── db/
│       │   ├── data-source.ts            SQLite / PostgreSQL
│       │   └── entities/                 Entites TypeORM
│       │       ├── Restaurant.ts
│       │       ├── MenuItem.ts
│       │       ├── MenuCategory.ts
│       │       ├── Order.ts
│       │       ├── Reservation.ts
│       │       ├── Customer.ts
│       │       ├── Call.ts
│       │       ├── FAQ.ts
│       │       ├── DiningRoom.ts
│       │       ├── DiningTable.ts
│       │       ├── DiningService.ts      Services (Dejeuner, Diner, Brunch)
│       │       ├── Offer.ts              Offres / promotions
│       │       ├── PhoneLine.ts
│       │       ├── ExternalLoad.ts
│       │       ├── SyncPlatformConfig.ts
│       │       ├── SyncExternalMapping.ts
│       │       └── SyncLog.ts
│       │
│       ├── services/
│       │   ├── ai-prompt.service.ts      Prompt IA + tools (menu, services, offres)
│       │   ├── availability.service.ts   Disponibilite (pickup/delivery/reservation)
│       │   ├── delivery.service.ts       Google Maps geocodage + distance
│       │   ├── restaurant-import.service.ts  Import restaurant (Places + GPT-4o)
│       │   ├── sip-encryption.service.ts     Chiffrement SIP (AES-256-GCM)
│       │   └── sync/                     Synchronisation externe
│       │       ├── mastering.service.ts
│       │       ├── external-mapping.service.ts
│       │       ├── sync-log.service.ts
│       │       ├── backfill.service.ts
│       │       ├── connectors/
│       │       │   ├── connector.interface.ts   Interface + DTOs
│       │       │   ├── connector.registry.ts    Factory
│       │       │   └── zenchef/                 Connecteur Zenchef
│       │       └── workers/
│       │           ├── outbound-sync.worker.ts  Push vers plateformes
│       │           ├── inbound-sync.worker.ts   Webhooks entrants
│       │           └── retry.worker.ts          Retry backoff
│       │
│       └── lib/
│           ├── db.ts                     Singleton DB
│           └── auth-client.ts            Client auth (better-auth)
│
└── infra/
    ├── setup_coturn.sh                   Script install coturn
    └── schema_reference.sql              Schema SQL de reference
```

## Stack technique

| Composant | Techno | Justification |
|-----------|--------|---------------|
| Telephonie SIP | PJSIP (pjsua2) Python | Seul binding SIP mature, latence minimale |
| IA vocale | OpenAI Realtime API (GPT-4o) | Conversation naturelle temps reel |
| Dashboard | Next.js 16 + Bootstrap 5 | App Router, API routes, Turbopack |
| Graphiques | Chart.js + react-chartjs-2 | Leger, Bootstrap-compatible |
| ORM | TypeORM + SWC | Decorateurs explicites (pas de metadata) |
| BDD POC | SQLite (better-sqlite3) | Zero config, un fichier |
| BDD Prod | PostgreSQL | Quand 5+ restaurants |
| Geocodage | Google Maps API | Geocoding + Distance Matrix |
| Import menu | GPT-4o Vision | Scan photo → JSON structure |
| SIP Trunk | OVH / Twilio | Numero FR, SIP Bridge ou webhook |
| NAT | coturn (TURN/STUN) | 100% fiabilite derriere NAT |
| Sync externe | Architecture connecteurs | Zenchef, TheFork, SevenRooms... |

## Fonctionnalites principales

### Gestion restaurant
- **Menu** : categories, articles, prix, options, allergenes, formules/combos
- **Services** : Dejeuner, Diner, Brunch — jours, horaires, capacite, duree, prepaiement
- **Offres** : promotions, menus speciaux, evenements — dates, taille groupe, liaison formule
- **Salles & Tables** : plan de salle, capacites, affectation

### Reservations
- Verification disponibilite par service (maxCovers, horaires, jours)
- Liaison optionnelle : service, offre, salle, tables
- Statut : pending → confirmed → seated → completed (+ cancelled, no_show)
- Synchronisation bidirectionnelle avec plateformes externes

### Commandes
- Pickup, livraison, sur place
- Verification zone de livraison (Google Maps)
- Calcul frais de livraison automatique
- Planning cuisine (timeline, queue, handoff)

### IA vocale
- Connait le menu, les formules, les services, les offres
- Reconnait les clients fideles
- Propose les offres disponibles lors d'une reservation
- Function calling : disponibilite, commande, reservation, info client, FAQ

### Synchronisation externe
- Architecture connecteurs pluggable (interface `PlatformConnector`)
- Mapping bidirectionnel des IDs (services, salles, tables, offres)
- Mastering configurable (source de verite par entite)
- Resolution de conflits automatique
- Webhooks + polling fallback
- Retry avec backoff exponentiel
- Voir `web/docs/sync-architecture.md` pour le guide complet

## Couts

| Poste | Cout |
|-------|------|
| OpenAI Realtime (par minute) | ~0.30€ (input) + audio |
| Google Maps (par verification) | ~0.01€ |
| **Total par commande (3 min)** | **~1€** |
| VPS (Hetzner) | ~5€/mois |
| SIP Trunk (OVH/Twilio) | ~3€/mois |
| Google Maps quota | ~10€/mois |

## Documentation

| Document | Contenu |
|----------|---------|
| [QUICKSTART.md](QUICKSTART.md) | Guide d'installation |
| [HARDWARE.md](HARDWARE.md) | Setup coturn + materiel SIP |
| [sip-service/ARCHITECTURE.md](sip-service/ARCHITECTURE.md) | Architecture service vocal |
| [web/docs/sync-architecture.md](web/docs/sync-architecture.md) | Architecture sync externe + guide portage |

## Licence

Projet prive — POC en cours de developpement.
