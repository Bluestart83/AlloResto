# AlloResto SaaS — Architecture Cible

## Objectif

Plateforme SaaS multi-tenant de prise de commande vocale IA pour 1000+ restaurants.
Coût optimisé : on paie uniquement ce qu'on consomme.

## Principe clé : découplage SIP / IA

| Composant | Mode | Rôle |
|---|---|---|
| **SIP Bridges** | H24, scaling horizontal | Maintiennent les registrations SIP, reçoivent les appels |
| **AI Workers** | On-demand, scale to zero | Gèrent la conversation IA (OpenAI Realtime) |

Analogie : overbooking avion. 1000 restos abonnés, jamais plus de 100-150 en appel simultané.

---

## Composants

### 1. App Web (Next.js, multi-tenant)

- 1 seule app, tous les restaurateurs s'y connectent
- Routes : `/place/[restaurantId]/*` (menu, commandes, réservations, config)
- Pods K8s autoscalés (2-10 replicas)
- Stateless, tout en Postgres/Redis

### 2. Postgres (base unique, managed)

- Données métier : restos, menus, commandes, clients, réservations, factures
- Nouvelles tables : `sip_bridge_node`, `sip_registration`, `ai_worker_node`
- Attribution resto → bridge stockée en DB

### 3. Redis (managed)

- Cache config resto (menu, FAQ, prompt IA) — TTL 5 min
- État temps réel des bridges et workers
- Queue FIFO des appels entrants (`queue:incoming_calls`)
- Compteurs : appels actifs, queue size

### 4. SIP Bridges (H24)

- Chaque pod gère jusqu'à 200 registrations SIP
- Maintient les REGISTER sur le trunk SIP (refresh 60s)
- Quand un appel arrive :
  1. Décroche (200 OK)
  2. Ouvre un stream audio (RTP → WebSocket interne)
  3. Push dans la queue Redis : `{restaurantId, callId, audioWsUrl}`
  4. Attend qu'un AI Worker prenne l'appel
- Autoscale sur `sip_registrations_count` (min 2, max 50 pods)
- Scale down graceful : drain registrations vers autres bridges avant suppression

### 5. AI Workers (on-demand)

- Génériques : savent rien du resto au démarrage
- Cycle : poll queue Redis → reçoit assignation → pull config depuis Redis → connecte OpenAI Realtime → gère l'appel → libéré
- 1 pod = 1 appel actif
- Autoscale sur `queue_size` (min 0, max 500 pods)
- Scale to zero la nuit (coût = 0)
- Si aucun worker dispo : bridge joue "Tous nos agents sont occupés"

### 6. Controller (1 replica)

- Attribution des registrations aux bridges (least loaded)
- Health monitoring (heartbeats Redis)
- Failover : bridge down → réattribue ses registrations
- Cache invalidation : écoute NOTIFY Postgres → invalide Redis
- Expose métriques Prometheus

---

## Flux principaux

### Appel entrant

```
Client appelle → Trunk SIP → Bridge (a la registration)
→ Bridge décroche, ouvre audio stream
→ Push dans queue Redis
→ AI Worker poll, prend l'appel
→ Pull config resto depuis Redis
→ Connecte OpenAI Realtime
→ Bridge audio ↔ OpenAI (conversation)
→ Raccrochage → log en DB → worker libéré
```

### Création restaurant

```
App Web crée resto en DB
→ Controller notifié
→ Trouve bridge le moins chargé
→ Crée sip_registration en DB
→ Notifie le bridge (PUB/SUB Redis)
→ Bridge enregistre le numéro sur le trunk SIP
```

### Mise à jour menu

```
Restaurateur modifie menu sur App Web
→ UPDATE Postgres
→ NOTIFY Postgres → Controller
→ Invalide cache Redis (menu + prompt)
→ Prochain appel : worker rebuild depuis Postgres
```

---

## Infrastructure Kubernetes (OVH)

### Node Pools

| Pool | Flavor | Min-Max | Usage |
|---|---|---|---|
| web | b3-8 (2 vCPU, 8 GB) | 2-4 | App Web + Controller |
| sip | b3-16 (4 vCPU, 16 GB) | 1-5 | SIP Bridges |
| workers | b3-8 (2 vCPU, 8 GB) | 0-20 | AI Workers |

### Services managés

| Service | Prix estimé |
|---|---|
| Managed Kubernetes | Gratuit (on paie les nodes) |
| Managed PostgreSQL | ~30€/mois |
| Managed Redis | ~15€/mois |

### Networking

- HTTPS → OVH LB → Ingress → App Web
- SIP/RTP (UDP) → Pods bridges en `hostNetwork: true` ou NodePort

---

## Coûts estimés (1000 restos)

| Poste | Coût/mois |
|---|---|
| Infra fixe (nodes web + SIP + DB + Redis) | ~160€ |
| Workers (variable, scale to zero) | ~100-150€ |
| **Total infra** | **~260-310€** |
| **Par restaurant (infra)** | **~0.30€** |
| Trunk SIP / numéro (par resto) | ~5-8€ |
| OpenAI Realtime (par resto, ~30 appels/jour) | ~300-600€ |

Le coût serveur est négligeable. 99% du coût = OpenAI Realtime API.

---

## Migration (4 phases)

1. **Dockerisation** — containeriser app.py, sipbridge.py, Next.js
2. **Découplage** — séparer SIP bridge (registration) de AI worker (conversation), communication via Redis queue
3. **Kubernetes** — déployer sur OVH K8s, migrer SQLite → Postgres, ajouter Redis, configurer HPA
4. **Production** — monitoring Prometheus/Grafana, alerting, tests de charge
