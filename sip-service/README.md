# SIP Bridge — AlloResto

Pont SIP (pjsip) pour connecter les trunks SIP aux workers sip-agent-server via Redis.

> **Note** : Le service vocal IA (agent, tools, prompts) est desormais gere par
> [sip-agent-server](../../sip-agent-server/). Ce dossier ne contient plus que
> le SIP Bridge.

## Architecture

```
Client → Trunk SIP → SIP Bridge (pjsip)
                          │
                     LPUSH Redis
                     queue:incoming_calls
                          │
                     sip-agent-server Worker
                     (BLPOP → OpenAI Realtime)
```

## Fichiers

| Fichier | Role |
|---------|------|
| `sipbridge.py` | Bibliotheque pont SIP ↔ WebSocket (pjsua2) |
| `main-sipbridge.py` | Point d'entree CLI pour sipbridge |
| `start-sipbridge.sh` | Script de lancement |
| `SIP-BRIDGE.md` | Documentation detaillee du bridge |

## Quick Start

### Prerequis

- Python 3.12+
- pjsua2 compile avec support Python
- Redis (pour la queue d'appels)

### Installation

```bash
cd sip-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Lancement

```bash
./start-sipbridge.sh
```

## Chiffrement SIP

Les mots de passe SIP sont chiffres en BDD (table `phone_lines`).

| | |
|---|---|
| **Algorithme** | AES-256-GCM |
| **Derivation** | PBKDF2 (master key + phoneLineId comme sel) |
| **Format** | `iv:authTag:ciphertext` (base64) |
| **Migration** | `isEncrypted()` detecte les anciens mots de passe en clair |

Service : `web/src/services/sip-encryption.service.ts`
