// Cron-driven: pull current stock availability from KeyCRM and update
// `products.in_stock` for every row with a cached keycrm_id. Also self-heals
// the products.keycrm_id mapping by matching KeyCRM `sku == our UUID`.
// Runs every 5 hours.
//
// Core logic lives in _shared/keycrm-stock.ts and is also reused by
// `refresh-stock` (user-triggered) and `sync-order-to-keycrm` (post-order).
//
// Auth: `x-cron-secret` header matching CRON_SECRET env.
// Modes:
//   GET  ?probe=1   → returns raw first-page KeyCRM /products response.
//   GET  ?dry_run=1 → returns the would-be in_stock changes, no writes.
//   POST (default)  → applies updates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { fetchAllKeycrmProducts, syncStockToDb } from "../_shared/keycrm-stock.ts";
import { reconcileKeycrmIds } from "../_shared/keycrm-products-lookup.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !expectedSecret || !timingSafeEqual(cronSecret, expectedSecret)) {
    return jsonRes({ error: "Unauthorized" }, 403);
  }

  const keycrmKey = Deno.env.get("KEYCRM_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keycrmKey || !supabaseUrl || !serviceRoleKey) {
    return jsonRes({ error: "Server misconfigured" }, 500);
  }

  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const dryRun = url.searchParams.get("dry_run") === "1";

  if (probe) {
    const [rp, ro] = await Promise.all([
      fetch(`${KEYCRM_API_URL}/products?limit=3`, {
        headers: { Authorization: `Bearer ${keycrmKey}`, Accept: "application/json" },
      }),
      fetch(`${KEYCRM_API_URL}/offers?limit=3`, {
        headers: { Authorization: `Bearer ${keycrmKey}`, Accept: "application/json" },
      }),
    ]);
    const [jp, jo] = await Promise.all([
      rp.json().catch(() => null),
      ro.json().catch(() => null),
    ]);
    return jsonRes({
      probe: true,
      products: { status: rp.status, body: jp },
      offers: { status: ro.status, body: jo },
    });
  }

  try {
    const keycrmMap = await fetchAllKeycrmProducts(keycrmKey);
    const admin = createClient(supabaseUrl, serviceRoleKey);
    // Self-heal the products.keycrm_id mapping (UUID-sku → KeyCRM id) before
    // running stock sync. Skipped during dry_run to keep that mode read-only.
    const reconcile = dryRun ? null : await reconcileKeycrmIds(admin, keycrmMap);
    const result = await syncStockToDb(admin, keycrmMap, undefined, dryRun);
    return jsonRes({ done: true, dry_run: dryRun, reconcile, ...result });
  } catch (e) {
    return jsonRes({ error: "Sync failed", details: (e as Error).message }, 502);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
