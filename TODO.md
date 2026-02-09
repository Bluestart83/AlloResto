# TODO — VoiceOrder AI

## 🔴 Critique (avant première démo)

### SIP Service (Python)
- [ ] Implémenter `onIncomingCall()` dans main.py (actuellement vide)
  - Extraire caller_number du SIP INVITE
  - Appeler `GET /api/ai/prompt?restaurantId=xxx&callerPhone=xxx` pour récupérer le prompt + menu
  - Créer le call record via `POST /api/calls`
  - Répondre 200 OK et spawner le WebSocketWorker
- [ ] Implémenter les handlers de function calling :
  - `confirm_order` → `POST /api/orders`
  - `check_delivery_address` → `POST /api/delivery/check`
  - `save_customer_info` → `POST /api/customers`
- [ ] Mettre à jour l'appel à la fin : `PATCH /api/calls` (durée, outcome, transcript, coûts)
- [ ] Multi-call : gérer N appels simultanés (un thread/WebSocketWorker par appel)
- [ ] Config NAT/TURN dans pjsua2 (ICE + TURN activés)
- [ ] Lire le restaurantId depuis la config SIP (mapping phone_line → restaurant)
- [ ] Utiliser les SIP credentials retournés par GET /api/ai/prompt (champ sipCredentials)
  - source="client" : credentials propres au restaurant (en BDD)
  - source="demo" : fallback sur .env (ta ligne de démo)

### Dashboard (Next.js)
- [ ] **Remplacer TOUTES les fake data** dans `dashboard/page.tsx` par des vrais appels API :
  - `GET /api/calls?restaurantId=xxx` → derniers appels
  - `GET /api/orders?restaurantId=xxx` → commandes
  - `GET /api/customers?restaurantId=xxx` → top clients
  - Calculer les stats (conversion, durée moy., etc.) côté API
- [ ] Créer route `GET /api/stats?restaurantId=xxx` pour les stats agrégées :
  - Total appels / commandes / CA par période
  - Heures de pointe (GROUP BY heure)
  - Distribution distances (GROUP BY tranche)
  - Résultats appels (GROUP BY outcome)
  - Appels simultanés max (à tracker en live côté SIP)
- [ ] Ajouter sélecteur de période réel (aujourd'hui / semaine / mois) qui filtre les données
- [ ] Ajouter sélecteur de restaurant (si multi-resto)

### Base de données
- [ ] Premier `npm run db:sync` pour créer les tables
- [ ] Script de seed avec un restaurant de test + menu complet
- [ ] Vérifier que le switch SQLite → PostgreSQL fonctionne

## 🟡 Important (avant pilote restaurant)

### Pages manquantes
- [ ] `/dashboard/faq` — questions clients en attente de réponse
  - Liste des FAQs status=pending, triées par ask_count (les + demandées en haut)
  - Le restaurateur saisit la réponse → status=answered
  - Bouton "Ignorer" → status=ignored
  - Badge avec nombre de questions en attente dans la sidebar
  - Filtrer par catégorie (horaires, livraison, allergens, paiement...)
- [ ] `/dashboard/orders` — liste des commandes en temps réel
  - Filtrer par status (pending, confirmed, preparing, ready, completed)
  - Boutons pour changer le status (workflow)
  - WebSocket pour mise à jour live
- [ ] `/dashboard/calls` — historique des appels
  - Lecture du transcript
  - Lecture de l'enregistrement audio
  - Filtres par date, outcome, durée
- [ ] `/dashboard/menu` — gestion du menu (CRUD)
  - Ajouter/modifier/supprimer catégories et items
  - Toggle disponibilité (86 un plat en un clic)
  - Éditer les options et prix
- [ ] `/dashboard/customers` — liste des clients
  - Historique commandes par client
  - Modifier prénom/adresse
- [ ] `/dashboard/settings` — paramètres du restaurant
  - Infos générales, horaires
  - Config livraison (rayon, frais, minimum, seuil gratuit)
  - Config IA (voix, message d'accueil, instructions)
  - Config SIP (identifiants)

### Authentification
- [ ] Login page (`/login`)
- [ ] Auth middleware (JWT ou NextAuth)
- [ ] Rôles : admin / restaurant owner
- [ ] Associer un user à un restaurant

### Livraison
- [ ] Tester le géocodage avec des vraies adresses Marseille
- [ ] Logique frais de livraison dans confirm_order :
  - total < min_order → refuser la livraison
  - total >= free_above → livraison gratuite
  - sinon → ajouter delivery_fee
- [ ] Stocker le résultat du calcul de distance dans la commande

### Import restaurant
- [ ] Tester le scan photo de menu avec un vrai menu (photo papier)
- [ ] Tester le scraping web avec 3-4 sites de restaurants
- [ ] Gérer les erreurs d'OCR (prix illisibles, accents, formats variés)
- [ ] Preview avant sauvegarde avec tous les champs éditables

## 🟢 Nice to have (après validation POC)

### Temps réel
- [ ] WebSocket server pour push des commandes en live au dashboard
- [ ] Notification sonore quand nouvelle commande
- [ ] Counter d'appels en cours (live)

### Notifications
- [ ] SMS de confirmation au client après commande (Twilio SMS)
- [ ] Lien de paiement Stripe par SMS (optionnel)
- [ ] Notification push au restaurateur (nouvelle commande)

### Analytics avancées
- [ ] Export CSV des appels et commandes
- [ ] Comparaison période vs période
- [ ] Taux de rétention clients
- [ ] Panier moyen par type (livraison vs retrait)
- [ ] Heatmap des zones de livraison (carte)
- [ ] Coût réel par appel (tracking tokens OpenAI + minutes Twilio)

### Optimisation IA
- [ ] A/B test de prompts (mesurer conversion)
- [ ] Raccourcir les réponses IA pour réduire le coût
- [ ] Suggestions intelligentes basées sur l'historique du client
- [ ] Gestion des interruptions (client coupe l'IA)
- [ ] Fallback vers un humain si l'IA est bloquée (transfert d'appel)

### Infrastructure
- [ ] Docker Compose (sip-service + web + db)
- [ ] CI/CD (GitHub Actions)
- [ ] Monitoring / alertes (si le SIP service tombe)
- [ ] Backup automatique de la BDD
- [ ] Logs centralisés

### Multi-restaurant
- [ ] Inscription self-service
- [ ] Dashboard admin global (tous les restos)
- [ ] Facturation / billing par restaurant
- [ ] Onboarding guidé (wizard complet)

## 📝 Bugs connus / dette technique
- [ ] `restaurant-import.service.ts` utilise `openai` package directement — devrait passer par une abstraction
- [ ] Pas de validation des inputs sur les API routes (ajouter zod)
- [ ] Pas de rate limiting sur les API routes
- [ ] Pas de gestion d'erreurs unifiée (error handler middleware)
- [ ] Les types `any` dans les composants Charts.tsx → typer proprement
- [ ] Le `sync.ts` utilise `synchronize: true` — OK pour POC, dangereux en prod (utiliser migrations)
