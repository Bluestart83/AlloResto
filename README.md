# VoiceOrder AI

Système de commande vocale par téléphone pour restaurants. Un client appelle le numéro habituel du restaurant, une IA prend sa commande, calcule le total, vérifie la zone de livraison, et envoie la commande au dashboard du restaurateur — le tout sans Uber Eats ni ses 25-30% de commission.

## Le problème

Les restaurants perdent entre 25% et 30% de chaque commande en ligne via les plateformes. Les petits restos n'ont pas les moyens ni le temps de développer leur propre solution. Pendant ce temps, le téléphone sonne et personne ne répond quand c'est le rush.

## La solution

On remplace le téléphone par une IA vocale qui :
1. Répond à chaque appel (zéro appel manqué)
2. Connaît le menu, les prix, les options
3. Reconnaît les clients fidèles (prénom, adresse)
4. Vérifie la zone de livraison en temps réel (Google Maps)
5. Calcule le total avec frais de livraison
6. Envoie la commande sur le dashboard du restaurant

Le restaurant garde son numéro de téléphone existant. Zéro friction.

## Architecture

```
┌───────── Client ──────────┐
│ Appelle le 04 91 XX XX XX │
└──────────┬────────────────┘
           │ Ligne analogique
           ▼
┌───────── Restaurant ──────┐
│ Prise murale téléphonique │
│         ↓                 │
│ Grandstream HT841 (FXO)  │
│ Convertit analogique→SIP  │
│         ↓ WiFi / 4G       │
└──────────┬────────────────┘
           │ SIP (UDP)
           ▼
┌───────── VPS ─────────────────────────────┐
│                                           │
│  coturn (TURN/STUN)  ← NAT traversal     │
│         ↓                                 │
│  SIP Service (Python/PJSIP)              │
│    - Reçoit l'appel SIP                  │
│    - Appelle GET /api/ai/prompt          │
│      → récupère menu + prix + client     │
│    - Connecte à OpenAI Realtime API      │
│    - Audio bidirectionnel en temps réel   │
│    - Function calls :                     │
│      → check_delivery_address            │
│      → confirm_order                      │
│      → save_customer_info                │
│         ↓                                 │
│  Next.js (Dashboard + API)               │
│    - API REST pour le SIP service        │
│    - Dashboard Bootstrap + Chart.js      │
│    - TypeORM → SQLite (POC) / PG (prod) │
│                                           │
└───────────────────────────────────────────┘
```

## Flow d'un appel

```
1. Client appelle le 04 91 XX XX XX
2. HT841 convertit en SIP → VPS
3. PJSIP reçoit l'appel, extrait le numéro appelant
4. GET /api/ai/prompt → système récupère :
   - Menu complet avec prix et options
   - Config livraison (rayon, frais, minimum, seuil gratuit)
   - Client connu ? → prénom + adresse mémorisée
5. OpenAI Realtime démarre la conversation :
   - Client connu : "Bonjour Mohamed ! Même adresse ?"
   - Nouveau : "Bienvenue ! C'est pour une commande ?"
6. Client commande → IA récapitule + calcule le total
7. Si livraison → check_delivery_address → Google Maps
   - "Vous êtes à 2.3 km, livraison en ~35 minutes"
   - OU "Désolé, vous êtes hors zone (7km, max 5km)"
8. Client confirme → confirm_order → commande en BDD
9. Dashboard affiche la commande en temps réel
```

## Structure du projet

```
voiceorder-ai/
├── .env.example                          ← Clés API (Google, OpenAI, SIP, TURN)
├── .gitignore
├── README.md                             ← ce fichier
├── TODO.md                               ← tout ce qu'il reste à faire
├── QUICKSTART.md                         ← guide d'installation
├── HARDWARE.md                           ← coturn + matériel SIP (HT841)
├── restaurant-import-format.json         ← format JSON pour importer un restaurant
│
├── sip-service/                          ← 🐍 Python (UNIQUEMENT la téléphonie)
│   ├── main.py                           ← PJSIP + OpenAI Realtime
│   ├── requirements.txt
│   └── README.md
│
├── web/                                  ← 🟦 Next.js (dashboard + API + ORM)
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx                ← Bootstrap 5
│       │   ├── globals.css
│       │   ├── dashboard/
│       │   │   ├── layout.tsx            ← sidebar
│       │   │   └── page.tsx              ← stats, graphes, tableaux
│       │   ├── import/
│       │   │   └── page.tsx              ← wizard import restaurant
│       │   └── api/
│       │       ├── ai/route.ts           ← prompt + menu pour le SIP service
│       │       ├── restaurants/route.ts
│       │       ├── customers/route.ts    ← lookup par téléphone
│       │       ├── calls/route.ts        ← log appels
│       │       ├── orders/route.ts
│       │       ├── menu/route.ts         ← CRUD menu
│       │       ├── delivery/check/       ← géocodage + distance
│       │       └── import/route.ts       ← Google Places + scan menu
│       ├── components/
│       │   ├── ui/Sidebar.tsx
│       │   └── dashboard/
│       │       ├── StatCard.tsx
│       │       ├── PricingCard.tsx
│       │       ├── Charts.tsx            ← 5 graphiques Chart.js
│       │       ├── RecentCallsTable.tsx
│       │       └── TopCustomersTable.tsx
│       ├── db/
│       │   ├── data-source.ts            ← switch SQLite / PostgreSQL
│       │   ├── sync.ts
│       │   └── entities/                 ← 9 entités TypeORM
│       ├── services/
│       │   ├── ai-prompt.service.ts      ← construit prompt + tools avec le menu
│       │   ├── delivery.service.ts       ← Google Maps géocodage + distance
│       │   └── restaurant-import.service.ts
│       ├── lib/db.ts
│       └── types/index.ts
│
└── infra/
    ├── setup_coturn.sh                   ← script install coturn
    └── schema_reference.sql              ← schéma SQL de référence
```

## Stack technique

| Composant | Techno | Justification |
|-----------|--------|---------------|
| Téléphonie SIP | PJSIP (pjsua2) Python | Seul binding SIP mature, latence minimale |
| IA vocale | OpenAI Realtime API | Conversation naturelle temps réel |
| Dashboard | Next.js 14 + Bootstrap 5 | SSR, API routes intégrées, UI pro |
| Graphiques | Chart.js + react-chartjs-2 | Léger, Bootstrap-compatible |
| ORM | TypeORM | Pattern Doctrine, compatible SQLite + PG |
| BDD POC | SQLite (better-sqlite3) | Zero config, un fichier |
| BDD Prod | PostgreSQL | Quand 5+ restaurants |
| Géocodage | Google Maps API | Geocoding + Distance Matrix |
| Import menu | GPT-4o Vision | Scan photo → JSON structuré |
| SIP Trunk | Twilio Elastic SIP Trunking | Numéro FR, fiable, pas cher |
| NAT | coturn (TURN/STUN) | 100% fiabilité derrière NAT |
| ATA | Grandstream HT841 | FXO, failover analogique, ~140€ |

## Coûts

| Poste | Coût |
|-------|------|
| Twilio SIP (par minute) | ~0.008€ |
| OpenAI Realtime (par minute) | ~0.30€ (input) + audio |
| Google Maps (par vérification) | ~0.01€ |
| **Total par commande (3 min)** | **~1€** |
| VPS (Hetzner) | ~5€/mois |
| Twilio numéro FR | ~3€/mois |
| Google Maps quota | ~10€/mois |

## Licence

Projet privé — POC en cours de développement.
