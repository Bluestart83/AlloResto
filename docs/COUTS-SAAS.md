# AlloResto SaaS — Estimation des Coûts

## Hypothèses

- 1000 restaurants actifs
- Pizzeria grande ville type : ~30 appels/jour, ~5 min/appel
- Hébergement OVH (Managed Kubernetes + services managés)
- Pics d'activité : 12h-14h et 19h-22h
- Max ~150-200 appels simultanés au pic (overbooking : jamais 1000 en même temps)

---

## 1. Coût serveur pur (infra OVH)

### Infra fixe (H24)

| Poste | Spec | €/mois |
|---|---|---|
| Nodes web (Next.js + Controller) | 2× b3-8 (2 vCPU, 8 GB) | 40€ |
| Nodes SIP bridges (registrations H24) | 2× b3-16 (4 vCPU, 16 GB) | 70€ |
| Postgres managed | Essential (4 GB RAM, 80 GB) | 30€ |
| Redis managed | Essential (4 GB) | 15€ |
| Object Storage (logs, backups) | S3 standard | 5€ |
| **Sous-total fixe** | | **160€** |

### Infra variable (AI Workers, facturation horaire)

| Plage horaire | Appels simultanés | Nodes b3-8 | Coût/h |
|---|---|---|---|
| 00h-10h | ~5 | 1 | 0.03€ |
| 10h-11h30 | ~30 | 2 | 0.06€ |
| 11h30-14h (pic midi) | ~150 | 8 | 0.22€ |
| 14h-18h30 | ~15 | 1 | 0.03€ |
| 18h30-22h (pic soir) | ~120 | 6 | 0.17€ |
| 22h-00h | ~5 | 1 | 0.03€ |

**Sous-total workers : ~340€/mois**

### Overhead opérationnel (+30%)

| Poste | €/mois |
|---|---|
| Monitoring (Prometheus, Grafana) | 40€ |
| CI/CD, registry Docker | 20€ |
| Bande passante réseau | 30€ |
| Marge imprévus / pics | 60€ |
| **Sous-total overhead** | **150€** |

### Total infra

| | €/mois |
|---|---|
| Infra fixe | 160€ |
| Workers variable | 340€ |
| Overhead | 150€ |
| **Total serveur** | **~650€** |
| **Arrondi réaliste** | **~800-1000€** |
| **Par restaurant** | **~0.80-1.00€** |

---

## 2. Coût téléphonie (trunk SIP)

| Poste | €/resto/mois |
|---|---|
| Numéro de téléphone (DID) | 1-3€ |
| Trunk SIP (minutes entrantes) | 3-5€ |
| **Total téléphonie** | **~5-8€** |

---

## 3. Coût IA (OpenAI Realtime API)

### Tarif

- **~$0.385 par minute** (coût réel OpenAI, audio input + output combinés)
- **$0.50 par minute** (prix facturé au client, marge 30% incluse)

### Par appel (5 min)

| | Coût réel | Facturé client |
|---|---|---|
| 5 min | **$1.925/appel** | **$2.50/appel** |

### Par restaurant (30 appels/jour)

| | Coût réel | Facturé client |
|---|---|---|
| 30 appels/jour | $57.75/jour | $75/jour |
| × 30 jours | **$1,733/mois** | **$2,250/mois** |
| En euros | **~1,615€** | **~2,100€** |

### Avec optimisations futures

| Optimisation | Impact | Coût estimé/resto |
|---|---|---|
| GPT-4o-mini Realtime (quand dispo) | ÷3-5 | ~420-700€ |
| Prompts optimisés (appels plus courts, ~3 min) | ÷1.7 | ÷1.7 |
| Combiné (mini + prompts courts) | | **~250-400€** |

---

## 4. Synthèse par restaurant

### Aujourd'hui (GPT-4o Realtime, $0.50/min)

| Poste | €/resto/mois | % du total |
|---|---|---|
| Serveur (infra) | ~1€ | 0.05% |
| Téléphonie (SIP) | ~6€ | 0.3% |
| OpenAI Realtime | ~2,100€ | 99.7% |
| **Total** | **~2,107€** | |

### Cible optimisée (modèle mini + prompts courts)

| Poste | €/resto/mois | % du total |
|---|---|---|
| Serveur (infra) | ~1€ | 0.3% |
| Téléphonie (SIP) | ~6€ | 1.8% |
| OpenAI Realtime | ~330€ | 97.9% |
| **Total** | **~337€** | |

---

## 5. Scalabilité des coûts

### Projections par palier (30 appels/jour, 5 min/appel par resto)

| Nb restos | Infra/mois | Coût OpenAI total | Revenu total | Bénéfice brut/mois | Marge |
|---|---|---|---|---|---|
| 10 | ~50€ | 16,150€ | 21,500€ | **~5,300€** | 25% |
| 100 | ~500€ | 161,500€ | 215,000€ | **~53,000€** | 25% |
| 500 | ~700€ | 807,500€ | 1,075,000€ | **~266,800€** | 25% |
| 1000 | ~1,000€ | 1,615,000€ | 2,150,000€ | **~534,000€** | 25% |

> **Note** : le bénéfice brut scale linéairement avec le nombre de restos.
> L'infra est totalement négligeable — le coût d'un restaurant = son coût OpenAI.
> Pour 10 clients, pas besoin de K8s : un seul VPS à ~50€ suffit.

---

## 6. Pricing client

### Modèle : abonnement fixe + coût OpenAI réel avec marge

Le client paie :
1. **Abonnement fixe** — couvre l'infra, le support, la plateforme
2. **Coût OpenAI réel + marge** — refacturé au réel avec un coefficient
3. **Téléphonie SIP** — à la charge du client (son propre trunk/numéro)

### Grille tarifaire

| Composant | Prix client | Coût réel | Marge |
|---|---|---|---|
| **Abonnement mensuel** | 50€/mois | ~1€ (infra) | ~49€ |
| **Coût IA par minute** | $0.50/min | ~$0.385/min (OpenAI) | **30%** |

### Exemple : pizzeria 30 appels/jour, 5 min/appel

| | €/mois |
|---|---|
| Abonnement | 50€ |
| Minutes IA : 30 × 5 min × 30 jours = 4,500 min | |
| Facturé : 4,500 × $0.50 = $2,250 ≈ | 2,100€ |
| **Total facturé client** | **~2,150€** |
| | |
| Coût OpenAI réel : 4,500 × $0.385 | -1,615€ |
| Coût infra | -1€ |
| **Marge brute** | **~534€ (25%)** |

### Transparence

Le client voit dans son dashboard :
- Nombre d'appels
- Durée totale (minutes)
- Coût IA détaillé (minutes × tarif/min)
- Facture : abonnement + consommation IA

> **Téléphonie** : le client gère son propre trunk SIP et numéro de téléphone (~5-8€/mois). Ce n'est pas inclus dans l'abonnement AlloResto.

> **Avantage** : zéro risque de marge négative. Le coût OpenAI est passé au client avec marge fixe. L'abonnement couvre les frais fixes + marge plateforme. Le client ne paie que ce qu'il consomme.
