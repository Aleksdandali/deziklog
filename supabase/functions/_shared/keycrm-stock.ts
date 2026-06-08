// Pure stock-sync core: fetch availability from KeyCRM and reconcile
// products.in_stock. Shared by:
//   - sync-keycrm-stock (cron, all mapped products)
//   - refresh-stock     (user-triggered, all mapped products, throttled)
//   - sync-order-to-keycrm (post-order, ordered product_ids only)
//
// Only writes when the boolean value actually changes — safe to call often.
//
// The mapping our_product.id → KeyCRM numeric id lives on `products.keycrm_id`
// (filled by reconcileKeycrmIds; see _shared/keycrm-products-lookup.ts).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchWithRetry } from "./fetch-retry.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const MAX_PAGES = 20;

export interface KeycrmProduct {
  id: number;
  sku?: string | null;
  name?: string;
  quantity?: number | null;
  in_reserve?: number | null;
  has_offers?: boolean;
  // Image fields (used by restore-product-images; KeyCRM returns them on /products).
  thumbnail_url?: string | null;
  attachments_data?: string[];
}

export type StockOutcome =
  | { id: string; name: string; status: "no_keycrm" }
  | { id: string; name: string; status: "no_quantity_field" }
  | { id: string; name: string; status: "has_offers_unsupported" }
  | { id: string; name: string; status: "unchanged"; qty: number; in_stock: boolean }
  | { id: string; name: string; status: "would_update" | "updated"; qty: number; from: boolean; to: boolean }
  | { id: string; name: string; status: "update_failed"; message: string };

export interface SyncStockResult {
  mapped_rows: number;
  keycrm_total: number;
  summary: Record<string, number>;
  results: StockOutcome[];
}

/**
 * Available quantity at product level. All mapped products are simple SKUs
 * (has_offers: false); offers/variants are skipped explicitly.
 */
function availableQty(p: KeycrmProduct): number | null {
  if (typeof p.quantity !== "number") return null;
  return p.quantity - (typeof p.in_reserve === "number" ? p.in_reserve : 0);
}

export async function fetchAllKeycrmProducts(apiKey: string): Promise<Map<number, KeycrmProduct>> {
  const byId = new Map<number, KeycrmProduct>();
  let page = 1;
  const limit = 50;
  while (true) {
    const url = `${KEYCRM_API_URL}/products?limit=${limit}&page=${page}`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    }, { timeoutMs: 8000, retries: 2, label: "keycrm:products-page" });
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
    if (page > MAX_PAGES) {
      // L3: don't silently truncate the catalog — surface that the cap was hit
      // so a growing catalog (>1000 products) is noticed instead of half-synced.
      console.error(`[keycrm-stock] page cap ${MAX_PAGES} reached (last_page=${lastPage}); catalog truncated — raise MAX_PAGES.`);
      break;
    }
  }
  return byId;
}

/**
 * Reconcile `products.in_stock` against KeyCRM availability.
 * If `productIds` is provided, only those rows (intersected with rows that
 * have a cached keycrm_id) are touched. Otherwise all mapped products are processed.
 */
export async function syncStockToDb(
  admin: SupabaseClient,
  keycrmMap: Map<number, KeycrmProduct>,
  productIds?: string[],
  dryRun = false,
): Promise<SyncStockResult> {
  let query = admin
    .from("products")
    .select("id,name,in_stock,keycrm_id")
    .not("keycrm_id", "is", null);
  if (productIds && productIds.length > 0) {
    query = query.in("id", productIds);
  }
  const { data: rows, error: selErr } = await query;
  if (selErr) throw new Error(`DB select failed: ${selErr.message}`);

  const results: StockOutcome[] = [];

  for (const row of rows ?? []) {
    const kid = row.keycrm_id as number | null;
    const kp = kid ? keycrmMap.get(kid) : undefined;
    if (!kp) { results.push({ id: row.id, name: row.name, status: "no_keycrm" }); continue; }
    if (kp.has_offers) { results.push({ id: row.id, name: row.name, status: "has_offers_unsupported" }); continue; }
    const qty = availableQty(kp);
    if (qty === null) { results.push({ id: row.id, name: row.name, status: "no_quantity_field" }); continue; }
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

  return { mapped_rows: rows?.length ?? 0, keycrm_total: keycrmMap.size, summary, results };
}
