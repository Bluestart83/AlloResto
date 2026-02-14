# Auto-provisioning sip-agent-server

## Principe

Quand un restaurant est cree dans AlloResto, un **Agent** est automatiquement provisionne dans sip-agent-server via son API HTTP.

```
AlloResto                          sip-agent-server
   │                                      │
   │  POST /api/accounts (si absent)      │
   │─────────────────────────────────────→│
   │  { name: "AlloResto", ... }          │
   │←─────────────────────────────────────│
   │  { id: "acct-xxx" }                  │
   │                                      │
   │  POST /api/agents                    │
   │─────────────────────────────────────→│
   │  { accountId, name, config, ... }    │
   │←─────────────────────────────────────│
   │  { id: "agent-xxx", apiToken }       │
   │                                      │
   │  POST /api/agents/:id/tools  x12     │
   │─────────────────────────────────────→│
   │  (check_availability, confirm_order…)│
   │                                      │
   │  agentId stocke en BDD               │
   └──────────────────────────────────────┘
```

## Modele

| sip-agent-server | AlloResto     | Cardinalite |
|------------------|---------------|-------------|
| Account          | App AlloResto | 1           |
| Agent            | Restaurant    | 1 par resto |
| ToolConfig       | Outils IA     | 12 par agent|

## Declencheurs

| Evenement | Action |
|-----------|--------|
| `POST /api/restaurants` | Provisionne account + agent + 12 tools |
| `PATCH /api/restaurants` avec `sipEnabled: true` et pas d'`agentId` | Provisionne (rattrapage) |
| `PATCH /api/restaurants` avec `agentId` existant | Sync nom/voix/timezone vers sip-agent-server |

## Config requise

| Variable d'env | Valeur par defaut | Description |
|----------------|-------------------|-------------|
| `SIP_AGENT_SERVER_URL` | `http://localhost:4000` | URL de l'API sip-agent-server |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL d'AlloResto (pour externalSessionUrl) |

## Resilience

- Si sip-agent-server est down, le restaurant est cree normalement, `agentId` reste `null`
- Les erreurs sont loguees avec le prefixe `[sip-provisioning]`
- Timeout de 10s sur chaque appel HTTP
- Le rattrapage se fait au prochain PATCH avec `sipEnabled: true`

## Fichiers

| Fichier | Role |
|---------|------|
| `web/src/services/sip-agent-provisioning.service.ts` | Service principal (ensureAccount, provisionAgent, updateAgent) |
| `web/src/services/sip-agent-tool-definitions.ts` | 12 definitions de ToolConfigs |
| `web/src/app/api/restaurants/route.ts` | Integration (appelle le service au POST/PATCH) |
| `web/src/db/entities/Restaurant.ts` | Colonne `agentId` (varchar 36, nullable) |

## Les 12 Tools

| # | Nom | Methode | Endpoint |
|---|-----|---------|----------|
| 1 | `check_availability` | POST | `/api/availability/check` |
| 2 | `confirm_order` | POST | `/api/ai/tools/confirm-order` |
| 3 | `confirm_reservation` | POST | `/api/reservations` |
| 4 | `save_customer_info` | POST | `/api/customers` |
| 5 | `log_new_faq` | POST | `/api/faq` |
| 6 | `leave_message` | POST | `/api/messages` |
| 7 | `check_order_status` | GET | `/api/orders/status` |
| 8 | `cancel_order` | POST | `/api/ai/tools/cancel-order` |
| 9 | `lookup_reservation` | GET | `/api/reservations/lookup` |
| 10 | `cancel_reservation` | PATCH | `/api/reservations` |
| 11 | `transfer_call` | — | Flag `triggersTransfer` |
| 12 | `end_call` | — | Flag `triggersHangup` |
