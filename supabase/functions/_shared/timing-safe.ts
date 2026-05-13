/**
 * Constant-time string equality for secret comparison.
 *
 * Prevents timing attacks where an attacker measures response time to
 * probe one byte at a time. Always iterates over the longer string so
 * timing does not depend on the index of the first mismatching byte.
 *
 * Note: length difference itself remains observable. Acceptable for
 * fixed-length secrets (CRON_SECRET, KEYCRM_WEBHOOK_SECRET).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
