# Chat textuel — Notes d'integration

## Migrations effectuees

### sip-agent-server (PostgreSQL)

Script : `scripts/migrate-chat.sql` — a executer dans le container postgres.

```bash
docker cp scripts/migrate-chat.sql sip-agent-server-postgres-1:/tmp/
docker exec sip-agent-server-postgres-1 psql -U postgres -d sip_agent -f /tmp/migrate-chat.sql
```

Modifications :
- `agents` : +4 colonnes (`chat_enabled`, `chat_model`, `chat_prompt_extra`, `chat_phone_required`)
- `call_records` : +7 colonnes (`type`, `messages`, `visitor_id`, `verify_code`, `verify_attempts`, `verified_at`, `last_message_at`) + elargissement `caller_number` a 30 chars + index sur `type`

### AlloResto (SQLite)

Pas de script SQL — `synchronize: true` en SQLite dev. La colonne se cree au redemarrage de Next.js.

Modifications :
- `restaurants` : +1 colonne (`agent_api_token` VARCHAR 128, nullable)

Pour PostgreSQL (prod) :
```sql
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS agent_api_token VARCHAR(128);
```

### Backfill data existante

Pour les restaurants deja provisionnes (agentId present mais pas de token) :
```bash
# Recuperer le token depuis sip-agent-server
curl -s http://localhost:4000/api/agents/AGENT_ID | jq -r .apiToken

# Setter dans AlloResto
curl -s -X PATCH http://localhost:3000/api/restaurants \
  -H "Content-Type: application/json" \
  -d '{"id": "RESTAURANT_ID", "agentApiToken": "TOKEN"}'
```

Le provisioning auto (`sip-agent-provisioning.service.ts`) sauvegarde maintenant le token automatiquement pour les nouveaux restaurants.

---

## Architecture du proxy chat

### Probleme
Le widget chat est embarque sur la page publique du restaurant (`/r/:restaurantId`).
Le widget doit appeler l'API chat de sip-agent-server, mais :
- Le token `apiToken` de l'agent ne doit **jamais** etre expose cote client
- sip-agent-server est sur un reseau Docker prive, pas accessible depuis le browser

### Solution : proxy cote AlloResto

```
Browser (page publique)
  → Widget JS (servi par sip-agent-server, pas de token)
  → Appels API vers AlloResto : /api/chat/:restaurantId/chat/sessions
  → AlloResto proxy (injecte Bearer token cote serveur)
  → sip-agent-server : /api/chat/sessions
```

Route proxy : `src/app/api/chat/[restaurantId]/[...path]/route.ts`
- Pas d'auth utilisateur (endpoint public pour les visiteurs)
- Charge le restaurant depuis la BDD → recupere `agentApiToken`
- Forward vers sip-agent-server avec `Authorization: Bearer <token>`
- Supporte SSE streaming (relay direct du `Response.body`)

### Widget embed (layout public)

```tsx
<Script
  src="http://sip-agent-server/widget/chat.js"
  data-api-base={`/api/chat/${restaurantId}`}
  data-lang="fr"
  data-position="bottom-right"
  strategy="lazyOnload"
/>
```

- `data-api-base` : override l'URL API du widget (sinon derive du script src)
- Pas de `data-agent-token` : le proxy gere l'auth
- Le CSS est charge depuis le meme origin que le script JS

### Note multi-service

Le proxy est dans AlloResto pour simplifier le dev. En prod multi-service :
- Option A : garder le proxy dans chaque app (chaque app gere ses restaurants)
- Option B : mettre un reverse proxy (nginx/caddy) devant sip-agent-server qui route `/widget/*` et `/api/chat/*` avec injection de token via un service d'auth dedie
- Option C : sip-agent-server expose un endpoint public qui accepte un `publicToken` (different de l'apiToken admin) — le widget n'a besoin que du publicToken

L'option C est probablement la meilleure a terme : un token public read-only pour le chat, distinct du token admin qui gere l'agent. A implementer quand on aura plusieurs apps clientes.

---

## docker-compose.dev.yml

Ajouts pour le dev avec AlloResto sur le host :
- `extra_hosts: ["alloresto:host-gateway"]` sur `sip-agent-server-api` et `ai-agent-worker`
- Volume `./widget:/app/widget` sur `sip-agent-server-api` (hot-reload widget)
