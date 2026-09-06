import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const secret = createHash("sha256")
  .update(process.env.SESSION_SECRET ?? "development-session-secret")
  .digest();

export function encryptPartnerPortalPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, secret, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function hasPartnerPortalPassword(value: string | null): boolean {
  return Boolean(value);
}

export function decryptPartnerPortalPassword(value: string): string {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Invalid encrypted portal password");
  const decipher = createDecipheriv(algorithm, secret, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}