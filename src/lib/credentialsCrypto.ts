import crypto from "crypto";

// AES-256-GCM encryption for the Passwords vault (Operations > Passwords).
// The key never leaves the server; passwords are decrypted only on an
// explicit "reveal" request for one entry at a time, never in a list fetch.
const KEY = process.env.CREDENTIALS_ENCRYPTION_KEY
  ? Buffer.from(process.env.CREDENTIALS_ENCRYPTION_KEY, "base64")
  : null;

export function canEncrypt() {
  return !!KEY && KEY.length === 32;
}

// Stored as base64(iv):base64(authTag):base64(ciphertext).
export function encryptPassword(plain: string): string {
  if (!KEY) throw new Error("CREDENTIALS_ENCRYPTION_KEY not configured");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map(b => b.toString("base64")).join(":");
}

export function decryptPassword(stored: string): string {
  if (!KEY) throw new Error("CREDENTIALS_ENCRYPTION_KEY not configured");
  const [ivB64, tagB64, ctB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
