import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits

function getMasterKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY manquant ou invalide (attendu : 64 caractères hex = 32 octets)"
    );
  }
  return Buffer.from(hex, "hex");
}

function deriveKey(phoneLineId: string): Buffer {
  return crypto.pbkdf2Sync(
    getMasterKey(),
    phoneLineId,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    "sha256"
  );
}

/**
 * Chiffre un mot de passe SIP avec AES-256-GCM.
 * Clé dérivée du master key + phoneLineId (salt).
 * Format de sortie : iv:authTag:ciphertext (base64)
 */
export function encryptSipPassword(
  password: string,
  phoneLineId: string
): string {
  const key = deriveKey(phoneLineId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Déchiffre un mot de passe SIP chiffré avec encryptSipPassword().
 */
export function decryptSipPassword(
  encrypted: string,
  phoneLineId: string
): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Format de mot de passe chiffré invalide (attendu iv:tag:ciphertext)");
  }

  const [ivB64, tagB64, ciphertextB64] = parts;
  const key = deriveKey(phoneLineId);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return (
    decipher.update(Buffer.from(ciphertextB64, "base64"), undefined, "utf8") +
    decipher.final("utf8")
  );
}

/**
 * Vérifie si une chaîne ressemble à un mot de passe déjà chiffré (format iv:tag:ciphertext).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  try {
    Buffer.from(parts[0], "base64");
    Buffer.from(parts[1], "base64");
    Buffer.from(parts[2], "base64");
    return true;
  } catch {
    return false;
  }
}
