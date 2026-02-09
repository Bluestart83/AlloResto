# HARDWARE.md — Matériel SIP & Infrastructure réseau

## Sommaire

1. [Principe : pourquoi un boîtier ATA ?](#1-principe)
2. [FXO vs FXS : ne pas confondre](#2-fxo-vs-fxs)
3. [Grandstream HT841 — Le boîtier choisi](#3-grandstream-ht841)
4. [Branchement physique au restaurant](#4-branchement)
5. [coturn — TURN/STUN pour le NAT](#5-coturn)
6. [Twilio Elastic SIP Trunking](#6-twilio-sip-trunk)
7. [Configuration HT841](#7-config-ht841)
8. [Dépannage](#8-depannage)

---

## 1. Principe

Le restaurant a une ligne téléphonique analogique classique (prise murale RJ11). Les clients appellent ce numéro depuis toujours. On ne veut PAS changer le numéro — c'est sur les cartes, sur Google, partout.

On intercale un boîtier ATA (Analog Telephone Adapter) entre la prise murale et le téléphone. Ce boîtier convertit l'appel analogique en SIP et l'envoie à notre VPS via internet.

```
AVANT :  Prise murale ──→ Téléphone du restaurant
                           (le patron décroche)

APRÈS :  Prise murale ──→ HT841 (FXO) ──→ Internet ──→ VPS ──→ OpenAI
                              │                                    (IA décroche)
                              └──→ Téléphone backup (FXS)
                                   (si panne, le patron décroche)
```

## 2. FXO vs FXS

C'est la confusion la plus fréquente en téléphonie. Retenir :

| | **FXS** (Foreign eXchange Subscriber) | **FXO** (Foreign eXchange Office) |
|--|---------------------------------------|-----------------------------------|
| **Rôle** | Fournit la ligne | Reçoit la ligne |
| **Équivalent** | La prise murale | Le téléphone |
| **Fournit** | Courant, tonalité, sonnerie | Rien, il se branche |
| **On y branche** | Un téléphone | Une prise murale |

**Pour notre usage, on a besoin de FXO** : le boîtier se branche SUR la prise murale du restaurant (comme un téléphone) et intercepte les appels entrants.

Un port FXS sert à brancher un téléphone de backup sur le boîtier — utile pour le failover.

## 3. Grandstream HT841

**Modèle choisi : Grandstream HT841**
- Prix : ~140€ HT
- 4 ports FXO (on en utilise 1, mais ça permet de gérer plusieurs lignes)
- 1 port FXS (pour le téléphone de backup)
- 2 ports Ethernet (WAN + LAN)
- Support T.38 fax (inutile pour nous)
- **Lifeline** : si le boîtier perd le réseau ou plante, le port FXS relaie automatiquement les appels du FXO → le téléphone backup sonne normalement

**Pourquoi celui-là et pas un autre :**
- Le GXW4104 (ancienne référence) est en fin de vie
- Le HT841 est son remplaçant direct
- Le support STUN/TURN est natif
- Le lifeline évite une coupure de service pendant la démo

**Où acheter :**
- Amazon : ~160€ TTC
- VoIP distributeurs (Onedirect, etc.) : ~140€ HT

## 4. Branchement physique au restaurant

### Matériel nécessaire
- 1x Grandstream HT841
- 1x câble RJ11 (fourni)
- 1x câble Ethernet (fourni)
- Accès au WiFi OU un câble Ethernet vers le routeur
- Accès à la prise téléphonique murale

### Étapes

```
1. Débrancher le téléphone du restaurant de la prise murale

2. Brancher la prise murale → Port FXO 1 du HT841 (câble RJ11)

3. Brancher le téléphone du restaurant → Port FXS du HT841 (câble RJ11)
   → C'est le backup : si le système plante, le téléphone sonne quand même

4. Brancher le HT841 au réseau :
   Option A : Câble Ethernet → Port WAN du HT841 → routeur/box du restaurant
   Option B : Utiliser un bridge WiFi → Ethernet (si pas de prise Ethernet dispo)
   Option C : Routeur 4G dédié → Port WAN du HT841

5. Brancher l'alimentation du HT841

6. Le HT841 s'enregistre automatiquement sur le VPS via SIP
```

### Schéma final

```
Prise murale RJ11 ──→ [FXO Port 1]
                            │
                       ┌────┴────┐
                       │  HT841  │
                       └────┬────┘
                            │
              [FXS Port] ←──┤──→ [WAN Port]
                  │                    │
          Téléphone backup       Ethernet / WiFi / 4G
          (failover)                   │
                                       ▼
                                   Internet
                                       │
                                       ▼
                                    VPS (SIP)
```

## 5. coturn — TURN/STUN pour le NAT

### Le problème

Le HT841 est derrière le NAT du restaurant (box internet). Le signaling SIP sort sans problème (le HT841 initie la connexion), mais l'audio RTP doit revenir du VPS vers le HT841 — et le NAT peut bloquer les paquets retour.

### STUN (suffit dans 90% des cas)

STUN permet au HT841 de découvrir son IP publique et le port mappé par le NAT. Le VPS envoie l'audio vers cette adresse. Fonctionne avec :
- WiFi restaurant (ADSL/Fibre) : ✅ 95%
- 4G cone NAT : ✅ 85%
- 4G symmetric NAT (CGNAT) : ❌ échoue

### TURN (assurance 100%)

TURN est un relais : l'audio passe par coturn sur le VPS au lieu d'aller en direct. Ajoute ~5-10ms de latence (imperceptible) mais fonctionne dans 100% des cas, même derrière le CGNAT le plus restrictif.

```
SANS TURN (direct) :
  HT841 ←── RTP audio ──→ PJSIP (VPS)
  ⚠️ Peut échouer si NAT symétrique

AVEC TURN (relay) :
  HT841 ←── RTP ──→ coturn (VPS) ←── RTP ──→ PJSIP (VPS)
  ✅ Fonctionne toujours
```

### Installation coturn

```bash
# Sur le VPS (Ubuntu 22+)
sudo bash infra/setup_coturn.sh
```

Le script fait tout :
1. Installe coturn
2. Détecte l'IP publique
3. Génère les credentials
4. Configure le firewall (ports 3478, 5060, 10000-20000, 49152-65535)
5. Active le service

### Ports ouverts sur le VPS

| Port | Proto | Service |
|------|-------|---------|
| 5060 | UDP | SIP signaling |
| 3478 | UDP+TCP | STUN/TURN |
| 10000-20000 | UDP | RTP audio (PJSIP) |
| 49152-65535 | UDP | TURN relay range |

**Côté restaurant : RIEN à configurer.** Tout le trafic sort en outbound.

### Vérifier que coturn fonctionne

```bash
# Sur le VPS
systemctl status coturn

# Test STUN depuis n'importe où
stun -v IP_DU_VPS 3478
```

## 6. Twilio Elastic SIP Trunking

### Pourquoi Twilio plutôt qu'OVH SIP

| | OVH SIP | Twilio SIP Trunk |
|--|---------|------------------|
| Prix/min | ~0.01€ | ~0.008€ |
| Fiabilité | Correcte | Très haute |
| Numéro FR | ✅ | ✅ |
| Console | Basique | Excellente |
| API | Non | Oui |
| Support | Forum | Ticket 24/7 |

### Setup Twilio

1. Créer un compte sur [twilio.com](https://www.twilio.com)
2. Aller dans **Elastic SIP Trunking** → Create Trunk
3. **Origination** (appels entrants) :
   - URI : `sip:IP_DU_VPS:5060`
   - Priority 10, Weight 10
4. **Termination** (appels sortants, si besoin) :
   - URI : `voiceorder.pstn.twilio.com`
   - Credentials : créer un credential list
5. **Phone Numbers** :
   - Acheter un numéro FR (+33...)
   - L'assigner au trunk

### Dans le .env

```
SIP_DOMAIN=voiceorder.pstn.twilio.com
SIP_USERNAME=votre_credential_username
SIP_PASSWORD=votre_credential_password
```

### Coût

- Numéro FR : ~3€/mois
- Appels entrants : ~0.005€/min
- Appels sortants : ~0.013€/min
- Pas d'engagement, facturation à l'usage

## 7. Configuration HT841

Accéder à l'interface web du HT841 : `http://IP_DU_HT841` (port 80).

### Paramètres SIP (Account → Account 1)

```
Account Active:        Yes
Account Name:          VoiceOrder
SIP Server:            IP_DU_VPS
SIP User ID:           ht841_restaurant1
Authenticate ID:       ht841_restaurant1
Authenticate Password: [mot de passe généré]
```

### NAT Traversal (Account → Network Settings)

```
NAT Traversal:         STUN
STUN Server:           IP_DU_VPS:3478

# Si STUN ne suffit pas (4G CGNAT) :
NAT Traversal:         TURN
TURN Server:           IP_DU_VPS:3478
TURN Username:         voiceorder
TURN Password:         [mot de passe coturn]
```

### FXO (Channels → Channel 1)

```
Channel Mode:          FXO
Unconditional Call Forward To VoIP:  Enabled
# → Tous les appels entrants sont redirigés vers le VPS
```

### Failover / Lifeline

```
Lifeline:              Enabled
# → Si le SIP est déconnecté, FXO relaie vers FXS (téléphone backup)
```

## 8. Dépannage

### Pas d'audio (one-way ou silence)

1. Vérifier les ports RTP ouverts sur le VPS (`ufw status`)
2. Vérifier le NAT traversal sur le HT841 (STUN → TURN si besoin)
3. Tester depuis le WiFi du restaurant avant le 4G
4. Vérifier dans les logs coturn : `journalctl -u coturn -f`

### Le HT841 ne s'enregistre pas

1. Vérifier l'IP du VPS dans SIP Server
2. Vérifier les credentials
3. Vérifier que le port 5060/udp est ouvert sur le VPS
4. Regarder les logs SIP sur le VPS : `tcpdump -i any port 5060`

### Appels entrants ne sont pas redirigés

1. Vérifier que `Unconditional Call Forward To VoIP` est activé
2. Vérifier que la ligne FXO détecte bien la sonnerie (LED FXO doit clignoter)
3. Tester en appelant le numéro du restaurant depuis un mobile

### Latence / écho

1. Vérifier la connexion internet du restaurant (speedtest)
2. Si 4G : vérifier le signal (au moins 3 barres)
3. Activer l'echo cancellation dans les paramètres FXO du HT841
4. Si >200ms de latence, le 4G est probablement insuffisant → passer en WiFi
