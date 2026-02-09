/**
 * Password hashing using Web Crypto API PBKDF2.
 *
 * Cloudflare Workers compatible — no Node.js crypto or WASM needed.
 *
 * Format: `pbkdf2:iterations:base64salt:base64hash`
 */

const ITERATIONS = 100_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

/**
 * Hash a password using PBKDF2-SHA256.
 *
 * @returns A string in the format `pbkdf2:100000:<base64salt>:<base64hash>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8,
  );

  const saltB64 = arrayBufferToBase64(salt);
  const hashB64 = arrayBufferToBase64(new Uint8Array(derivedBits));

  return `pbkdf2:${ITERATIONS}:${saltB64}:${hashB64}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = Number.parseInt(parts[1], 10);
  const salt = base64ToUint8Array(parts[2]);
  const expectedHash = base64ToUint8Array(parts[3]);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    expectedHash.length * 8,
  );

  const derivedHash = new Uint8Array(derivedBits);

  // Constant-time comparison
  return timingSafeEqual(derivedHash, expectedHash);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Constant-time comparison of two byte arrays.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
