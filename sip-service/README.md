# SIP Service — PJSIP + OpenAI Realtime

Service téléphonique Python : reçoit les appels SIP, les connecte à OpenAI Realtime API.

## Prérequis

- Python 3.10+
- pjsua2 (compilé avec support Python)
- Compte OpenAI avec accès Realtime API

## Installation

```bash
pip install -r requirements.txt --break-system-packages
```

## Configuration

Les variables sont lues depuis `../.env` (racine du projet).

## Lancement

```bash
python main.py
```

## Communication avec le Dashboard

Le service SIP appelle l'API Next.js via HTTP :

```
POST http://localhost:3000/api/delivery/check   → vérification livraison
POST http://localhost:3000/api/customers         → lookup/create client
POST http://localhost:3000/api/calls             → log appel
POST http://localhost:3000/api/orders            → créer commande
```
