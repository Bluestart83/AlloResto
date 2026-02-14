# TODO — VoiceOrder AI (AlloResto + sip-agent-server)

## Critique (avant premiere demo)

### Plateforme IA (sip-agent-server)
- [ ] Auth bridge : le SPA sip-agent-server est servi via AlloResto (`/admin/platform/*`)
  - [x] Bridge API proxy (`/api/sip-agent/[...path]`) — auth Better Auth + role admin
  - [x] Next.js rewrites (`/admin/platform/*` → SPA Vite)
  - [x] SPA configurable via env (`VITE_API_BASE`, `VITE_BASE_PATH`, `VITE_BRAND_NAME`)
  - [ ] Configurer le SPA en mode embedded (env `.env.alloresto` avec `VITE_API_BASE=/api/sip-agent`)
  - [ ] Tester le flow complet : login AlloResto → sidebar Plateforme IA → SPA fonctionne

### Onboarding client + provisioning sip-agent-server
- [ ] A la creation d'un restaurant, provisioning auto dans sip-agent-server via API :
  - `POST /api/accounts` — creer le compte avec `balance: 20`, `currency: "EUR"`
  - `POST /api/agents` — creer l'agent avec `externalSessionUrl` vers `/api/ai`
  - `POST /api/agents/:id/tools` x12 — creer les 12 ToolConfigs (repris de `seed-alloresto.ts`)
  - `POST /api/accounts/:id/subscriptions` — abonnement gratuit 1 mois (plan trial/starter)
- [ ] Enregistrement carte bancaire a l'inscription (Stripe SetupIntent via `POST /api/billing/setup-card`)
  - Si carte enregistree : 20 EUR de credit offerts + 1 mois gratuit
  - Si pas de carte : mode demo limite (ex: 5 appels)
- [ ] Creer un plan "Trial" dans sip-agent-server (monthlyPrice: 0, duree: 1 mois, auto-cancel apres)
- [ ] Stocker l'`agentId` sip-agent-server dans l'entite `Restaurant` pour le lien retour

### Dashboard (Next.js)
- [ ] Remplacer les fake data dans `dashboard/page.tsx` par des vrais appels API
- [ ] Route `GET /api/stats?restaurantId=xxx` pour stats agregees
- [ ] Selecteur de periode reel (aujourd'hui / semaine / mois)

### Base de donnees
- [ ] Script de seed avec un restaurant de test + menu complet
- [ ] Verifier que le switch SQLite → PostgreSQL fonctionne

## Important (avant pilote restaurant)

### Pages manquantes
- [ ] `/dashboard/faq` — questions clients en attente de reponse
- [ ] `/dashboard/orders` — liste des commandes en temps reel
- [ ] `/dashboard/calls` — historique des appels (transcript + audio)
- [ ] `/dashboard/menu` — gestion du menu (CRUD)
- [ ] `/dashboard/customers` — liste des clients
- [ ] `/dashboard/settings` — parametres du restaurant

### Livraison
- [ ] Tester le geocodage avec des vraies adresses Marseille
- [ ] Logique frais de livraison dans confirm_order
- [ ] Stocker le resultat du calcul de distance dans la commande

### Import restaurant
- [ ] Tester le scan photo de menu avec un vrai menu
- [ ] Tester le scraping web avec 3-4 sites de restaurants
- [ ] Preview avant sauvegarde avec tous les champs editables

## Nice to have (apres validation POC)

### Temps reel
- [ ] WebSocket server pour push des commandes en live
- [ ] Notification sonore quand nouvelle commande
- [ ] Counter d'appels en cours (live)

### Multi-tenant / tiers
- [ ] Prevoir qu'un tiers puisse utiliser sip-agent-server pour sa propre app
  - 1 Account = 1 entreprise/app
  - NLD facture le tiers, le tiers facture ses clients
  - Dashboard sip-agent-server = dashboard de l'entreprise qui fait l'app
- [ ] Inscription self-service pour les tiers
- [ ] Isolation des donnees par account

### Analytics avancees
- [ ] Export CSV des appels et commandes
- [ ] Comparaison periode vs periode
- [ ] Cout reel par appel (tracking tokens OpenAI + minutes SIP)

### Infrastructure
- [ ] CI/CD (GitHub Actions)
- [ ] Monitoring / alertes
- [ ] Backup automatique de la BDD
- [ ] Logs centralises

## Bugs connus / dette technique
- [ ] Pas de validation des inputs sur les API routes (ajouter zod)
- [ ] Pas de rate limiting sur les API routes
- [ ] Les types `any` dans Charts.tsx → typer proprement
- [ ] `sync.ts` utilise `synchronize: true` — OK pour POC, dangereux en prod
