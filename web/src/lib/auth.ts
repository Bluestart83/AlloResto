import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";

// ── SMTP transporter ────────────────────────────────────────
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || "noreply@voiceorder.ai";

const transporter =
  smtpHost && smtpUser
    ? nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })
    : null;

async function sendEmail(to: string, subject: string, html: string) {
  if (!transporter) {
    console.warn("[AUTH] SMTP non configuré — email non envoyé:", { to, subject });
    return;
  }
  await transporter.sendMail({ from: smtpFrom, to, subject, html });
}

// ── Better Auth config ──────────────────────────────────────
export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ],
  database: new Database(process.env.DATABASE_URL || "./database.db"),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail(
        user.email,
        "Réinitialisation de votre mot de passe — VoiceOrder AI",
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5">VoiceOrder AI</h2>
          <p>Bonjour ${user.name || ""},</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
          <p>
            <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
              Réinitialiser mon mot de passe
            </a>
          </p>
          <p style="color:#6b7280;font-size:0.85rem">Ce lien expire dans 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
        </div>
        `,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail(
        user.email,
        "Vérifiez votre adresse email — VoiceOrder AI",
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#4f46e5">VoiceOrder AI</h2>
          <p>Bonjour ${user.name || ""},</p>
          <p>Merci pour votre inscription ! Veuillez vérifier votre adresse email.</p>
          <p>
            <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
              Vérifier mon email
            </a>
          </p>
          <p style="color:#6b7280;font-size:0.85rem">Ce lien expire dans 1 heure. Si vous n'avez pas créé de compte, ignorez cet email.</p>
        </div>
        `,
      );
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/request-password-reset": {
        window: 3600,
        max: 1,
      },
      "/sign-in/email": {
        window: 10,
        max: 3,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  user: {
    additionalFields: {
      restaurantId: {
        type: "string",
        required: false,
        defaultValue: null,
        input: true,
        fieldName: "restaurant_id",
      },
    },
  },
  plugins: [
    admin(),
    nextCookies(),
  ],
});
