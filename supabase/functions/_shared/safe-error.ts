// Generic error responder for edge functions.
//
// Raw error messages from Postgres / GoTrue / external APIs leak schema
// details, constraint names, and provider internals to any caller. Log the
// full (PII-redacted) error server-side under a short correlation ref, and
// return only a generic message + the ref so support can match user reports
// to function logs.

import { redact } from "./redact.ts";

export function safeError(
  label: string,
  err: unknown,
  publicMessage = "Internal error",
): { error: string; ref: string } {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(
    `[${label}] ref=${ref}`,
    redact(err instanceof Error ? err.message : err),
  );
  return { error: publicMessage, ref };
}
