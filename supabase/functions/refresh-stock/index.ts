// User-triggered stock refresh. Any authenticated user can call this to
// pull fresh availability from KeyCRM (pull-to-refresh / on-focus in the
// catalog screen). Throttled in-memory to one KeyCRM fetch per COOLDOWN_MS
// across all callers — protects the KeyCRM API rate limit and avoids
// hammering. Within the cooldown, calls return immediately with
// `throttled: true` (the client can still re-read the products table to
// pick up whatever the last refresh wrote).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchAllKeycrmProducts, syncStockToDb } from "../_shared/keycrm-stock.ts";

const COOLDOWN_MS = 30_000;

// Module-level state survives within a warm Deno isolate. Cold starts reset
// it (acceptable — at most one extra fetch per cold instance).
let lastSyncAt = 0;
let inflight: Promise<unknown> | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const keycrmKey = Deno.env.get("KEYCRM_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !keycrmKey) {
    return jsonRes({ error: "Server misconfigured" }, 500);
  }

  // Verify JWT — any authed user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonRes({ error: "Unauthorized" }, 401);

  const now = Date.now();
  const sinceLast = now - lastSyncAt;

  // Within cooldown — short-circuit
  if (sinceLast < COOLDOWN_MS && !inflight) {
    return jsonRes({ throttled: true, cooldown_remaining_ms: COOLDOWN_MS - sinceLast });
  }

  // Coalesce concurrent callers onto the in-flight fetch
  if (inflight) {
    try { await inflight; } catch { /* result returned by leader */ }
    return jsonRes({ coalesced: true });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  inflight = (async () => {
    const keycrmMap = await fetchAllKeycrmProducts(keycrmKey);
    return await syncStockToDb(admin, keycrmMap);
  })();

  try {
    const result = await inflight;
    lastSyncAt = Date.now();
    return jsonRes({ done: true, ...(result as object) });
  } catch (e) {
    return jsonRes({ error: "Sync failed", details: (e as Error).message }, 502);
  } finally {
    inflight = null;
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
