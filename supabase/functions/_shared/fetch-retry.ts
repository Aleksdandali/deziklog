/**
 * Resilient fetch for all KeyCRM / Nova Poshta calls in edge functions.
 *
 * - AbortController timeout per attempt (default 8s) — previously most KeyCRM/NP
 *   fetches had NO timeout, so a hung connection could stall an invocation until
 *   the platform killed it (the root cause of the order-sync duplicate window).
 * - Retries on transient failures: network/abort errors, HTTP 429, HTTP 5xx,
 *   with exponential backoff + jitter. Honors `Retry-After` on 429/503.
 * - Does NOT retry other 4xx (400/401/403/404/422) — those are permanent.
 * - Returns the final Response (ok or not); throws only if every attempt threw
 *   (network/abort) — same surface as a bare fetch on the last attempt.
 *
 * IMPORTANT: non-idempotent POSTs (KeyCRM order create, NP InternetDocument.save)
 * must be called with `retries: 0` — they get the timeout but are NEVER retried,
 * because a retry could create a duplicate order/shipping label.
 *
 * Jitter uses Math.random(): non-cryptographic randomness is correct for
 * spreading retry timing in the Deno edge runtime.
 */

export interface FetchRetryOptions {
  /** Per-attempt timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Additional attempts after the first (default 2 → 3 total). Use 0 for non-idempotent POSTs. */
  retries?: number;
  /** Backoff base in ms (default 300). */
  baseDelayMs?: number;
  /** Backoff cap in ms (default 5000). */
  maxDelayMs?: number;
  /** Override the default "should retry on this response" predicate. */
  retryOn?: (res: Response) => boolean;
  /** Label for logging context, e.g. "keycrm:order". */
  label?: string;
}

const RETRYABLE_STATUS = (res: Response) => res.status === 429 || (res.status >= 500 && res.status <= 599);

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 8000,
    retries = 2,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    retryOn = RETRYABLE_STATUS,
    label = "fetch",
  } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (attempt < retries && retryOn(res)) {
        await sleep(backoffDelay(res, attempt, baseDelayMs, maxDelayMs));
        continue;
      }
      return res; // ok, non-retryable 4xx, or out of retries
    } catch (e) {
      clearTimeout(timer);
      lastErr = e; // network error / timeout abort
      if (attempt < retries) {
        await sleep(jitter(baseDelayMs * 2 ** attempt, maxDelayMs));
        continue;
      }
      console.warn(`[fetchWithRetry:${label}] gave up after ${attempt + 1} attempt(s):`, (e as Error).message);
      throw e;
    }
  }
  throw lastErr;
}

function backoffDelay(res: Response, attempt: number, base: number, max: number): number {
  const ra = res.headers.get("Retry-After");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, max);
    const date = Date.parse(ra);
    if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), max);
  }
  return jitter(base * 2 ** attempt, max);
}

function jitter(target: number, max: number): number {
  return Math.min(target, max) * (0.5 + Math.random() * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
