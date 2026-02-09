# QUICKSTART.md — Installation et premier lancement

## Prérequis

| Outil | Version | Vérifier |
|-------|---------|----------|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| Python | 3.10+ | `python3 --version` |
| pjsua2 | Compilé avec Python bindings | `python3 -c "import pjsua2"` |
| Git | 2+ | `git --version` |

### Comptes / Clés API nécessaires

| Service | Clé | Où la trouver |
|---------|-----|---------------|
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Google Maps | `GOOGLE_MAPS_API_KEY` | [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services |
| Twilio | `SIP_USERNAME` + `SIP_PASSWORD` | [twilio.com/console](https://www.twilio.com/console) → SIP Trunking |

### APIs Google à activer

Dans la console Google Cloud, activer :
- Geocoding API
- Distance Matrix API
- Places API

Budget recommandé : 10€/mois pour le POC.

---

## 1. Cloner et configurer

```bash
git clone <repo_url> voiceorder-ai
cd voiceorder-ai

# Copier le fichier de config
cp .env.example .env
```

Éditer `.env` avec vos clés :

```bash
nano .env
```

```env
# Minimum requis pour démarrer :
DATABASE_TYPE=sqlite
DATABASE_URL=./poc.db
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_MAPS_API_KEY=AIzaXXXXXXXXXXXXXXXXXX
SIP_DOMAIN=sip.twilio.com
SIP_USERNAME=your_twilio_sip_username
SIP_PASSWORD=your_twilio_sip_password
```

---

## 2. Installer et lancer le Dashboard (Next.js)

```bash
cd web

# Installer les dépendances
npm install

# Créer la base de données SQLite
npx ts-node src/db/sync.ts

# Lancer le serveur de développement
npm run dev
```

→ Dashboard disponible sur **http://localhost:3000**

### Vérifier que ça fonctionne

```bash
# L'API doit répondre
curl http://localhost:3000/api/restaurants
# → [] (liste vide, normal)
```

---

## 3. Créer un restaurant de test

### Option A : Via l'interface d'import

1. Aller sur http://localhost:3000/import
2. Chercher un restaurant sur Google Places
3. Importer ses infos + scanner/scraper le menu
4. Valider

### Option B : Via curl (plus rapide pour tester)

```bash
# Créer le restaurant
curl -X POST http://localhost:3000/api/restaurants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pizzeria Test",
    "address": "1 Rue de la Paix",
    "city": "Marseille",
    "postalCode": "13001",
    "lat": 43.2965,
    "lng": 5.3698,
    "deliveryEnabled": true,
    "deliveryRadiusKm": 5,
    "deliveryFee": 2.50,
    "deliveryFreeAbove": 25,
    "minOrderAmount": 15,
    "avgPrepTimeMin": 30,
    "welcomeMessage": "Bienvenue chez Pizzeria Test !",
    "aiVoice": "sage"
  }'

# → Note l'ID retourné (ex: "abc-123-def")
```

```bash
# Ajouter une catégorie
curl -X POST http://localhost:3000/api/menu \
  -H "Content-Type: application/json" \
  -d '{
    "type": "category",
    "data": {
      "restaurantId": "ID_DU_RESTAURANT",
      "name": "Pizzas",
      "displayOrder": 0
    }
  }'

# Ajouter un item
curl -X POST http://localhost:3000/api/menu \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "ID_DU_RESTAURANT",
    "categoryId": "ID_DE_LA_CATEGORIE",
    "name": "Margherita",
    "description": "Sauce tomate, mozzarella, basilic",
    "price": 9.50,
    "allergens": ["gluten", "lactose"],
    "options": [
      {
        "name": "Taille",
        "type": "single_choice",
        "required": true,
        "choices": [
          { "label": "Normale", "price_modifier": 0 },
          { "label": "Grande", "price_modifier": 3 }
        ]
      }
    ]
  }'
```

---

## 4. Tester le prompt IA (sans téléphone)

```bash
# Vérifier que le prompt contient bien le menu
curl "http://localhost:3000/api/ai/prompt?restaurantId=ID_DU_RESTAURANT&callerPhone=0612345678"
```

La réponse doit contenir :
- `systemPrompt` : le prompt complet avec le menu, les prix, la config livraison
- `tools` : les 3 function calling (confirm_order, check_delivery_address, save_customer_info)
- `voice` : "sage"
- `customerContext` : null (nouveau client) ou les infos du client connu

---

## 5. Tester la vérification de livraison

```bash
curl -X POST http://localhost:3000/api/delivery/check \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "ID_DU_RESTAURANT",
    "customerAddress": "45 Boulevard Longchamp",
    "customerCity": "Marseille"
  }'
```

Réponse attendue :
```json
{
  "isDeliverable": true,
  "distanceKm": 2.3,
  "durationMin": 8,
  "estimatedDeliveryMin": 38,
  "customerAddressFormatted": "45 Boulevard Longchamp, 13001 Marseille, France"
}
```

---

## 6. Lancer le SIP Service (téléphonie)

```bash
cd ../sip-service

# Installer les dépendances Python
pip install -r requirements.txt --break-system-packages

# Copier le .env depuis la racine
ln -s ../.env .env

# Lancer
python main.py
```

⚠️ **Prérequis** : pjsua2 doit être compilé et installable en Python. Voir le [README du SIP service](sip-service/README.md).

---

## 7. Setup VPS (production)

### coturn (NAT traversal)

```bash
# Sur le VPS
sudo bash infra/setup_coturn.sh
```

Ajouter les credentials affichés dans `.env` :
```env
TURN_SERVER=IP_DU_VPS:3478
TURN_USERNAME=voiceorder
TURN_PASSWORD=xxxxx
```

### Firewall

```bash
sudo ufw allow 5060/udp      # SIP
sudo ufw allow 3478/tcp      # TURN
sudo ufw allow 3478/udp      # STUN
sudo ufw allow 10000:20000/udp   # RTP
sudo ufw allow 49152:65535/udp   # TURN relay
sudo ufw allow 3000/tcp      # Next.js (ou 80/443 avec reverse proxy)
```

### Process manager

```bash
# Installer pm2
npm install -g pm2

# Lancer le dashboard
cd web && pm2 start npm --name "voiceorder-web" -- start

# Lancer le SIP service
cd ../sip-service && pm2 start python --name "voiceorder-sip" -- main.py

# Sauvegarder pour redémarrage auto
pm2 save && pm2 startup
```

---

## 8. Première démo chez un restaurant

### Checklist matériel

- [ ] Grandstream HT841
- [ ] 2x câbles RJ11 (1 fourni, 1 de spare)
- [ ] 1x câble Ethernet
- [ ] Routeur 4G de backup (si WiFi restaurant instable)
- [ ] Laptop pour monitorer

### Checklist logiciel

- [ ] VPS en ligne avec coturn + PJSIP + Next.js
- [ ] Restaurant créé en BDD avec menu complet
- [ ] Phone line configurée (numéro → restaurant)
- [ ] HT841 pré-configuré avec les credentials SIP
- [ ] Test d'appel réussi depuis votre mobile

### Sur place

1. Débrancher le téléphone de la prise murale
2. Brancher la prise murale → FXO du HT841
3. Brancher le téléphone → FXS du HT841 (backup)
4. Brancher le HT841 au réseau (Ethernet ou 4G)
5. Attendre 30 secondes (enregistrement SIP)
6. Appeler le numéro du restaurant depuis votre mobile
7. L'IA doit répondre → passer une commande test
8. Vérifier que la commande apparaît sur le dashboard

---

## Résumé des commandes

```bash
# === INSTALLATION ===
cp .env.example .env              # puis éditer
cd web && npm install             # installer deps web
npx ts-node src/db/sync.ts       # créer BDD
npm run dev                       # lancer dashboard

# === SIP SERVICE ===
cd sip-service
pip install -r requirements.txt --break-system-packages
python main.py

# === VPS ===
sudo bash infra/setup_coturn.sh   # installer coturn
pm2 start npm --name web -- start # lancer en prod
pm2 start python --name sip -- main.py
```
