// CORS headers for edge functions.
//
// Mobile clients (React Native) use native HTTP and don't enforce CORS, so
// the secure default is to send NO Access-Control-Allow-Origin header at all.
// This blocks arbitrary browser origins from calling our edge functions on
// behalf of an authenticated victim (CSRF-like with stolen JWT).
//
// To allow a real browser client (e.g. future admin panel), set the
// CORS_ORIGIN env to that exact origin, for example:
//   CORS_ORIGIN=https://admin.dezik.com.ua
// Wildcard "*" is honoured for explicit opt-in but should be avoided.

const ORIGIN = (Deno.env.get("CORS_ORIGIN") ?? "").trim();

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-webhook-secret",
  ...(ORIGIN
    ? {
        "Access-Control-Allow-Origin": ORIGIN,
        ...(ORIGIN === "*" ? {} : { Vary: "Origin" }),
      }
    : {}),
};
