# Architecture AlloResto SaaS — Spécification Technique

## Contexte

AlloResto est une plateforme SaaS multi-tenant de prise de commande vocale par IA pour les restaurants.
L'objectif est de supporter 1000+ restaurants sur une infrastructure scalable, avec un coût optimisé
(payer uniquement ce qu'on consomme).

L'architecture actuelle (1 service_manager + subprocesses locaux) ne scale pas.
Cette spec décrit le découplage en **SIP Bridges** (H24) et **AI Workers** (on-demand).

---

## Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────┐
│                        COUCHE WEB                                │
│                                                                  │
│  App Web Next.js (multi-tenant)                                  │
│  alloresto.com                                                   │
│  - 1000 restaurateurs se connectent pour paramétrer              │
│  - Menus, horaires, FAQ, config SIP                              │
│  - Pods K8s autoscalés (2-10 replicas)                           │
└──────────────────────┬───────────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │                           │
   ┌─────┴─────┐             ┌──────┴──────┐
   │ Postgres   │             │   Redis      │
   │ (managed)  │             │  (managed)   │
   │            │             │              │
   │ - restos   │             │ - cache menu │
   │ - menus    │             │ - état workers│
   │ - commandes│             │ - queue appels│
   │ - clients  │             │ - sessions   │
   │ - factures │             │              │
   └────────────┘             └──────┬───────┘
                                     │
┌────────────────────────────────────┼─────────────────────────────┐
│                     COUCHE SIP / VOIX                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  SIP Bridges (H24, autoscale sur nb registrations)      │     │
│  │                                                         │     │
│  │  - Maintiennent les registrations SIP (REGISTER)        │     │
│  │  - Reçoivent les appels entrants (INVITE)               │     │
│  │  - Routent l'audio vers un AI Worker via Redis queue    │     │
│  │  - 1 pod = jusqu'à 200 registrations                    │     │
│  │  - Autoscale: min 2, max 50 pods                        │     │
│  │  - Scaling metric: sip_registrations_count              │     │
│  └──────────────────────┬──────────────────────────────────┘     │
│                         │ appel entrant !                         │
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  AI Workers (on-demand, autoscale sur nb appels)        │     │
│  │                                                         │     │
│  │  - Génériques : savent rien du resto au démarrage       │     │
│  │  - Reçoivent assignation : resto ID + audio stream      │     │
│  │  - Pull config resto depuis Redis cache                 │     │
│  │  - Connectent OpenAI Realtime API                       │     │
│  │  - Gèrent la conversation IA ↔ audio                   │     │
│  │  - Appel fini → pod libéré (scale to zero possible)    │     │
│  │  - 1 pod = 1 appel actif                                │     │
│  │  - Autoscale: min 0, max 500 pods                       │     │
│  │  - Scaling metric: queue_size + active_calls            │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Composants détaillés

### 1. App Web (Next.js)

**Rôle** : Interface de gestion pour les restaurateurs + API métier.

- **Multi-tenant** : tous les restos sur la même app, filtrés par `restaurantId`
- **Stateless** : aucun état en mémoire, tout en Postgres/Redis
- **Routes existantes** : `/place/[restaurantId]/*` (menu, commandes, réservations, etc.)
- **Nouvelle route** : `/admin/infrastructure` — monitoring des bridges et workers

**Scaling** :
- HPA Kubernetes : 2 à 10 pods
- Metric : CPU / requests per second
- Chaque pod : 512 MB RAM, 0.5 CPU

### 2. Postgres (base unique)

**Rôle** : Source de vérité pour toutes les données métier.

**Tables existantes** : Restaurant, MenuItem, MenuCategory, Order, OrderItem, Customer,
Reservation, PhoneLine, CallLog, FAQ, DiningRoom, Table, ExternalLoad.

**Nouvelles tables** :

```sql
-- Registre des SIP Bridges actifs
CREATE TABLE sip_bridge_node (
    id UUID PRIMARY KEY,
    hostname VARCHAR NOT NULL,          -- ex: sip-bridge-7b4d9-xyz
    pod_ip VARCHAR NOT NULL,
    registrations_count INTEGER DEFAULT 0,
    max_registrations INTEGER DEFAULT 200,
    status VARCHAR DEFAULT 'healthy',   -- healthy, draining, down
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Attribution resto → bridge
CREATE TABLE sip_registration (
    id UUID PRIMARY KEY,
    restaurant_id UUID REFERENCES restaurant(id),
    phone_line_id UUID REFERENCES phone_line(id),
    bridge_node_id UUID REFERENCES sip_bridge_node(id),
    sip_uri VARCHAR NOT NULL,           -- ex: sip:+33123456789@trunk.ovh.net
    status VARCHAR DEFAULT 'registered', -- registered, unregistered, error
    registered_at TIMESTAMP,
    UNIQUE(phone_line_id)
);

-- Pool d'AI Workers
CREATE TABLE ai_worker_node (
    id UUID PRIMARY KEY,
    hostname VARCHAR NOT NULL,
    pod_ip VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'idle',      -- idle, busy, draining
    current_restaurant_id UUID,
    current_call_id UUID,
    started_at TIMESTAMP,
    last_heartbeat TIMESTAMP
);
```

**Managed OVH** : OVH Managed PostgreSQL (Essential, 4 GB RAM, ~30€/mois).

### 3. Redis

**Rôle** : Cache, état temps réel, queue d'appels.

**Clés** :

```
# Cache config resto (TTL 5 min, invalidé sur update)
resto:{id}:config        → JSON {name, address, hours, sipUri, ...}
resto:{id}:menu          → JSON [{items...}]
resto:{id}:faq           → JSON [{questions...}]
resto:{id}:prompt        → String (system prompt compilé)

# État des bridges
bridge:{nodeId}:registrations   → SET de phoneLineIds
bridge:{nodeId}:heartbeat       → timestamp
bridge:{nodeId}:count           → INTEGER

# État des workers
worker:{nodeId}:status          → "idle" | "busy"
worker:{nodeId}:call            → JSON {restaurantId, callId, startedAt}

# Queue d'appels en attente
queue:incoming_calls            → LIST (FIFO)
# Format: {restaurantId, phoneLineId, callId, bridgeNodeId, audioStreamUrl, timestamp}

# Compteurs temps réel
stats:active_calls              → INTEGER
stats:queued_calls              → INTEGER
stats:calls_today               → INTEGER
```

**Managed OVH** : OVH Managed Redis (Essential, ~15€/mois).

### 4. SIP Bridge (H24)

**Rôle** : Maintenir les registrations SIP et router les appels entrants vers les AI Workers.

**Image Docker** : `alloresto/sip-bridge`

**Responsabilités** :
1. Au démarrage : récupère la liste de ses registrations depuis Postgres
2. Enregistre chaque numéro sur le trunk SIP (pjsip REGISTER)
3. Renouvelle les registrations (REGISTER refresh toutes les 60s)
4. Quand un appel arrive (INVITE) :
   - Décroche (200 OK)
   - Ouvre un stream audio (RTP → WebSocket)
   - Publie dans la queue Redis : `{restaurantId, callId, audioStreamWsUrl}`
   - Attend qu'un AI Worker prenne l'appel
5. Heartbeat vers Redis toutes les 10s

**Specs pod** :
- RAM : 256-512 MB
- CPU : 0.25
- Ports : UDP 5060 (SIP signaling) + range UDP 10000-20000 (RTP)
- Network : hostNetwork ou NodePort (SIP/RTP nécessite des ports UDP exposés)

**Autoscaling** :
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: sip-bridge
spec:
  scaleTargetRef:
    kind: Deployment
    name: sip-bridge
  minReplicas: 2          # redondance minimum
  maxReplicas: 50
  metrics:
    - type: Pods
      pods:
        metric:
          name: sip_registrations_count
        target:
          averageValue: 200
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300   # pas de scale down brusque
      policies:
        - type: Pods
          value: 1                       # 1 pod à la fois (drain graceful)
          periodSeconds: 120
```

**Scale down graceful** :
1. Pod marqué "draining"
2. Ses registrations sont réattribuées à d'autres pods
3. Attend que les appels en cours se terminent
4. Pod supprimé

### 5. AI Worker (on-demand)

**Rôle** : Gérer la conversation vocale IA pour un appel.

**Image Docker** : `alloresto/ai-worker`

**Cycle de vie d'un appel** :
1. Worker idle poll la queue Redis (`BLPOP queue:incoming_calls`)
2. Reçoit assignation : `{restaurantId, callId, audioStreamWsUrl}`
3. Pull config resto depuis Redis cache (menu, FAQ, horaires, prompt)
4. Ouvre WebSocket vers OpenAI Realtime API
5. Connecte les deux streams : Bridge audio ↔ OpenAI
6. Gère les function calls (check_availability, confirm_order, etc.)
7. Appel terminé → log dans Postgres (CallLog) + mise à jour commande
8. Retourne en idle → poll la queue

**Specs pod** :
- RAM : 256-512 MB
- CPU : 0.5
- Pas de ports exposés (connexions sortantes uniquement : WebSocket vers bridge + OpenAI)

**Autoscaling** :
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ai-worker
spec:
  scaleTargetRef:
    kind: Deployment
    name: ai-worker
  minReplicas: 0            # scale to zero la nuit
  maxReplicas: 500
  metrics:
    - type: External
      external:
        metric:
          name: redis_queue_size
          selector:
            matchLabels:
              queue: incoming_calls
        target:
          type: AverageValue
          averageValue: 1     # 1 appel en attente = 1 nouveau pod
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0    # scale up immédiat
      policies:
        - type: Pods
          value: 10                     # jusqu'à 10 pods d'un coup
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 5
          periodSeconds: 30
```

### 6. Orchestrateur / Controller

**Rôle** : Gère l'attribution des registrations aux bridges et le monitoring global.

**Image Docker** : `alloresto/sip-controller`

**Responsabilités** :
1. **Attribution des registrations** :
   - Nouveau resto créé → assigne ses lignes SIP au bridge le moins chargé
   - Bridge down → réattribue ses registrations aux bridges sains
2. **Health monitoring** :
   - Check heartbeats Redis toutes les 15s
   - Bridge sans heartbeat depuis 30s → marqué "down" → réattribution
   - Worker sans heartbeat depuis 30s → appel considéré perdu → alerte
3. **Cache invalidation** :
   - Écoute les events Postgres (LISTEN/NOTIFY) sur modif menu/config
   - Invalide les clés Redis correspondantes
4. **Métriques** :
   - Expose `/metrics` Prometheus (registrations, appels actifs, queue size, latences)

**Specs pod** :
- 1 seul replica (leader election si HA nécessaire)
- RAM : 256 MB
- CPU : 0.25

---

## Flux détaillés

### Flux 1 : Création d'un restaurant

```
Restaurateur → App Web → POST /api/restaurants
    │
    ├── 1. Crée le resto dans Postgres
    ├── 2. Crée la/les lignes SIP (PhoneLine)
    ├── 3. Notifie le Controller (event Postgres ou API)
    │
Controller reçoit la notification :
    ├── 4. Cherche le bridge le moins chargé (Redis bridge:*:count)
    ├── 5. Crée sip_registration en DB (restaurantId, phoneLineId, bridgeNodeId)
    ├── 6. Notifie le bridge ciblé (Redis PUB/SUB: "bridge:{nodeId}:new_registration")
    │
Bridge reçoit la notification :
    └── 7. Charge la nouvelle registration depuis DB
        8. Envoie REGISTER au trunk SIP
        9. Met à jour Redis (bridge:{nodeId}:count++)
```

### Flux 2 : Appel entrant

```
Client appelle +33 1 23 45 67
    │
    ▼
Trunk SIP → envoie INVITE au bridge qui a cette registration
    │
Bridge :
    ├── 1. Décroche (200 OK + SDP)
    ├── 2. Ouvre stream RTP (audio)
    ├── 3. Crée un WebSocket interne pour le stream audio
    ├── 4. Lookup restaurantId depuis phoneLineId (Redis cache)
    ├── 5. LPUSH queue:incoming_calls {restaurantId, callId, audioWsUrl}
    ├── 6. INCR stats:active_calls
    │
AI Worker (qui faisait BLPOP) :
    ├── 7. Reçoit le job
    ├── 8. GET resto:{id}:config + resto:{id}:menu + resto:{id}:prompt depuis Redis
    ├── 9. Ouvre WebSocket vers OpenAI Realtime API
    ├── 10. Connecte : Bridge audio WS ↔ OpenAI WS
    ├── 11. Conversation IA (function calls, etc.)
    ├── 12. Client raccroche → ferme les deux WS
    ├── 13. Log CallLog dans Postgres
    └── 14. DECR stats:active_calls → retourne en idle

Si aucun worker dispo (queue pleine > seuil) :
    └── Bridge joue un message : "Tous nos agents sont occupés, veuillez rappeler"
        + raccroche après 30s
```

### Flux 3 : Mise à jour du menu

```
Restaurateur modifie le menu sur l'App Web
    │
    ├── 1. UPDATE dans Postgres (MenuItem, MenuCategory)
    ├── 2. Postgres NOTIFY sur channel 'config_change' : {restaurantId, type: 'menu'}
    │
Controller écoute le channel :
    ├── 3. DEL resto:{restaurantId}:menu dans Redis
    ├── 4. DEL resto:{restaurantId}:prompt dans Redis
    │
Prochain appel pour ce resto :
    └── Worker fait GET resto:{id}:menu → cache miss → rebuild depuis Postgres → SET dans Redis
```

### Flux 4 : Scale down d'un bridge

```
Kubernetes veut supprimer bridge-pod-3 (scale down)
    │
    ├── 1. preStop hook → marque le pod "draining" dans Redis
    ├── 2. Controller détecte le drain
    ├── 3. Pour chaque registration sur ce bridge :
    │      ├── Trouve un bridge sain avec de la capacité
    │      ├── Met à jour sip_registration.bridge_node_id en DB
    │      ├── Notifie le nouveau bridge (PUB/SUB)
    │      └── Nouveau bridge envoie REGISTER
    ├── 4. Ancien bridge envoie UNREGISTER pour chaque ligne
    ├── 5. Attend fin des appels en cours (terminationGracePeriodSeconds: 300)
    └── 6. Pod supprimé
```

---

## Infrastructure Kubernetes (OVH)

### Cluster

```yaml
# OVH Managed Kubernetes
Cluster:
  region: GRA (Gravelines) ou SBG (Strasbourg)
  version: 1.29+

Node Pools:
  # Pool Web/Controller — petites instances
  - name: web
    flavor: b3-8 (2 vCPU, 8 GB)     # ~20€/mois/node
    min: 2
    max: 4
    autoscale: true
    taints: []

  # Pool SIP Bridges — besoin de réseau performant
  - name: sip
    flavor: b3-16 (4 vCPU, 16 GB)   # ~35€/mois/node
    min: 1
    max: 5
    autoscale: true
    taints:
      - key: workload
        value: sip
        effect: NoSchedule

  # Pool AI Workers — scale agressif
  - name: workers
    flavor: b3-8 (2 vCPU, 8 GB)     # ~20€/mois/node
    min: 0                            # scale to zero la nuit
    max: 20
    autoscale: true
    taints:
      - key: workload
        value: ai-worker
        effect: NoSchedule
```

### Services managés OVH

| Service | Offre | Prix estimé |
|---|---|---|
| Managed Kubernetes | Gratuit (on paie les nodes) | 0€ |
| Managed PostgreSQL | Essential (4 GB RAM, 80 GB disk) | ~30€/mois |
| Managed Redis | Essential (4 GB) | ~15€/mois |
| Object Storage (logs, backups) | Standard S3 | ~5€/mois |
| Load Balancer | Inclus dans K8s | 0€ |

### Networking

```
Internet
    │
    ├── HTTPS → OVH Load Balancer → Ingress → App Web pods
    │
    └── SIP/RTP (UDP) → OVH Load Balancer (UDP) → SIP Bridge pods
                         ou NodePort direct

DNS:
  alloresto.com          → LB IP (HTTPS)
  sip.alloresto.com      → LB IP (SIP/UDP)
```

**Problématique SIP/RTP sur K8s** :
- SIP et RTP nécessitent des ports UDP fixes et exposés
- Options :
  - `hostNetwork: true` sur les pods SIP (simple, moins isolé)
  - NodePort range dédié (plus propre)
  - MetalLB ou Cilium pour du LoadBalancer UDP

---

## Estimation des coûts (1000 restaurants)

### Infra fixe (H24)

| Poste | Détail | Coût/mois |
|---|---|---|
| K8s nodes web (2× b3-8) | App Web + Controller | ~40€ |
| K8s nodes SIP (2× b3-16) | SIP Bridges H24 | ~70€ |
| Managed PostgreSQL | Essential | ~30€ |
| Managed Redis | Essential | ~15€ |
| Object Storage | Logs, backups | ~5€ |
| **Total infra fixe** | | **~160€/mois** |

### Infra variable (workers)

| Heure | Workers actifs | Nodes nécessaires | Coût/h |
|---|---|---|---|
| 00h-10h | 0-5 | 0-1 node | ~0.03€ |
| 10h-11h30 | 10-30 | 1-2 nodes | ~0.06€ |
| 11h30-14h | 50-150 | 3-8 nodes | ~0.22€ |
| 14h-18h30 | 5-20 | 1 node | ~0.03€ |
| 18h30-22h | 40-120 | 2-6 nodes | ~0.17€ |
| 22h-00h | 5-10 | 1 node | ~0.03€ |

**Estimé workers** : ~100-150€/mois (moyenne pondérée).

### Total par restaurant

| Poste | Coût/resto/mois |
|---|---|
| Infra fixe (÷1000) | ~0.16€ |
| Workers (÷1000) | ~0.12€ |
| Trunk SIP / numéro | ~5-8€ |
| **Total serveur pur** | **~6-9€/mois** |
| OpenAI Realtime API | ~300-600€ (variable selon appels) |
| **Total all-in** | **~310-610€/mois** |

---

## Monitoring & Alerting

### Métriques Prometheus

```
# SIP Bridges
sip_registrations_total{bridge_id}
sip_registrations_active{bridge_id}
sip_registration_errors_total{bridge_id}
sip_calls_received_total{bridge_id}

# AI Workers
ai_worker_calls_active
ai_worker_calls_total
ai_worker_call_duration_seconds (histogram)
ai_worker_openai_latency_seconds (histogram)
ai_worker_openai_cost_dollars (counter)

# Queue
queue_incoming_calls_length
queue_wait_time_seconds (histogram)

# Business
calls_per_restaurant{restaurant_id}
orders_confirmed_total{restaurant_id}
```

### Alertes

| Alerte | Condition | Sévérité |
|---|---|---|
| Bridge down | Heartbeat manquant > 30s | Critical |
| Queue saturée | queue_size > 20 pendant 1 min | Critical |
| Worker stuck | Appel > 10 min | Warning |
| Registration failed | Erreur REGISTER > 3 retries | Warning |
| Latence OpenAI | p95 > 2s | Warning |
| Coût OpenAI | > seuil journalier | Info |

### Dashboard Grafana

- Vue globale : appels actifs, queue, workers, bridges
- Vue par restaurant : appels/jour, durée moyenne, coût
- Vue infra : CPU/RAM nodes, pods, autoscaling events

---

## Sécurité

| Aspect | Mesure |
|---|---|
| SIP credentials | Chiffrées AES-256-GCM (existant) |
| OpenAI API key | Secret K8s, injecté en env var |
| Postgres | Réseau privé OVH (vRack), pas d'accès public |
| Redis | Réseau privé, AUTH password |
| App Web | HTTPS obligatoire, auth JWT |
| SIP traffic | TLS (SRTP) si supporté par le trunk |
| Inter-pods | Network policies K8s (bridges ↔ workers uniquement) |

---

## Migration depuis l'architecture actuelle

### Phase 1 : Dockerisation
- Containeriser `app.py` → image `ai-worker`
- Containeriser `sipbridge.py` → intégrer dans image `sip-bridge`
- Containeriser l'app Next.js → image `web`

### Phase 2 : Découplage
- Séparer sipbridge (registration H24) de app.py (conversation IA)
- Ajouter la communication par Redis queue entre les deux
- Le bridge ouvre un WS interne, le worker s'y connecte

### Phase 3 : Kubernetes
- Déployer sur OVH Managed K8s
- Migrer SQLite → Postgres managé
- Ajouter Redis managé
- Configurer HPA pour bridges et workers

### Phase 4 : Production
- Monitoring Prometheus + Grafana
- Alerting
- Tests de charge
- Runbook opérationnel
