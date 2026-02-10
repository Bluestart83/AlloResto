# SIP Service v2 — Architecture d'un agent vocal generique

## Table des matieres

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Analyse du v1 — Ce qui est hardcode](#2-analyse-du-v1--ce-qui-est-hardcode)
3. [Principe v2 — Agent config-driven](#3-principe-v2--agent-config-driven)
4. [Schema JSON complet](#4-schema-json-complet)
5. [Moteur de templates](#5-moteur-de-templates)
6. [Executeur de tools](#6-executeur-de-tools)
7. [Body builders (logique complexe)](#7-body-builders-logique-complexe)
8. [Cycle de vie d'un appel](#8-cycle-de-vie-dun-appel)
9. [Integration avec le service manager](#9-integration-avec-le-service-manager)
10. [Migration v1 → v2](#10-migration-v1--v2)
11. [Structure des fichiers](#11-structure-des-fichiers)
12. [Exemple complet — Config restaurant](#12-exemple-complet--config-restaurant)
13. [Exemples — Autres cas d'usage](#13-exemples--autres-cas-dusage)
14. [Limites et points ouverts](#14-limites-et-points-ouverts)

---

## 1. Contexte et objectifs

### Probleme

Le `sip-service/app.py` actuel (v1) est un agent vocal specialise pour la prise de commande restaurant. Chaque fonctionnalite est codee en dur :

- **10 tool handlers** Python (`handle_confirm_order`, `handle_check_availability`, etc.) avec de la logique metier (resolution d'items, calcul de prix, formatage d'adresse)
- **System prompt** construit cote API (`ai-prompt.service.ts`) avec des regles numerotees specifiques restaurant
- **Contexte d'appel** (`ctx`) avec des champs fixes : `order_placed`, `reservation_placed`, `item_map`, etc.
- **Outcome** determine par des flags Python (`if ctx.get("order_placed")`)

Ajouter un nouveau cas d'usage (cabinet medical, support client, standard telephonique) necessite de dupliquer et modifier `app.py` + `ai-prompt.service.ts`.

### Objectif v2

Un agent vocal **generique** ou :

1. **Tout le comportement** est defini dans un **JSON de configuration** (prompt, tools, lifecycle, greetings)
2. Le **service manager** construit et envoie ce JSON automatiquement au lancement
3. L'agent Python est un **moteur d'execution** qui ne connait pas le domaine metier
4. **Aucune modification** de l'API web / Next.js — le JSON est construit par le service manager a partir des endpoints existants
5. Le meme binaire Python sert pour **tout type de job** : restaurant, medecin, support, standard

### Ce qui ne change pas

- **OpenAI Realtime API** comme moteur vocal (WebSocket bidirectionnel)
- **Twilio / SIP Bridge** comme couche telecom
- **API Next.js** comme backend de donnees (les endpoints restent identiques)
- **Service Manager** comme orchestrateur de processus

---

## 2. Analyse du v1 — Ce qui est hardcode

### 2.1 Dans `app.py` (Python)

| Element | Localisation | Description |
|---------|-------------|-------------|
| `TOOL_HANDLERS` dict | L489-500 | Mapping nom → fonction Python (10 handlers) |
| `handle_confirm_order` | L200-289 | Resolution `item_map` (index → UUID), construction du payload, frais de livraison |
| `handle_confirm_reservation` | L292-337 | Parsing heure HH:MM → ISO, construction du payload reservation |
| `handle_check_availability` | L169-197 | Construction payload avec champs dynamiques selon le mode |
| `handle_cancel_order` | L417-454 | Recherche commande par numero, validation statut, PATCH |
| `ctx` dict | L647-665 | Champs fixes : `order_placed`, `reservation_placed`, `message_left`, `item_map`, `last_availability_check` |
| `create_call_record` | L507-521 | POST `/api/calls` au debut de l'appel |
| `finalize_call` | L524-581 | Determination outcome, auto-message, PATCH `/api/calls` |
| Outcome rules | L535-542 | `order_placed > reservation_placed > message_left > info_only > abandoned` |
| Greeting logic | L708-730 | Client connu → accueil personnalise / nouveau → accueil generique |
| Blocked phone | L762-767 | `check_phone_blocked()` au debut du stream |
| VAD config | L54-56 | Threshold, silence_ms, prefix_padding_ms depuis env |

### 2.2 Dans `ai-prompt.service.ts` (TypeScript / API)

| Element | Description |
|---------|-------------|
| `buildSystemPrompt()` | Prompt de ~200 lignes avec regles numerotees, verbatim, sections metier |
| `buildTools()` | 10+ tools OpenAI avec schemas JSON, conditionnels sur `reservationEnabled`, `orderStatusEnabled` |
| `buildMenuText()` / `buildFormulesText()` | Formatage du menu avec `#N` pour chaque item |
| `itemMap` | Mapping index entier → `{id: UUID, name: string}`, envoye au Python dans la config |
| `resolveSipCredentials()` | Decryptage mot de passe SIP, fallback .env |

### 2.3 Ce qui est deja generique

- **WebSocket proxy** (Twilio ↔ OpenAI) : pur relais audio, aucune logique metier
- **Audio handling** : `input_audio_buffer.append`, `response.audio.delta` — universel
- **Interruption** : detection + truncation — universel
- **Transcript** : capture user + assistant — universel
- **Duration watchdog** : timer max — universel
- **Mark queue** : gestion des segments audio — universel

**Conclusion** : ~60% du code `app.py` est deja generique. Les 40% restants (tool handlers, lifecycle, greeting, ctx) sont ce qu'il faut rendre configurable.

---

## 3. Principe v2 — Agent config-driven

### Architecture globale

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE MANAGER                          │
│                                                              │
│  1. Fetch /api/sip/agents (liste restaurants)                │
│  2. Pour chaque restaurant :                                 │
│     a. Fetch /api/ai?restaurantId=...  (prompt, tools)       │
│     b. Construire le JSON config v2                          │
│     c. Ecrire configs/{restaurantId}.json                    │
│     d. Lancer: python agent.py --config configs/xxx.json     │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     AGENT v2 (generique)                     │
│                                                              │
│  1. Charger config JSON                                      │
│  2. A chaque appel :                                         │
│     a. Pre-call checks (blocked phone, etc.)                 │
│     b. Fetch session (prompt + tools) depuis config_url      │
│        OU utiliser prompt/tools inline                        │
│     c. Configurer session OpenAI                             │
│     d. Envoyer greeting                                      │
│     e. Router les tool calls via config                       │
│     f. Lifecycle events (on_start, on_end)                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Deux modes de session

| Mode | Description | Quand l'utiliser |
|------|-------------|-----------------|
| **`config_url`** | Le prompt et les tools sont charges dynamiquement a chaque appel via un GET HTTP | Quand le prompt depend de donnees en temps reel (menu, horaires, client connu) |
| **`inline`** | Le prompt et les tools sont inclus directement dans le JSON config | Quand le prompt est statique (standard telephonique, support basique) |

Pour le cas restaurant, on utilise `config_url` car le prompt depend du menu et du client appelant.
Pour un standard telephonique simple, `inline` suffit.

---

## 4. Schema JSON complet

### 4.0 Vue d'ensemble

```json
{
  "version": "2.0",
  "agent": { ... },
  "openai": { ... },
  "session": { ... },
  "pre_call_checks": [ ... ],
  "greeting": { ... },
  "lifecycle": { ... },
  "tools": { ... },
  "base_url": "http://localhost:3000"
}
```

### 4.1 `agent` — Identite

```json
{
  "agent": {
    "id": "uuid-du-restaurant",
    "name": "Pizza Bella",
    "type": "restaurant"
  }
}
```

- `id` : identifiant unique, utilise dans les templates (`{{agent.id}}`)
- `name` : nom affiche dans les logs
- `type` : informatif (pour logs et metrics)

### 4.2 `openai` — Configuration du modele

```json
{
  "openai": {
    "model": "gpt-realtime",
    "voice": "sage",
    "temperature": 0.7,
    "vad": {
      "threshold": 0.5,
      "silence_duration_ms": 500,
      "prefix_padding_ms": 300
    },
    "input_audio_format": "g711_ulaw",
    "output_audio_format": "g711_ulaw",
    "input_audio_transcription": {
      "model": "whisper-1"
    }
  }
}
```

Tous ces champs ont des valeurs par defaut sensibles. Seul `voice` est vraiment variable d'un agent a l'autre.

### 4.3 `session` — Chargement du prompt et des tools

#### Mode `config_url` (dynamique, par appel)

```json
{
  "session": {
    "mode": "config_url",
    "url": "{{base_url}}/api/ai",
    "params": {
      "restaurantId": "{{agent.id}}",
      "callerPhone": "{{caller_phone}}"
    },
    "response_mapping": {
      "instructions": "$.systemPrompt",
      "tools": "$.tools",
      "voice": "$.voice",
      "ctx_init": {
        "item_map": "$.itemMap",
        "avg_prep_time_min": "$.avgPrepTimeMin",
        "delivery_enabled": "$.deliveryEnabled",
        "customer_id": "$.customerContext.id"
      }
    }
  }
}
```

A chaque nouvel appel, l'agent fait un GET sur `url` avec `params`. La reponse est mappee :
- `instructions` → system prompt pour OpenAI
- `tools` → liste des tools pour OpenAI
- `voice` → voix OpenAI (override le default)
- `ctx_init` → valeurs initiales du contexte de l'appel (`ctx`)

Le `response_mapping` utilise des JSONPath simples (`$.field.subfield`) pour extraire les champs de la reponse API.

#### Mode `inline` (statique)

```json
{
  "session": {
    "mode": "inline",
    "instructions": "Tu es le standard telephonique de la societe XYZ...",
    "tools": [
      {
        "type": "function",
        "name": "transfer_call",
        "description": "Transferer l'appel au service demande",
        "parameters": {
          "type": "object",
          "properties": {
            "department": { "type": "string", "enum": ["sales", "support", "billing"] }
          },
          "required": ["department"]
        }
      }
    ]
  }
}
```

### 4.4 `pre_call_checks` — Verifications avant appel

```json
{
  "pre_call_checks": [
    {
      "name": "blocked_phone",
      "method": "GET",
      "url": "{{base_url}}/api/blocked-phones/check",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{caller_phone}}"
      },
      "block_if": "$.blocked == true",
      "on_block": "hangup"
    }
  ]
}
```

Chaque check est un appel HTTP executee avant de configurer la session OpenAI.
- `block_if` : expression evaluee sur la reponse JSON
- `on_block` : action si bloque (`hangup` = fermer le WebSocket, `message` = jouer un message TTS puis raccrocher)

Si `pre_call_checks` est vide ou absent, aucune verification n'est faite.

### 4.5 `greeting` — Message d'accueil

```json
{
  "greeting": {
    "known_customer": "Le client {{session.customerContext.firstName}} vient d'appeler (client fidele, {{session.customerContext.totalOrders}} commandes). Accueille-le par son prenom et demande ce qu'il souhaite commander.",
    "unknown_customer": "Un nouveau client vient d'appeler. Accueille-le chaleureusement, presente-toi brievement et demande ce qu'il souhaite commander.",
    "condition_field": "session.customerContext.firstName"
  }
}
```

- Si `condition_field` est present et non-null dans le contexte → `known_customer`
- Sinon → `unknown_customer`
- Le greeting est envoye comme message `user` a OpenAI pour declencher la premiere reponse audio

Si `greeting` est absent, aucun message d'accueil n'est envoye (l'IA attend que le client parle).

### 4.6 `lifecycle` — Evenements de cycle de vie

```json
{
  "lifecycle": {
    "on_start": {
      "method": "POST",
      "url": "{{base_url}}/api/calls",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callerNumber": "{{caller_phone}}",
        "customerId": "{{ctx.customer_id}}",
        "startedAt": "{{now_iso}}"
      },
      "store_in_ctx": {
        "call_id": "$.id"
      }
    },
    "on_end": {
      "method": "PATCH",
      "url": "{{base_url}}/api/calls",
      "body": {
        "id": "{{ctx.call_id}}",
        "endedAt": "{{now_iso}}",
        "durationSec": "{{call_duration_sec}}",
        "outcome": "{{outcome}}",
        "transcript": "{{transcript}}"
      }
    },
    "on_no_action": {
      "description": "Si l'appel se termine sans commande, reservation ou message",
      "condition": "not ctx.order_placed and not ctx.reservation_placed and not ctx.message_left and ctx.had_conversation",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callId": "{{ctx.call_id}}",
        "callerPhone": "{{caller_phone}}",
        "content": "Appel sans commande ni reservation.\n\nDernieres echanges:\n{{transcript_summary}}",
        "category": "info_request",
        "isUrgent": false
      }
    },
    "outcome_rules": [
      { "flag": "order_placed",       "outcome": "order_placed",       "priority": 1 },
      { "flag": "reservation_placed", "outcome": "reservation_placed", "priority": 2 },
      { "flag": "message_left",       "outcome": "message_left",       "priority": 3 },
      { "flag": "had_conversation",   "outcome": "info_only",          "priority": 4 },
      { "flag": null,                 "outcome": "abandoned",          "priority": 5 }
    ]
  }
}
```

**`on_start`** : Execute quand le stream Twilio/SIP demarre. Typiquement : creer un call record.
- `store_in_ctx` : enregistre des champs de la reponse dans `ctx` (ici `call_id`)

**`on_end`** : Execute quand l'appel se termine (deconnexion, end_call, timeout).
- `{{outcome}}` est calcule automatiquement a partir des `outcome_rules`
- `{{transcript}}` est le tableau JSON du transcript complet
- `{{call_duration_sec}}` est calcule automatiquement

**`on_no_action`** : Execute si la condition est vraie a la fin de l'appel. Permet de creer un message automatique pour les appels sans action.

**`outcome_rules`** : Liste ordonnee par priorite. Le premier flag vrai determine l'outcome.
- `flag: null` = fallback (toujours vrai)

### 4.7 `tools` — Definition declarative des tool handlers

C'est la section la plus importante. Elle remplace les 10 fonctions Python hardcodees.

```json
{
  "tools": {
    "check_availability": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/availability/check",
      "body": {
        "restaurantId": "{{agent.id}}",
        "mode": "{{args.mode}}",
        "requestedTime": "{{args.requested_time}}",
        "customerAddress": "{{args.customer_address}}",
        "customerCity": "{{args.customer_city}}",
        "customerPostalCode": "{{args.customer_postal_code}}",
        "partySize": "{{args.party_size}}",
        "seatingPreference": "{{args.seating_preference}}"
      },
      "store_in_ctx": {
        "last_availability_check": "$"
      },
      "on_error": {
        "return": { "available": false, "error": "{{error}}" }
      }
    },

    "save_customer_info": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/customers",
      "body": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{caller_phone}}",
        "firstName": "{{args.first_name}}",
        "deliveryAddress": "{{args.delivery_address}}",
        "deliveryCity": "{{args.delivery_city}}",
        "deliveryPostalCode": "{{args.delivery_postal_code}}",
        "deliveryNotes": "{{args.delivery_notes}}"
      },
      "store_in_ctx": {
        "customer_id": "$.id"
      },
      "on_error": {
        "return": { "success": false, "error": "{{error}}" }
      }
    },

    "log_new_faq": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/faq",
      "body": {
        "restaurantId": "{{agent.id}}",
        "question": "{{args.question}}",
        "category": "{{args.category}}",
        "callerPhone": "{{caller_phone}}"
      },
      "on_success": {
        "return": { "success": true, "message": "Question remontee" }
      },
      "on_error": {
        "return": { "success": true, "message": "Question notee" }
      }
    },

    "leave_message": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callId": "{{ctx.call_id}}",
        "callerPhone": "{{caller_phone}}",
        "callerName": "{{args.caller_name}}",
        "content": "{{args.content}}",
        "category": "{{args.category}}",
        "isUrgent": "{{args.is_urgent}}"
      },
      "on_success_flags": ["message_left"],
      "on_error": {
        "return": { "success": true, "message": "Message note" }
      }
    },

    "check_order_status": {
      "type": "http",
      "method": "GET",
      "url": "{{base_url}}/api/orders/status",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{args.customer_phone | default(caller_phone)}}"
      },
      "on_error": {
        "return": { "found": false, "orders": [], "error": "Impossible de verifier" }
      }
    },

    "cancel_order": {
      "type": "http",
      "method": "PATCH",
      "url": "{{base_url}}/api/orders",
      "pre_steps": [
        {
          "description": "Retrouver la commande par numero via check_order_status",
          "method": "GET",
          "url": "{{base_url}}/api/orders/status",
          "params": {
            "restaurantId": "{{agent.id}}",
            "phone": "{{caller_phone}}"
          },
          "extract": {
            "target_order": "$.orders[?(@.orderNumber == {{args.order_number}})]"
          },
          "fail_if": "target_order == null",
          "fail_return": { "success": false, "error": "Commande introuvable" }
        },
        {
          "description": "Verifier que la commande est annulable",
          "condition": "pre.target_order.status not in ['pending', 'confirmed']",
          "fail_return": { "success": false, "error": "Annulation impossible : commande en statut '{{pre.target_order.status}}'" }
        }
      ],
      "body": {
        "id": "{{pre.target_order.id}}",
        "status": "cancelled"
      },
      "on_success": {
        "return": { "success": true, "message": "Commande #{{args.order_number}} annulee" }
      }
    },

    "lookup_reservation": {
      "type": "http",
      "method": "GET",
      "url": "{{base_url}}/api/reservations/lookup",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{args.customer_phone | default(caller_phone)}}"
      },
      "on_error": {
        "return": { "found": false, "reservations": [] }
      }
    },

    "cancel_reservation": {
      "type": "http",
      "method": "PATCH",
      "url": "{{base_url}}/api/reservations",
      "body": {
        "id": "{{args.reservation_id}}",
        "status": "cancelled"
      },
      "on_success_flags": [],
      "on_success": {
        "return": { "success": true, "message": "Reservation annulee" }
      }
    },

    "confirm_order": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/orders",
      "body_builder": "confirm_order",
      "on_success_flags": ["order_placed"],
      "on_success": {
        "return": {
          "success": true,
          "order_id": "$.id",
          "message": "Commande enregistree",
          "heure_estimee": "{{ctx.last_availability_check.estimatedTime}}"
        }
      }
    },

    "confirm_reservation": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/reservations",
      "body_builder": "confirm_reservation",
      "on_success_flags": ["reservation_placed"],
      "on_success": {
        "return": {
          "success": true,
          "reservation_id": "$.id",
          "message": "Table reservee",
          "heure": "{{ctx.last_availability_check.estimatedTime}}"
        }
      }
    },

    "end_call": {
      "type": "builtin",
      "action": "hangup"
    }
  }
}
```

#### Anatomie d'un tool handler

| Champ | Type | Description |
|-------|------|-------------|
| `type` | `"http"` ou `"builtin"` | HTTP = appel API, builtin = action interne (hangup) |
| `method` | `"GET"`, `"POST"`, `"PATCH"`, `"PUT"`, `"DELETE"` | Methode HTTP |
| `url` | string (template) | URL de l'endpoint |
| `params` | object (templates) | Query parameters (pour GET) |
| `body` | object (templates) | Corps de la requete (pour POST/PATCH/PUT) |
| `body_builder` | string | Nom d'un body builder enregistre (voir section 7) |
| `pre_steps` | array | Etapes prealables (fetch, validation) |
| `store_in_ctx` | object | Champs de la reponse a stocker dans `ctx` |
| `on_success_flags` | string[] | Flags a mettre a `true` dans `ctx` si succes |
| `on_success.return` | object | Reponse a renvoyer a OpenAI si succes |
| `on_error.return` | object | Reponse a renvoyer a OpenAI si erreur |

#### `pre_steps` — Etapes prealables

Les `pre_steps` sont des mini-operations executees **avant** l'appel principal. Elles permettent :

1. **Fetch** : recuperer des donnees necessaires (ex: retrouver une commande par numero)
2. **Validation** : verifier une condition (ex: commande annulable)
3. **Extraction** : stocker des valeurs dans `pre.*` pour le body principal

Chaque step peut avoir :
- `method` / `url` / `params` : appel HTTP
- `extract` : JSONPath pour extraire des valeurs (stockees dans `pre.*`)
- `condition` : expression evaluee (sans appel HTTP)
- `fail_if` / `fail_return` : condition d'echec et reponse a retourner

### 4.8 `base_url` — URL de base de l'API

```json
{
  "base_url": "http://localhost:3000"
}
```

Utilise dans tous les templates comme `{{base_url}}`. Permet de changer l'environnement (dev/staging/prod) sans modifier les tools.

---

## 5. Moteur de templates

### 5.1 Syntaxe

Toutes les valeurs string dans le JSON config peuvent contenir des templates `{{...}}`.

```
{{agent.id}}                  → UUID du restaurant
{{agent.name}}                → Nom du restaurant
{{caller_phone}}              → Numero de l'appelant
{{args.mode}}                 → Argument du tool call OpenAI
{{args.customer_phone}}       → Argument du tool call
{{ctx.call_id}}               → Valeur du contexte de l'appel
{{ctx.last_availability_check.estimatedTime}} → Valeur imbriquee
{{session.customerContext.firstName}}         → Donnee de session
{{pre.target_order.id}}       → Valeur extraite d'un pre_step
{{base_url}}                  → URL de base de l'API
{{now_iso}}                   → Date/heure UTC ISO 8601
{{call_duration_sec}}         → Duree de l'appel en secondes
{{outcome}}                   → Outcome calcule (pour on_end)
{{transcript}}                → Transcript JSON complet
{{transcript_summary}}        → 6 dernieres lignes formatees
{{error}}                     → Message d'erreur (dans on_error)
```

### 5.2 Resolution

L'algorithme de resolution est simple (pas besoin de Jinja2) :

```
1. Parser le pattern {{path.to.value}}
2. Split par "." → ["path", "to", "value"]
3. Parcourir les namespaces dans l'ordre :
   a. Variables speciales (now_iso, caller_phone, etc.)
   b. pre.*  (resultats des pre_steps)
   c. args.* (arguments du tool call)
   d. ctx.*  (contexte de l'appel)
   e. session.* (donnees de la session chargees au debut)
   f. agent.* (identite de l'agent)
   g. Variables racine (base_url)
4. Si non trouve → null (le champ est omis du body)
```

### 5.3 Filtres

Syntaxe optionnelle : `{{value | filtre}}`

| Filtre | Description | Exemple |
|--------|-------------|---------|
| `default(X)` | Valeur par defaut si null | `{{args.phone \| default(caller_phone)}}` |
| `json` | Serialise en JSON string | `{{transcript \| json}}` |
| `int` | Cast en entier | `{{args.party_size \| int}}` |
| `float` | Cast en float | `{{args.total \| float}}` |

### 5.4 Nettoyage des null

Quand un template resout a `null` :
- Dans un **body** : le champ est **omis** (pas envoye a l'API)
- Dans un **params** : le parametre est **omis** de la query string
- Cela evite d'envoyer `"customerAddress": null` a l'API quand l'argument n'a pas ete fourni

Ce comportement est critique pour `check_availability` ou seuls certains champs sont presents selon le mode (delivery vs pickup vs reservation).

---

## 6. Executeur de tools

### 6.1 Flux d'execution

Quand OpenAI envoie un `response.function_call_arguments.done` :

```
1. Identifier le tool dans config.tools[function_name]

2. Si type == "builtin":
   a. Executer l'action interne (ex: hangup → ctx.should_hangup = true)
   b. Retourner {"status": "ok"}

3. Si type == "http":
   a. Executer les pre_steps (si presents)
      - Pour chaque step : appel HTTP, extraction, validation
      - Si un step echoue (fail_if/fail_return) → retourner fail_return
   b. Construire le body :
      - Si body_builder → appeler le builder enregistre
      - Sinon → resoudre les templates dans body/params
   c. Nettoyer les null (omission des champs null)
   d. Executer l'appel HTTP principal
   e. Si succes :
      - Stocker les valeurs dans ctx (store_in_ctx)
      - Activer les flags (on_success_flags)
      - Retourner on_success.return (avec resolution des $. JSONPath sur la reponse)
      - Si pas de on_success.return → retourner la reponse brute de l'API
   f. Si erreur :
      - Retourner on_error.return (avec {{error}} resolu)
      - Si pas de on_error → propager l'erreur

4. Si tool inconnu : retourner {"error": "Fonction inconnue: xxx"}

5. Envoyer le resultat a OpenAI via conversation.item.create + response.create
```

### 6.2 Gestion des types

Le moteur de templates produit des strings. Pour les body JSON, il faut convertir certaines valeurs :

- `"{{args.party_size}}"` → l'API attend un entier, pas une string
- `"{{args.is_urgent}}"` → l'API attend un boolean

**Strategie** : le moteur detecte le type de la valeur source et conserve le type natif :
- Si `args.party_size` est un int dans les arguments OpenAI → reste int dans le body
- Si c'est un string → reste string
- Les filtres `| int` et `| float` forcent le cast

### 6.3 Tool non defini dans la config

Si OpenAI appelle un tool qui n'est pas dans `config.tools` (ne devrait pas arriver si les tools OpenAI sont correctement configures), l'executeur retourne :

```json
{"error": "Fonction inconnue: xxx"}
```

---

## 7. Body builders (logique complexe)

### 7.1 Pourquoi des body builders ?

Certains tools necessitent une logique qui depasse le simple templating :

- **`confirm_order`** : resolution de `item_map` (index `#N` → UUID), calcul du `totalPrice` par item, formatage des `selectedOptions`, fallback timezone pour `estimatedReadyAt`
- **`confirm_reservation`** : parsing de l'heure HH:MM → ISO 8601 avec gestion du jour suivant si l'heure est passee

Ces operations impliquent des boucles, des lookups dans des maps, et des calculs — impossible a exprimer avec des templates simples.

### 7.2 Interface

Un body builder est une **fonction Python enregistree** qui recoit le contexte et les arguments, et retourne un dict pret a etre envoye a l'API :

```python
def build_confirm_order_body(args: dict, ctx: dict, session: dict) -> dict:
    """Construit le body pour POST /api/orders."""
    ...
    return order_data

def build_confirm_reservation_body(args: dict, ctx: dict, session: dict) -> dict:
    """Construit le body pour POST /api/reservations."""
    ...
    return reservation_data

BODY_BUILDERS = {
    "confirm_order": build_confirm_order_body,
    "confirm_reservation": build_confirm_reservation_body,
}
```

### 7.3 `confirm_order` — Detail de la logique

```
Input:
  args.items = [{id: 3, quantity: 1, unit_price: 9.50, selected_options: [{name: "Taille", choice: "Grande", extra_price: 2}]}]
  ctx.item_map = {3: {id: "uuid-pizza-marg", name: "Margherita"}}
  ctx.last_availability_check = {estimatedTimeISO: "2025-01-15T19:30:00Z", estimatedTime: "19:30", ...}

Processing:
  1. Pour chaque item dans args.items :
     a. Lookup item_map[str(item.id)] → {id: UUID, name: string}
     b. Pour chaque selected_option :
        - Si choice_id present → lookup item_map[str(choice_id)] pour le nom
        - Sinon → utiliser choice tel quel
     c. Calculer totalPrice = unit_price * quantity
  2. Construire le payload avec :
     - restaurantId, callId, customerId depuis ctx
     - estimatedReadyAt depuis ctx.last_availability_check.estimatedTimeISO
     - Fallback timezone si estimatedTimeISO absent
     - items resolus avec UUIDs

Output:
  {
    "restaurantId": "uuid",
    "callId": "call-uuid",
    "customerPhone": "+33612345678",
    "total": 11.50,
    "orderType": "pickup",
    "estimatedReadyAt": "2025-01-15T19:30:00Z",
    "items": [{
      "menuItemId": "uuid-pizza-marg",
      "name": "Margherita",
      "quantity": 1,
      "unitPrice": 9.50,
      "totalPrice": 9.50,
      "selectedOptions": [{"name": "Taille", "choice": "Grande", "extra_price": 2}]
    }]
  }
```

### 7.4 `confirm_reservation` — Detail de la logique

```
Input:
  args = {customer_name: "Jean", customer_phone: "+33612345678", party_size: 4, reservation_time: "20:00", seating_preference: "window", notes: "Anniversaire"}
  ctx.last_availability_check = {estimatedTimeISO: "2025-01-15T20:00:00Z"}

Processing:
  1. Si ctx.last_availability_check.estimatedTimeISO existe → utiliser directement
  2. Sinon : parser args.reservation_time (HH:MM)
     a. Creer un datetime a cette heure en timezone Europe/Paris
     b. Si l'heure est passee → ajouter 1 jour
     c. Convertir en UTC ISO 8601
  3. Construire le payload avec :
     - restaurantId, callId, customerId depuis ctx
     - customerPhone = args.customer_phone ou ctx.caller_phone

Output:
  {
    "restaurantId": "uuid",
    "callId": "call-uuid",
    "customerId": "cust-uuid",
    "customerName": "Jean",
    "customerPhone": "+33612345678",
    "partySize": 4,
    "reservationTime": "2025-01-15T20:00:00Z",
    "status": "confirmed",
    "seatingPreference": "window",
    "notes": "Anniversaire"
  }
```

### 7.5 Extensibilite

Pour ajouter un nouveau body builder (ex: `confirm_appointment` pour un cabinet medical) :

1. Creer une fonction `build_confirm_appointment_body(args, ctx, session) → dict`
2. L'enregistrer dans `BODY_BUILDERS`
3. Utiliser `"body_builder": "confirm_appointment"` dans la config du tool

**Alternative** : si la logique est simple (pas de resolution d'item_map), un body template suffit — pas besoin de body builder. Les body builders ne sont necessaires que pour la logique non-triviale.

---

## 8. Cycle de vie d'un appel

### 8.1 Sequence complete

```
Appel entrant (Twilio/SIP)
    │
    ▼
1. WebSocket /media-stream accepte
    │
    ▼
2. Event "start" recu
    ├── Extraire caller_phone, restaurantId depuis customParameters
    ├── Initialiser ctx = {caller_phone, agent_id, call_start, ...}
    │
    ▼
3. Pre-call checks (config.pre_call_checks)
    ├── Pour chaque check : HTTP GET, evaluer block_if
    ├── Si bloque → hangup (fermer WebSocket)
    │
    ▼
4. Charger la session
    ├── Mode config_url : GET url avec params → response_mapping
    ├── Mode inline : utiliser instructions + tools directement
    ├── Initialiser ctx avec ctx_init
    │
    ▼
5. Configurer session OpenAI (session.update)
    ├── instructions, tools, voice, VAD, audio formats
    │
    ▼
6. Lifecycle on_start
    ├── Appel HTTP (ex: POST /api/calls)
    ├── store_in_ctx (ex: call_id)
    │
    ▼
7. Greeting
    ├── Evaluer condition_field → known/unknown
    ├── Envoyer comme message user → OpenAI genere la premiere reponse
    │
    ▼
8. Boucle principale (parallele)
    │
    ├── receive_from_twilio : audio → OpenAI
    ├── send_to_twilio : audio ← OpenAI
    │   ├── Tool calls → executeur de tools
    │   ├── Transcripts → ctx.transcript
    │   ├── Interruptions → clear + truncate
    │   └── end_call → should_hangup → finalize
    └── call_duration_watchdog : timeout max
    │
    ▼
9. Fin d'appel
    ├── Calculer outcome (outcome_rules)
    ├── Executer on_no_action (si applicable)
    ├── Executer lifecycle on_end (PATCH /api/calls)
    └── Fermer les WebSockets
```

### 8.2 Variables speciales du contexte

Le moteur maintient ces variables automatiquement (pas dans la config) :

| Variable | Type | Description |
|----------|------|-------------|
| `ctx.caller_phone` | string | Numero de l'appelant |
| `ctx.call_start` | datetime | Heure de debut de l'appel |
| `ctx.call_id` | string | ID du call record (set par on_start) |
| `ctx.customer_id` | string | ID du client (set par session ou save_customer_info) |
| `ctx.had_conversation` | bool | True si au moins un transcript |
| `ctx.transcript` | array | Tableau des messages {role, content, timestamp} |
| `ctx.should_hangup` | bool | True quand end_call est appele |
| `ctx.*` | any | Flags dynamiques (order_placed, reservation_placed, message_left, etc.) |

Les flags dans `ctx` sont crees dynamiquement par `on_success_flags`. Ils n'ont pas besoin d'etre declares a l'avance.

---

## 9. Integration avec le service manager

### 9.1 Responsabilite du service manager

Le service manager v2 a une responsabilite supplementaire : **construire le JSON config** pour chaque agent.

```
Service Manager (v2)
  │
  ├── 1. GET /api/sip/agents → liste des restaurants
  │      (sipBridge, sipDomain, sipUsername, sipPassword)
  │
  ├── 2. Pour chaque restaurant :
  │      a. Charger le template de config (restaurant.json.template)
  │      b. Injecter les valeurs specifiques :
  │         - agent.id = restaurantId
  │         - agent.name = restaurantName
  │         - base_url = NEXT_API_URL
  │         - SIP credentials (pour sipbridge)
  │      c. Ecrire configs/{restaurantId}.json
  │
  ├── 3. Lancer le processus :
  │      python agent.py --config configs/{restaurantId}.json --port 5050
  │      (+ sipbridge si sipBridge=true)
  │
  └── 4. Gerer le cycle de vie (health, restart, stop)
```

### 9.2 Template de config

Le service manager utilise un **template par type d'agent**. Pour les restaurants :

```
sip-service-v2/
  templates/
    restaurant.json        ← template complet pour un restaurant
    standard.json          ← template pour un standard telephonique
    medical.json           ← template pour un cabinet medical
```

Le template est un JSON avec des placeholders que le service manager remplace :

```json
{
  "version": "2.0",
  "agent": {
    "id": "${RESTAURANT_ID}",
    "name": "${RESTAURANT_NAME}",
    "type": "restaurant"
  },
  "base_url": "${NEXT_API_URL}",
  ...
}
```

Les `${...}` sont resolus par le service manager au moment de l'ecriture du fichier config. C'est un remplacement simple (pas le moteur de templates de l'agent).

### 9.3 Passage de config a l'agent

```bash
# Lancement par le service manager
python agent.py \
  --config configs/abc123.json \
  --port 5050

# Variables d'environnement toujours necessaires
OPENAI_API_KEY=sk-...   # Cle API OpenAI
```

L'agent lit `--config` au demarrage, parse le JSON, et l'utilise pour toute la duree de vie du processus.

### 9.4 Rafraichissement de la config

**Question** : que se passe-t-il si le menu change pendant que l'agent tourne ?

**Reponse** : avec le mode `config_url`, le prompt et les tools sont recharges a **chaque nouvel appel** (fetch vers `/api/ai`). Le fichier JSON config n'a pas besoin d'etre re-genere — il contient seulement l'URL, pas le prompt lui-meme.

Les seuls cas ou le JSON config doit etre re-genere :
- Changement de type d'agent (restaurant → standard)
- Changement de base_url (changement d'environnement)
- Changement de SIP credentials

Ces cas sont geres par le `refresh_loop` du service manager (re-fetch `/api/sip/agents` toutes les 5 min).

---

## 10. Migration v1 → v2

### 10.1 Coexistence

Les deux versions coexistent dans des dossiers separes :

```
sip-service/           ← v1 (actuel, inchange)
  app.py
  service_manager.py
  sipbridge.py

sip-service-v2/        ← v2 (nouveau)
  agent.py
  service_manager.py   ← fork du v1 avec ajout de la generation de config
  templates/
  configs/
```

Le service manager v2 est un fork du v1, pas un remplacement. On peut faire tourner l'un ou l'autre.

### 10.2 Variable d'environnement

```bash
# Choisir la version
AGENT_VERSION=v2   # ou v1 (defaut)
```

Le script de demarrage (`start-manager.sh`) route vers le bon dossier.

### 10.3 Compatibilite API

L'API Next.js ne change pas du tout :
- `GET /api/ai` retourne deja le format attendu par le mode `config_url`
- `GET /api/sip/agents` retourne deja la liste des restaurants
- Tous les endpoints de tools (orders, reservations, availability, etc.) restent identiques

### 10.4 Etapes de migration

1. **Phase 1** : Developper l'agent v2 + templates, tester en parallele du v1
2. **Phase 2** : Valider que tous les scenarios fonctionnent (commande, reservation, annulation, message, suivi, blocked phone)
3. **Phase 3** : Basculer le service manager sur v2 (`AGENT_VERSION=v2`)
4. **Phase 4** : Supprimer v1 apres stabilisation

---

## 11. Structure des fichiers

```
sip-service-v2/
├── ARCHITECTURE.md           ← Ce document
├── agent.py                  ← Agent generique (remplace app.py)
│                                ~500 lignes : WebSocket proxy + executeur de tools
├── config_loader.py          ← Chargement et validation du JSON config
│                                ~100 lignes : lecture fichier, validation schema
├── template_engine.py        ← Moteur de templates {{...}}
│                                ~150 lignes : resolution, filtres, nettoyage null
├── tool_executor.py          ← Executeur de tools declaratifs
│                                ~200 lignes : pre_steps, appels HTTP, store_in_ctx
├── body_builders.py          ← Body builders pour tools complexes
│                                ~200 lignes : confirm_order, confirm_reservation
├── lifecycle.py              ← Gestion du cycle de vie (on_start, on_end, outcome)
│                                ~100 lignes
├── service_manager.py        ← Service manager v2 (fork du v1 + generation config)
│                                ~700 lignes
├── templates/
│   └── restaurant.json       ← Template config pour type "restaurant"
├── configs/                  ← Configs generees (gitignore)
│   └── {restaurantId}.json
└── requirements.txt          ← Memes deps que v1 (fastapi, uvicorn, websockets, httpx, aiohttp)
```

### Estimation de taille

| Fichier | Lignes estimees | Complexite |
|---------|-----------------|------------|
| agent.py | ~500 | Moyenne — c'est le coeur, similaire a app.py mais sans handlers |
| config_loader.py | ~100 | Faible — lecture JSON + validation basique |
| template_engine.py | ~150 | Moyenne — parsing regex, resolution de path, filtres |
| tool_executor.py | ~200 | Haute — pre_steps, appels HTTP, gestion d'erreurs |
| body_builders.py | ~200 | Moyenne — logique metier portee depuis app.py |
| lifecycle.py | ~100 | Faible — on_start/on_end/outcome resolution |
| service_manager.py | ~700 | Moyenne — fork du v1 + generation de config |
| **Total** | **~1950** | |

A comparer avec le v1 : `app.py` (950 lignes) + `service_manager.py` (605 lignes) = **1555 lignes**.

Le v2 est ~25% plus gros mais beaucoup plus modulaire et extensible.

---

## 12. Exemple complet — Config restaurant

Voici le JSON config complet genere par le service manager pour un restaurant :

```json
{
  "version": "2.0",

  "agent": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Pizza Bella",
    "type": "restaurant"
  },

  "base_url": "http://localhost:3000",

  "openai": {
    "model": "gpt-realtime",
    "voice": "sage",
    "temperature": 0.7,
    "vad": {
      "threshold": 0.5,
      "silence_duration_ms": 500,
      "prefix_padding_ms": 300
    },
    "input_audio_format": "g711_ulaw",
    "output_audio_format": "g711_ulaw",
    "input_audio_transcription": {
      "model": "whisper-1"
    }
  },

  "session": {
    "mode": "config_url",
    "url": "{{base_url}}/api/ai",
    "params": {
      "restaurantId": "{{agent.id}}",
      "callerPhone": "{{caller_phone}}"
    },
    "response_mapping": {
      "instructions": "$.systemPrompt",
      "tools": "$.tools",
      "voice": "$.voice",
      "ctx_init": {
        "item_map": "$.itemMap",
        "avg_prep_time_min": "$.avgPrepTimeMin",
        "delivery_enabled": "$.deliveryEnabled",
        "customer_id": "$.customerContext.id"
      }
    }
  },

  "pre_call_checks": [
    {
      "name": "blocked_phone",
      "method": "GET",
      "url": "{{base_url}}/api/blocked-phones/check",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{caller_phone}}"
      },
      "block_if": "$.blocked == true",
      "on_block": "hangup"
    }
  ],

  "greeting": {
    "known_customer": "Le client {{session.customerContext.firstName}} vient d'appeler (client fidele, {{session.customerContext.totalOrders}} commandes). Accueille-le par son prenom et demande ce qu'il souhaite commander.",
    "unknown_customer": "Un nouveau client vient d'appeler. Accueille-le chaleureusement, presente-toi brievement et demande ce qu'il souhaite commander.",
    "condition_field": "session.customerContext.firstName"
  },

  "lifecycle": {
    "on_start": {
      "method": "POST",
      "url": "{{base_url}}/api/calls",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callerNumber": "{{caller_phone}}",
        "customerId": "{{ctx.customer_id}}",
        "startedAt": "{{now_iso}}"
      },
      "store_in_ctx": {
        "call_id": "$.id"
      }
    },
    "on_end": {
      "method": "PATCH",
      "url": "{{base_url}}/api/calls",
      "body": {
        "id": "{{ctx.call_id}}",
        "endedAt": "{{now_iso}}",
        "durationSec": "{{call_duration_sec}}",
        "outcome": "{{outcome}}",
        "transcript": "{{transcript}}"
      }
    },
    "on_no_action": {
      "condition": "not ctx.order_placed and not ctx.reservation_placed and not ctx.message_left and ctx.had_conversation",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callId": "{{ctx.call_id}}",
        "callerPhone": "{{caller_phone}}",
        "content": "Appel sans commande ni reservation.\n\nDernieres echanges:\n{{transcript_summary}}",
        "category": "info_request",
        "isUrgent": false
      }
    },
    "outcome_rules": [
      { "flag": "order_placed",       "outcome": "order_placed",       "priority": 1 },
      { "flag": "reservation_placed", "outcome": "reservation_placed", "priority": 2 },
      { "flag": "message_left",       "outcome": "message_left",       "priority": 3 },
      { "flag": "had_conversation",   "outcome": "info_only",          "priority": 4 },
      { "flag": null,                 "outcome": "abandoned",          "priority": 5 }
    ]
  },

  "tools": {
    "check_availability": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/availability/check",
      "body": {
        "restaurantId": "{{agent.id}}",
        "mode": "{{args.mode}}",
        "requestedTime": "{{args.requested_time}}",
        "customerAddress": "{{args.customer_address}}",
        "customerCity": "{{args.customer_city}}",
        "customerPostalCode": "{{args.customer_postal_code}}",
        "partySize": "{{args.party_size}}",
        "seatingPreference": "{{args.seating_preference}}"
      },
      "store_in_ctx": {
        "last_availability_check": "$"
      },
      "on_error": {
        "return": { "available": false, "error": "{{error}}" }
      }
    },

    "confirm_order": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/orders",
      "body_builder": "confirm_order",
      "on_success_flags": ["order_placed"],
      "on_success": {
        "return": {
          "success": true,
          "order_id": "$.id",
          "message": "Commande enregistree",
          "heure_estimee": "{{ctx.last_availability_check.estimatedTime}}"
        }
      },
      "on_error": {
        "return": { "success": false, "error": "{{error}}" }
      }
    },

    "confirm_reservation": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/reservations",
      "body_builder": "confirm_reservation",
      "on_success_flags": ["reservation_placed"],
      "on_success": {
        "return": {
          "success": true,
          "reservation_id": "$.id",
          "message": "Table reservee",
          "heure": "{{ctx.last_availability_check.estimatedTime}}"
        }
      },
      "on_error": {
        "return": { "success": false, "error": "{{error}}" }
      }
    },

    "save_customer_info": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/customers",
      "body": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{caller_phone}}",
        "firstName": "{{args.first_name}}",
        "deliveryAddress": "{{args.delivery_address}}",
        "deliveryCity": "{{args.delivery_city}}",
        "deliveryPostalCode": "{{args.delivery_postal_code}}",
        "deliveryNotes": "{{args.delivery_notes}}"
      },
      "store_in_ctx": {
        "customer_id": "$.id"
      },
      "on_error": {
        "return": { "success": false, "error": "{{error}}" }
      }
    },

    "log_new_faq": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/faq",
      "body": {
        "restaurantId": "{{agent.id}}",
        "question": "{{args.question}}",
        "category": "{{args.category}}",
        "callerPhone": "{{caller_phone}}"
      },
      "on_success": {
        "return": { "success": true, "message": "Question remontee" }
      },
      "on_error": {
        "return": { "success": true, "message": "Question notee" }
      }
    },

    "leave_message": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "restaurantId": "{{agent.id}}",
        "callId": "{{ctx.call_id}}",
        "callerPhone": "{{caller_phone}}",
        "callerName": "{{args.caller_name}}",
        "content": "{{args.content}}",
        "category": "{{args.category}}",
        "isUrgent": "{{args.is_urgent}}"
      },
      "on_success_flags": ["message_left"],
      "on_error": {
        "return": { "success": true, "message": "Message note" }
      }
    },

    "check_order_status": {
      "type": "http",
      "method": "GET",
      "url": "{{base_url}}/api/orders/status",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{args.customer_phone | default(caller_phone)}}"
      },
      "on_error": {
        "return": { "found": false, "orders": [], "error": "Impossible de verifier" }
      }
    },

    "cancel_order": {
      "type": "http",
      "method": "PATCH",
      "url": "{{base_url}}/api/orders",
      "pre_steps": [
        {
          "method": "GET",
          "url": "{{base_url}}/api/orders/status",
          "params": {
            "restaurantId": "{{agent.id}}",
            "phone": "{{caller_phone}}"
          },
          "extract": {
            "target_order": "$.orders[?(@.orderNumber == {{args.order_number}})]"
          },
          "fail_if": "target_order == null",
          "fail_return": { "success": false, "error": "Commande introuvable" }
        },
        {
          "condition": "pre.target_order.status not in ['pending', 'confirmed']",
          "fail_return": { "success": false, "error": "Annulation impossible" }
        }
      ],
      "body": {
        "id": "{{pre.target_order.id}}",
        "status": "cancelled"
      },
      "on_success": {
        "return": { "success": true, "message": "Commande annulee" }
      }
    },

    "lookup_reservation": {
      "type": "http",
      "method": "GET",
      "url": "{{base_url}}/api/reservations/lookup",
      "params": {
        "restaurantId": "{{agent.id}}",
        "phone": "{{args.customer_phone | default(caller_phone)}}"
      },
      "on_error": {
        "return": { "found": false, "reservations": [] }
      }
    },

    "cancel_reservation": {
      "type": "http",
      "method": "PATCH",
      "url": "{{base_url}}/api/reservations",
      "body": {
        "id": "{{args.reservation_id}}",
        "status": "cancelled"
      },
      "on_success": {
        "return": { "success": true, "message": "Reservation annulee" }
      }
    },

    "end_call": {
      "type": "builtin",
      "action": "hangup"
    }
  }
}
```

---

## 13. Exemples — Autres cas d'usage

### 13.1 Standard telephonique

Un standard qui route les appels vers le bon service :

```json
{
  "version": "2.0",
  "agent": {
    "id": "standard-xyz",
    "name": "Standard XYZ Corp",
    "type": "standard"
  },
  "base_url": "https://api.xyz-corp.com",
  "openai": {
    "voice": "alloy",
    "temperature": 0.5
  },
  "session": {
    "mode": "inline",
    "instructions": "Tu es le standard telephonique de XYZ Corp. Les services disponibles sont : commercial (ventes et devis), support technique (problemes produit), comptabilite (factures et paiements), direction (autres demandes). Identifie le besoin du client et transfere-le au bon service. Si tu ne peux pas determiner le service, propose les options.",
    "tools": [
      {
        "type": "function",
        "name": "transfer_call",
        "description": "Transferer l'appel vers un service",
        "parameters": {
          "type": "object",
          "properties": {
            "department": {
              "type": "string",
              "enum": ["commercial", "support", "comptabilite", "direction"]
            },
            "reason": { "type": "string" }
          },
          "required": ["department"]
        }
      },
      {
        "type": "function",
        "name": "leave_message",
        "description": "Laisser un message si le service est indisponible",
        "parameters": {
          "type": "object",
          "properties": {
            "department": { "type": "string" },
            "caller_name": { "type": "string" },
            "content": { "type": "string" }
          },
          "required": ["content"]
        }
      }
    ]
  },
  "greeting": {
    "unknown_customer": "Un appel entrant. Accueille l'appelant : Bonjour, XYZ Corp, comment puis-je vous aider ?",
    "known_customer": "Un appel entrant. Accueille l'appelant : Bonjour, XYZ Corp, comment puis-je vous aider ?",
    "condition_field": null
  },
  "lifecycle": {
    "on_start": {
      "method": "POST",
      "url": "{{base_url}}/api/calls",
      "body": {
        "callerNumber": "{{caller_phone}}",
        "startedAt": "{{now_iso}}"
      },
      "store_in_ctx": { "call_id": "$.id" }
    },
    "on_end": {
      "method": "PATCH",
      "url": "{{base_url}}/api/calls",
      "body": {
        "id": "{{ctx.call_id}}",
        "endedAt": "{{now_iso}}",
        "durationSec": "{{call_duration_sec}}",
        "outcome": "{{outcome}}"
      }
    },
    "outcome_rules": [
      { "flag": "transferred", "outcome": "transferred", "priority": 1 },
      { "flag": "message_left", "outcome": "message_left", "priority": 2 },
      { "flag": null,           "outcome": "abandoned",    "priority": 3 }
    ]
  },
  "tools": {
    "transfer_call": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/transfers",
      "body": {
        "callId": "{{ctx.call_id}}",
        "department": "{{args.department}}",
        "reason": "{{args.reason}}"
      },
      "on_success_flags": ["transferred"]
    },
    "leave_message": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "callId": "{{ctx.call_id}}",
        "department": "{{args.department}}",
        "callerName": "{{args.caller_name}}",
        "callerPhone": "{{caller_phone}}",
        "content": "{{args.content}}"
      },
      "on_success_flags": ["message_left"]
    },
    "end_call": {
      "type": "builtin",
      "action": "hangup"
    }
  }
}
```

### 13.2 Cabinet medical

Un agent de prise de rendez-vous medical :

```json
{
  "version": "2.0",
  "agent": {
    "id": "cabinet-dr-martin",
    "name": "Cabinet Dr. Martin",
    "type": "medical"
  },
  "base_url": "https://api.dr-martin.fr",
  "openai": {
    "voice": "nova",
    "temperature": 0.5
  },
  "session": {
    "mode": "config_url",
    "url": "{{base_url}}/api/ai-config",
    "params": {
      "cabinetId": "{{agent.id}}",
      "callerPhone": "{{caller_phone}}"
    },
    "response_mapping": {
      "instructions": "$.systemPrompt",
      "tools": "$.tools",
      "ctx_init": {
        "patient_id": "$.patientContext.id",
        "patient_name": "$.patientContext.name"
      }
    }
  },
  "greeting": {
    "known_customer": "Le patient {{session.patientContext.name}} appelle. Accueille-le par son nom.",
    "unknown_customer": "Un nouveau patient appelle. Accueille-le et demande son nom.",
    "condition_field": "session.patientContext.name"
  },
  "tools": {
    "check_availability": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/slots/check",
      "body": {
        "cabinetId": "{{agent.id}}",
        "practitioner": "{{args.practitioner}}",
        "requestedDate": "{{args.date}}",
        "consultationType": "{{args.type}}"
      },
      "store_in_ctx": { "last_slot_check": "$" }
    },
    "confirm_appointment": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/appointments",
      "body": {
        "cabinetId": "{{agent.id}}",
        "patientId": "{{ctx.patient_id}}",
        "patientPhone": "{{caller_phone}}",
        "practitioner": "{{args.practitioner}}",
        "slotId": "{{ctx.last_slot_check.slotId}}",
        "type": "{{args.type}}",
        "notes": "{{args.notes}}"
      },
      "on_success_flags": ["appointment_booked"]
    },
    "cancel_appointment": {
      "type": "http",
      "method": "PATCH",
      "url": "{{base_url}}/api/appointments/{{args.appointment_id}}",
      "body": { "status": "cancelled" },
      "on_success": {
        "return": { "success": true, "message": "Rendez-vous annule" }
      }
    },
    "leave_message": {
      "type": "http",
      "method": "POST",
      "url": "{{base_url}}/api/messages",
      "body": {
        "callerPhone": "{{caller_phone}}",
        "content": "{{args.content}}",
        "isUrgent": "{{args.is_urgent}}"
      },
      "on_success_flags": ["message_left"]
    },
    "end_call": {
      "type": "builtin",
      "action": "hangup"
    }
  },
  "lifecycle": {
    "outcome_rules": [
      { "flag": "appointment_booked", "outcome": "appointment_booked", "priority": 1 },
      { "flag": "message_left",       "outcome": "message_left",       "priority": 2 },
      { "flag": null,                 "outcome": "abandoned",          "priority": 3 }
    ]
  }
}
```

---

## 14. Limites et points ouverts

### 14.1 Limites du templating

Le moteur de templates est volontairement simple (`{{path}}` + quelques filtres). Il ne gere pas :
- Les boucles (`for item in items`)
- Les conditions complexes (`if X > 5 then Y`)
- Les transformations de donnees (map, filter, reduce)

**Mitigation** : les body builders couvrent les cas complexes. Si un nouveau cas d'usage necessite de la logique, on ajoute un body builder plutot que de complexifier le moteur.

### 14.2 Body builders = code Python

Les body builders cassent un peu le principe "tout en JSON". Ils sont necessaires pour :
- `confirm_order` (resolution item_map, boucle sur items, calcul totalPrice)
- `confirm_reservation` (parsing HH:MM → ISO, timezone)

**Evolution possible** : si l'API acceptait directement les index `#N` au lieu des UUIDs, le body builder `confirm_order` ne serait plus necessaire. Le body builder est un palliatif pour une API qui attend des UUIDs alors que l'IA travaille avec des index.

### 14.3 Pre-steps et JSONPath

Les `pre_steps` utilisent des expressions JSONPath (`$.orders[?(@.orderNumber == 42)]`) qui ajoutent de la complexite au moteur.

**Alternative** : simplifier en ne supportant que des JSONPath basiques (`$.field.subfield`) et deleguer les filtrages complexes a l'API (ex: `GET /api/orders/by-number?number=42`).

### 14.4 Expressions conditionnelles

Les champs `block_if`, `condition`, `fail_if` dans les pre_call_checks et pre_steps utilisent des expressions evaluees en Python. Cela pose des questions de securite (injection).

**Mitigation** : utiliser un evaluateur restreint (pas `eval()`) qui ne supporte que :
- Comparaisons : `==`, `!=`, `>`, `<`, `>=`, `<=`
- Operateurs logiques : `and`, `or`, `not`
- Acces aux champs : `$.field`, `ctx.field`, `pre.field`
- Valeurs : `null`, `true`, `false`, strings, numbers
- Listes : `in [...]`, `not in [...]`

### 14.5 Gestion des erreurs reseau

Si un appel HTTP dans un tool echoue (timeout, 500, etc.) :
- `on_error.return` est envoye a OpenAI → l'IA gere gracieusement
- Mais si c'est un lifecycle event (on_start, on_end) qui echoue → log + ignorer

### 14.6 Tests

Tester un agent config-driven est plus facile que tester du code Python :
- On peut **valider le JSON** contre un schema
- On peut **simuler** les appels HTTP avec des mocks
- On peut **rejouer** un transcript avec un config donne

Un test end-to-end serait :
1. Charger un config JSON
2. Simuler un flux WebSocket (events Twilio pre-enregistres)
3. Mocker les appels HTTP (api_post, api_get, api_patch)
4. Verifier les reponses envoyees a OpenAI et les appels HTTP effectues

### 14.7 Observabilite

L'agent v2 devrait logger :
- Chaque tool call recu (nom, arguments)
- Chaque appel HTTP effectue (method, url, status, duree)
- Chaque template resolu (pour debug)
- Les flags actives/outcome calcule

Format de log structure (JSON) pour faciliter l'aggregation :

```json
{"level": "info", "event": "tool_call", "tool": "check_availability", "agent_id": "uuid", "call_id": "uuid", "duration_ms": 150}
```
