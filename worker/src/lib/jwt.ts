/**
 * JWT sign/verify using the Web Crypto API (Cloudflare Workers compatible).
 *
 * Uses HMAC-SHA256 (HS256) for signing. No Node.js crypto required.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  // Restore standard base64 padding
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parse a duration string like "15m", "1h", "7d" into seconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid duration format: "${duration}"`);
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      throw new Error(`Unknown duration unit: "${unit}"`);
  }
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

/**
 * Sign a JWT with HS256.
 *
 * @param payload  – Claims to include (e.g. `{ sub: userId }`).
 * @param secret   – HMAC secret string.
 * @param expiresIn – Duration string like "15m", "1h", "7d".
 * @returns The signed JWT string.
 */
export async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    sub: payload.sub as string,
    iat: now,
    exp: now + parseDuration(expiresIn),
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verify a JWT signed with HS256.
 *
 * @param token  – The JWT string.
 * @param secret – HMAC secret string.
 * @returns The decoded payload.
 * @throws If the token is invalid or expired.
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT: expected 3 parts");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Verify signature
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await getHmacKey(secret);
  const signatureBytes = base64UrlDecode(encodedSignature);
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(signingInput));

  if (!valid) {
    throw new Error("Invalid JWT: signature verification failed");
  }

  // Decode payload
  const payloadBytes = base64UrlDecode(encodedPayload);
  const payload: JWTPayload = JSON.parse(new TextDecoder().decode(payloadBytes));

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("Invalid JWT: token has expired");
  }

  return payload;
}
