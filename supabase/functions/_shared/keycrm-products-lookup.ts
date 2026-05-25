// Dynamic replacement for the old static `keycrm-product-map.ts`.
// Reconciles `products.keycrm_id` by matching KeyCRM `products.sku` to our
// `products.id` (our edge function `sync-products-to-keycrm` writes our UUID
// into KeyCRM's `sku` field on import). Called from the stock-sync cron so the
// mapping self-heals as the catalog evolves.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { KeycrmProduct } from "./keycrm-stock.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReconcileResult {
  scanned: number;
  candidates: number;
  updated: number;
}

export async function reconcileKeycrmIds(
  admin: SupabaseClient,
  keycrmMap: Map<number, KeycrmProduct>,
): Promise<ReconcileResult> {
  // Build a UUID → KeyCRM id lookup from the KeyCRM catalog.
  // Only SKUs that look like UUIDs are considered — anything else is a legacy
  // KeyCRM-owned SKU that must already be cached via backfill.
  const skuToKid = new Map<string, number>();
  for (const kp of keycrmMap.values()) {
    const sku = (kp.sku || "").trim().toLowerCase();
    if (sku && UUID_RE.test(sku)) skuToKid.set(sku, kp.id);
  }
  if (skuToKid.size === 0) {
    return { scanned: keycrmMap.size, candidates: 0, updated: 0 };
  }

  const ids = Array.from(skuToKid.keys());
  const { data: rows, error } = await admin
    .from("products")
    .select("id, keycrm_id")
    .in("id", ids);
  if (error) throw new Error(`reconcileKeycrmIds select failed: ${error.message}`);

  let updated = 0;
  for (const row of rows ?? []) {
    const target = skuToKid.get(row.id);
    if (target && row.keycrm_id !== target) {
      const { error: upErr } = await admin
        .from("products")
        .update({ keycrm_id: target })
        .eq("id", row.id);
      if (!upErr) updated++;
      else console.warn(`reconcileKeycrmIds: ${row.id} → ${target} failed:`, upErr.message);
    }
  }

  return { scanned: keycrmMap.size, candidates: rows?.length ?? 0, updated };
}
