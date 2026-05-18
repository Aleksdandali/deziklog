// Cron-driven: pull current stock availability from KeyCRM and update
// `products.in_stock` for every row in KEYCRM_ID_MAP. Runs every 5 hours.
//
// KeyCRM is the source of truth for availability for mapped products.
// Unmapped products (not in KEYCRM_ID_MAP) are NOT touched — their `in_stock`
// continues to be managed manually in DB.
//
// Auth: `x-cron-secret` header matching CRON_SECRET env.
// Modes:
//   GET  ?probe=1   → returns raw first-page KeyCRM /products response so an
//                     operator can verify which field holds quantity.
//   GET  ?dry_run=1 → returns the would-be in_stock changes, no writes.
//   POST (default)  → applies updates.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { KEYCRM_ID_MAP } from "../_shared/keycrm-product-map.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

interface KeycrmProduct {
  id: number;
  sku?: string | null;
  name?: string;
  quantity?: number | null;
  in_reserve?: number | null;
  has_offers?: boolean;
}

/**
 * Available quantity at the product level. All our mapped products are simple
 * SKUs (has_offers: false); product.quantity − in_reserve is the truth.
 * If KeyCRM ever returns has_offers: true for a mapped row, we skip it
 * (status: "has_offers_unsupported") — variant stock would need a separate
 * /offers fetch which we don't do yet.
 */
function availableQty(p: KeycrmProduct): number | null {
  if (typeof p.quantity !== "number") return null;
  return p.quantity - (typeof p.in_reserve === "number" ? p.in_reserve : 0);
}

async function fetchAllKeycrmProducts(apiKey: string): Promise<Map<number, KeycrmProduct>> {
  const byId = new Map<number, KeycrmProduct>();
  let page = 1;
  const limit = 50;
  while (true) {
    const url = `${KEYCRM_API_URL}/products?limit=${limit}&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`KeyCRM HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const list: KeycrmProduct[] = json?.data ?? [];
    for (const p of list) byId.set(p.id, p);
    const lastPage = json?.last_page ?? json?.meta?.last_page ?? 1;
    if (page >= lastPage || list.length === 0) break;
    page++;
    if (page > 20) break; // safety cap
  }
  return byId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || !expectedSecret || !timingSafeEqual(cronSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keycrmKey = Deno.env.get("KEYCRM_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!keycrmKey || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const dryRun = url.searchParams.get("dry_run") === "1";

  // PROBE: dump first page of /products AND /offers raw so operator can see
  // which fields hold the stock quantity.
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
    return new Response(JSON.stringify({
      probe: true,
      products: { status: rp.status, body: jp },
      offers: { status: ro.status, body: jo },
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let keycrmMap: Map<number, KeycrmProduct>;
  try {
    keycrmMap = await fetchAllKeycrmProducts(keycrmKey);
  } catch (e) {
    return new Response(JSON.stringify({ error: "KeyCRM fetch failed", details: (e as Error).message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const mappedIds = Object.keys(KEYCRM_ID_MAP);

  const { data: rows, error: selErr } = await admin
    .from("products")
    .select("id,name,in_stock")
    .in("id", mappedIds);
  if (selErr) {
    return new Response(JSON.stringify({ error: "DB select failed", details: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  type Outcome =
    | { id: string; name: string; status: "no_keycrm" }
    | { id: string; name: string; status: "no_quantity_field" }
    | { id: string; name: string; status: "has_offers_unsupported" }
    | { id: string; name: string; status: "unchanged"; qty: number; in_stock: boolean }
    | { id: string; name: string; status: "would_update" | "updated"; qty: number; from: boolean; to: boolean }
    | { id: string; name: string; status: "update_failed"; message: string };

  const results: Outcome[] = [];

  for (const row of rows ?? []) {
    const kid = KEYCRM_ID_MAP[row.id];
    const kp = keycrmMap.get(kid);
    if (!kp) {
      results.push({ id: row.id, name: row.name, status: "no_keycrm" });
      continue;
    }
    if (kp.has_offers) {
      results.push({ id: row.id, name: row.name, status: "has_offers_unsupported" });
      continue;
    }
    const qty = availableQty(kp);
    if (qty === null) {
      results.push({ id: row.id, name: row.name, status: "no_quantity_field" });
      continue;
    }
    const target = qty > 0;
    if (target === row.in_stock) {
      results.push({ id: row.id, name: row.name, status: "unchanged", qty, in_stock: row.in_stock });
      continue;
    }
    if (dryRun) {
      results.push({ id: row.id, name: row.name, status: "would_update", qty, from: row.in_stock, to: target });
      continue;
    }
    const { error: updErr } = await admin
      .from("products")
      .update({ in_stock: target })
      .eq("id", row.id);
    if (updErr) {
      results.push({ id: row.id, name: row.name, status: "update_failed", message: updErr.message });
      continue;
    }
    results.push({ id: row.id, name: row.name, status: "updated", qty, from: row.in_stock, to: target });
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return new Response(
    JSON.stringify({
      done: true,
      dry_run: dryRun,
      mapped_rows: rows?.length ?? 0,
      keycrm_total: keycrmMap.size,
      summary,
      results,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
