# Configuration Google OAuth & SMTP

## 1. Creer un projet Google Cloud

1. Aller sur https://console.cloud.google.com
2. Creer un nouveau projet (ou selectionner un existant)
3. Activer l'API **Google+ API** ou **Google Identity** (People API)

## 2. Configurer l'ecran de consentement OAuth

1. Menu > **APIs & Services** > **OAuth consent screen**
2. Choisir **External** (ou Internal si Google Workspace)
3. Remplir :
   - App name : `VoiceOrder AI`
   - User support email : ton email
   - Authorized domains : `voiceorder.ai` (prod) ou laisser vide (dev)
   - Developer contact : ton email
4. Scopes : ajouter `email`, `profile`, `openid`
5. Test users : ajouter ton email Google (tant que l'app est en mode "Testing")

## 3. Creer les credentials OAuth 2.0

1. Menu > **APIs & Services** > **Credentials**
2. **+ Create Credentials** > **OAuth client ID**
3. Type : **Web application**
4. Name : `VoiceOrder Web`
5. **Authorized redirect URIs** :
   - Dev : `http://localhost:3000/api/auth/callback/google`
   - Prod : `https://votre-domaine.com/api/auth/callback/google`
6. Cliquer **Create**
7. Copier le **Client ID** et le **Client Secret**

## 4. Configurer les variables d'environnement

Dans `web/.env.local`, decommenter et remplir :

```
GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

## 5. Tester

1. Lancer `npm run dev`
2. Aller sur `/login`
3. Cliquer "Se connecter avec Google"
4. Autoriser l'acces sur l'ecran de consentement Google
5. Redirection vers l'app avec session active

## Notes

- En mode "Testing" sur Google Cloud, seuls les emails ajoutes en test users peuvent se connecter
- Pour passer en production, il faut soumettre l'app a verification Google (peut prendre quelques jours)
- Le callback URL `/api/auth/callback/google` est gere automatiquement par Better Auth via le catch-all route handler `api/auth/[...all]`
- Les utilisateurs Google sont crees automatiquement dans la table `user` avec `emailVerified = true`
- Pour qu'un user Google ait le role admin, il faut le modifier en base : `UPDATE user SET role = 'admin' WHERE email = 'xxx@gmail.com'`

---

# Configuration SMTP

Le SMTP est utilise pour :
- Emails de reinitialisation de mot de passe
- Emails de verification de compte

## 1. Choisir un fournisseur SMTP

Quelques options :

| Fournisseur | Gratuit | Notes |
|------------|---------|-------|
| **Gmail** | 500/jour | Necessite "App Password" (2FA active) |
| **Brevo (ex-Sendinblue)** | 300/jour | Recommande, simple a configurer |
| **Mailgun** | 100/jour (trial) | Bon pour prod |
| **Amazon SES** | 62k/mois (si EC2) | Le moins cher en volume |
| **Resend** | 100/jour | API moderne, simple |

## 2. Configuration Gmail (dev rapide)

1. Activer la verification en 2 etapes sur ton compte Google
2. Aller sur https://myaccount.google.com/apppasswords
3. Creer un mot de passe d'application (nom: "VoiceOrder SMTP")
4. Copier le mot de passe genere (16 caracteres)

## 3. Variables d'environnement

Dans `web/.env.local`, decommenter et remplir :

```
# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ton.email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=ton.email@gmail.com

# Brevo
# SMTP_HOST=smtp-relay.brevo.com
# SMTP_PORT=587
# SMTP_USER=ton.email@brevo.com
# SMTP_PASS=xsmtpsib-xxxxx

# Mailgun
# SMTP_HOST=smtp.mailgun.org
# SMTP_PORT=587
# SMTP_USER=postmaster@sandbox.mailgun.org
# SMTP_PASS=xxxxx
# SMTP_FROM=noreply@voiceorder.ai
```

## 4. Tester

1. Lancer `npm run dev`
2. Aller sur `/login/forgot`
3. Entrer un email existant et soumettre
4. Verifier dans la console : si SMTP est configure, l'email part ; sinon le warning `[AUTH] SMTP non configure` apparait
5. Verifier la boite de reception (ou les spams)

## 5. Production

- Utiliser un domaine verifie (SPF, DKIM, DMARC) pour eviter les spams
- Ne pas utiliser Gmail en prod (limites + risque de blocage)
- Brevo ou Amazon SES sont recommandes pour la prod
- Le `SMTP_FROM` doit correspondre au domaine verifie
