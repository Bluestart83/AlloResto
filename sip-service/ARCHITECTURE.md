# Architecture SIP Bridge — AlloResto

> **Note** : Le service vocal IA (agent, tools, prompts, service manager) est
> desormais gere par [sip-agent-server](../../sip-agent-server/).
> Ce dossier ne contient plus que le **SIP Bridge** (pjsip).

## Vue d'ensemble

```
Appel SIP (OVH)
       │
       ▼
┌─────────────────┐     LPUSH Redis         ┌──────────────────┐
│  SIP Bridge     │  ──────────────────►     │  sip-agent-server│
│  (pjsip/pjsua2) │  queue:incoming_calls   │  Worker          │
│  Python          │  ◄──────────────────    │  (OpenAI RT)     │
└─────────────────┘     WS audio             └──────────────────┘
```

## Fichiers

| Fichier | Role |
|---------|------|
| `sipbridge.py` | Bibliotheque pont SIP ↔ WebSocket (pjsua2). Gere l'enregistrement SIP, decroche les appels, pont audio SIP ↔ WebSocket (protocole Twilio Media Streams). |
| `main-sipbridge.py` | CLI entry point pour sipbridge.py. Parse les args et lance `SipBridge.run()`. |
| `start-sipbridge.sh` | Script de lancement. |
| `SIP-BRIDGE.md` | Documentation detaillee du protocole et de la configuration. |

## Base de donnees

### PhoneLine (AlloResto)
- `restaurantId` — FK vers Restaurant
- `phoneNumber` — numero affiche
- `provider` — "sip" ou "twilio"
- `sipDomain`, `sipUsername`, `sipPassword` (chiffre AES-256-GCM)
- `isActive` — la ligne est-elle active ?

### Chiffrement SIP
- Service : `web/src/services/sip-encryption.service.ts`
- Algo : AES-256-GCM + PBKDF2(masterKey, phoneLineId, 100000, sha256)
- Format stocke : `iv:authTag:ciphertext` (base64)
- `ENCRYPTION_KEY` partagee entre Next.js et sip-service

## Lancement

```bash
cd sip-service
./venv/bin/python main-sipbridge.py \
  --sip-domain sip.ovh.fr \
  --sip-username 0033972360682 \
  --sip-password <password> \
  --redis-url redis://localhost:6379 \
  --api-port 5060
```

## Problemes connus

### Processus pjsip zombies
Les processus utilisant pjsua2 peuvent rester en etat "UE" (uninterruptible sleep)
apres un `kill -9`. Ils occupent les ports SIP indefiniment.

**Workaround** : Reboot de la machine.

### Ctrl+C bloque
Le graceful shutdown peut rester bloque si pjsip ne se termine pas proprement.

**Fix** : `os._exit(0)` apres 10s de timeout sur le signal handler.
