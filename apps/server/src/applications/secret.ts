import { hashPassword, verifyPassword } from "better-auth/crypto";

/**
 * Application secrets.
 *
 * The plaintext is shown exactly once (on create / regenerate) and only the
 * scrypt hash is stored, so a database read cannot recover it. Secrets carry a
 * recognisable prefix so they are easy to spot in config and in leaks.
 */
export const SECRET_PREFIX = "au1h_sk_";

// Better Auth's hasher stores `salt:hexKey`, both hex.
const HASHED_SHAPE = /^[0-9a-f]+:[0-9a-f]+$/i;

export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return SECRET_PREFIX + Buffer.from(bytes).toString("base64url");
}

/** scrypt hash (Better Auth's password hasher: salted, constant-time compare). */
export function hashSecret(secret: string): Promise<string> {
  return hashPassword(secret);
}

/** Is `hash` a value produced by `hashSecret`? (Legacy rows hold a raw UUID.) */
export function isHashedSecret(stored: string): boolean {
  return HASHED_SHAPE.test(stored);
}

export async function verifySecret(
  presented: string,
  stored: string
): Promise<boolean> {
  if (!(presented && stored)) {
    return false;
  }
  if (!isHashedSecret(stored)) {
    // A pre-hashing row: never accept it. The owner must regenerate the secret.
    return false;
  }
  return await verifyPassword({ password: presented, hash: stored });
}
