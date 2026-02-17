# Quick Deploy — AlloResto (VPS)

AlloResto tourne dans le docker-compose de sip-agent-server (SQLite, volume sur disque).

## 1. Clone

```bash
# A cote de sip-agent-server
git clone git@github.com:Bluestart83/AlloResto.git
mkdir -p packages
git clone git@gitlab.com:arnaud.liguori/corallospeaking.git packages/billing-ui
```

Structure attendue :

```
~/
  sip-agent-server/
  AlloResto/
  packages/billing-ui/
```

## 2. Copier le .env

```bash
scp AlloResto/.env user@vps:~/AlloResto/.env
```

Adapter les URLs :

```
DATABASE_TYPE=sqlite
DATABASE_URL=/data/database.db
SIP_AGENT_SERVER_URL=http://sip-agent-server-api:4000
SIP_AGENT_WEB_URL=http://sip-agent-server-web:5173
NODE_ENV=production
```

## 3. Lancer

AlloResto est un service dans le docker-compose de sip-agent-server :

```bash
cd sip-agent-server
docker compose -f docker/docker-compose.yml up --build -d
```

La base SQLite est persistee dans `sip-agent-server/docker/data/alloresto/database.db`.

## 4. Verifier

```bash
curl http://localhost:3000
```
