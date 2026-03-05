# Quick Deploy — AlloResto (VPS)

AlloResto est un service dans le docker-compose de sip-agent-server. Les URLs serveur (API) sont Docker internes, les URLs `NEXT_PUBLIC_*` sont publiques (browser).

## 1. Clone

```bash
# A cote de sip-agent-server
git clone git@github.com:Bluestart83/AlloResto.git
mkdir -p packages
git clone git@gitlab.com:arnaud.liguori/corallospeaking.git packages/billing-ui
```

## 2. .env

Le `.env` d'AlloResto sert de base. Le docker-compose.yml override les URLs Docker internes automatiquement.

Variables a configurer dans `.env` :

```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=https://resto.nolimitdev.net
NEXT_PUBLIC_APP_URL=https://resto.nolimitdev.net
NEXT_PUBLIC_SIP_AGENT_WEB_URL=https://iagent.nolimitdev.net/admin/platform/
SIP_ACCOUNT_API_KEY=acc_xxxxxxxxxxxxxxxxxxxx
ENCRYPTION_KEY=<openssl rand -hex 32>
```

Le compose ajoute automatiquement :
- `SIP_AGENT_INTERNAL_URL=http://sip-agent-server-api:4000`
- `ALLORESTO_CALLBACK_URL=http://alloresto:3000`
- `DATABASE_URL=/data/database.db`

## 3. Build + lancer

```bash
cd sip-agent-server
docker build -t alloresto:prod ../AlloResto
docker compose up -d
```

## 4. Verifier

```bash
curl https://resto.nolimitdev.net
```
