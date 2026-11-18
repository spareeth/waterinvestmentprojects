import { createHash, randomBytes } from "node:crypto";

// Upload link tokens (M0). Pure. 32 random bytes, URL-safe: unguessable, shown once to the admin, and only the
// SHA-256 is stored (like invitation tokens).

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateUploadToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUploadToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** True for strings that could be a token (43 base64url characters); anything else is refused unseen. */
export function isWellFormedUploadToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
