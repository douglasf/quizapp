/**
 * Simple nanoid-style ID generation using Web Crypto API.
 *
 * Uses the same URL-safe alphabet as the `nanoid` package.
 * Workers-compatible — no Node.js crypto needed.
 */

const URL_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/**
 * Generate a cryptographically random ID.
 *
 * @param size – Length of the generated ID (default: 21).
 * @returns A random string of the specified length.
 */
export function nanoid(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = "";
  for (let i = 0; i < size; i++) {
    id += URL_ALPHABET[bytes[i] & 63];
  }
  return id;
}
