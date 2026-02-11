# Facturation — Calcul des coûts

## Vue d'ensemble

AlloResto facture ses clients restaurateurs en **devise de facturation** (`NEXT_PUBLIC_BILLING_CURRENCY` dans `.env`).
Tous les coûts sont convertis et **stockés en devise de facturation** dans la base de données.

## Devises impliquées

| Devise | Source | Usage |
|--------|--------|-------|
| **Provider currency** | `PricingConfig.baseCurrency` (ex: `USD` pour OpenAI) | Prix des tokens IA, coût télécom |
| **Billing currency** | `NEXT_PUBLIC_BILLING_CURRENCY` env var (ex: `EUR`) | Stockage en BDD, facturation client |
| **Display currency** | `Restaurant.currency` (ex: `GBP`) | Affichage optionnel dans l'interface |

## Pipeline de calcul (par appel)

```
1. Coût IA brut (provider currency)
   = tokens × tarif par token (depuis PricingConfig.modelRates)

2. + Marge restaurant
   = coût brut × (1 + Restaurant.aiCostMarginPct / 100)

3. Coût télécom (provider currency, pas de marge)
   = durée_minutes × PricingConfig.telecomCostPerMin
   (uniquement si appel Twilio, pas SIP direct)

4. Conversion → billing currency
   = coût × taux BCE (provider → billing)

5. Stockage en BDD
   → Call.costAi, Call.costTelecom, Call.costCurrency
```

## Tarification IA

Configurée dans `PricingConfig` (table `pricing_config`, admin `/admin/pricing`) :

- **baseCurrency** : devise des tarifs fournisseur (ex: `USD` pour OpenAI)
- **modelRates** : prix par 1M tokens pour chaque modèle
  - `textInput`, `textOutput` : tokens texte
  - `audioInput`, `audioOutput` : tokens audio (Realtime API)
- **telecomCostPerMin** : coût télécom par minute (en provider currency)
- **defaultMarginPct** : marge par défaut (surclassée par `Restaurant.aiCostMarginPct`)

### Calcul du coût IA brut

```
rawCost = (inputTokens × textInput / 1M)
        + (outputTokens × textOutput / 1M)
        + (inputAudioTokens × audioInput / 1M)
        + (outputAudioTokens × audioOutput / 1M)
```

### Marge

Chaque restaurant peut avoir sa propre marge (`aiCostMarginPct`).
Si non définie, la marge par défaut de `PricingConfig.defaultMarginPct` s'applique.

```
costAvecMarge = rawCost × (1 + marginPct / 100)
```

## Coût télécom

- Appliqué uniquement aux appels Twilio (pas de coût pour SIP bridge direct)
- Calculé en provider currency : `durée_minutes × telecomCostPerMin`
- **Pas de marge** appliquée sur le télécom

## Taux de change

- Source : **BCE** (Banque Centrale Européenne) via `api.frankfurter.app`
- Rafraîchissement : **toutes les heures** (cache en BDD dans `PricingConfig.exchangeRates`)
- Devises supportées : EUR, GBP, CHF, CAD, AUD, JPY, SEK, NOK, DKK
- Le taux est `provider → billing` (ex: 1 USD = 0.92 EUR)

### Service

`web/src/services/exchange-rate.service.ts` :
- `getExchangeRates()` — tous les taux, auto-refresh si >1h
- `getExchangeRate(targetCurrency)` — taux pour une devise spécifique

## Affichage

Les coûts stockés en billing currency peuvent être convertis pour l'affichage :

```
displayCost = storedCost × displayFx
```

Où `displayFx` = taux billing → display (ex: EUR → GBP).
Si `displayCurrency === billingCurrency`, `displayFx = 1` (pas de conversion).

## Champs en BDD

### Call entity
| Champ | Type | Description |
|-------|------|-------------|
| `costAi` | decimal | Coût IA avec marge, en billing currency |
| `costTelecom` | decimal | Coût télécom, en billing currency |
| `costCurrency` | varchar(3) | Devise des coûts stockés (ex: `EUR`) |
| `aiModel` | varchar | Modèle IA utilisé (ex: `gpt-4o-realtime`) |
| `inputTokens` | int | Tokens texte en entrée |
| `outputTokens` | int | Tokens texte en sortie |
| `inputAudioTokens` | int | Tokens audio en entrée |
| `outputAudioTokens` | int | Tokens audio en sortie |

### PricingConfig entity
| Champ | Type | Description |
|-------|------|-------------|
| `baseCurrency` | varchar(3) | Devise fournisseur IA (ex: `USD`) |
| `modelRates` | JSON | Tarifs par modèle et type de token |
| `telecomCostPerMin` | decimal | Coût télécom/min en provider currency |
| `defaultMarginPct` | decimal | Marge IA par défaut (%) |
| `exchangeRates` | JSON | Taux de change BCE cachés |
| `exchangeRatesUpdatedAt` | datetime | Dernière MAJ des taux |

## Variables d'environnement

| Variable | Exemple | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BILLING_CURRENCY` | `EUR` | Devise de facturation et stockage (accessible serveur + client) |
