# QUICKSTART — AlloResto

## Prerequis

- Node.js 22+
- sip-agent-server Docker running (voir `../QUICKSTART.md`)

## Config

```bash
cp .env.example .env
# Remplir : OPENAI_API_KEY, GOOGLE_MAPS_API_KEY, BETTER_AUTH_SECRET

# ⚠️  OBLIGATOIRE — créer le symlink .env racine → web/
ln -sf ../.env web/.env
```

## Install + lancement

```bash
cd web
npm install
npm run db:sync
npm run dev
```

> Dashboard sur http://localhost:3000

## Creer l'admin

```bash
cd web
npx tsx src/scripts/seed-admin.ts admin@voiceorder.ai admin123
```

## Seed sip-agent-server (lier un restaurant)

```bash
cd ../sip-agent-server
DATABASE_URL=postgresql://sip:sip@localhost:5432/sip_agent \
RESTAURANT_ID=<id-du-restaurant> \
ALLORESTO_URL=http://localhost:3000 \
npx tsx scripts/seed-alloresto.ts
```

## Mise en prod — Cloudflare

Si `SIP_AGENT_INTERNAL_URL` pointe vers un domaine protege par Cloudflare (ex: `https://iagent.nolimitdev.net`),
il faut **whitelister l'IP publique du serveur AlloResto** dans Cloudflare pour eviter le blocage WAF/Bot Protection
sur les appels serveur-to-serveur.

**Cloudflare Dashboard** → Security → WAF → Tools → IP Access Rules → ajouter l'IP du serveur → action **Allow**.

## Variables d'environnement

| Variable | Defaut | Description |
|----------|--------|-------------|
| `DATABASE_URL` | `../data/database.db` | Chemin SQLite ou URL PostgreSQL |
| `OPENAI_API_KEY` | | Cle OpenAI (scan menu) |
| `GOOGLE_MAPS_API_KEY` | | Geocodage + distance |
| `SIP_AGENT_INTERNAL_URL` | `http://localhost:4000` | API sip-agent-server |
| `ENCRYPTION_KEY` | | AES-256 pour SIP passwords (`openssl rand -hex 32`) |
| `BETTER_AUTH_SECRET` | | Secret Better Auth (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | `http://localhost:3000` | URL publique Better Auth |
