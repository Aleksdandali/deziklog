// One-off admin edge function: re-fetch product images from KeyCRM for products
// whose `image_path` still points at the dead dezik.com.ua host, upload them
// into the `product-images` bucket and update the row.
//
// Auth: requires `x-cron-secret` header matching CRON_SECRET env.
// Modes:
//   GET /restore-product-images?dry_run=1    → probes ONE broken product against
//                                              KeyCRM and returns the raw API
//                                              response (no writes).
//   POST /restore-product-images             → migrates ALL broken products.
//                                              Returns per-product status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { KEYCRM_ID_MAP } from "../_shared/keycrm-product-map.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const BUCKET = "product-images";

interface KeycrmProduct {
  id: number;
  sku: string | null;
  name: string;
  thumbnail_url?: string | null;
  attachments_data?: string[]; // plain URL strings
}

function extFromUrl(url: string, fallback = "jpg"): string {
  const clean = url.split("?")[0].toLowerCase();
  const m = clean.match(/\.(jpe?g|png|webp|gif)$/);
  if (!m) return fallback;
  return m[1] === "jpeg" ? "jpg" : m[1];
}

function contentTypeFromExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function fetchAllKeycrmProducts(apiKey: string): Promise<Map<number, KeycrmProduct>> {
  // Paginate full product list, key map by KeyCRM internal id.
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
    if (page > 20) break;
  }
  return byId;
}

function pickImageUrl(p: KeycrmProduct): string | null {
  if (p.thumbnail_url) return p.thumbnail_url;
  const fromAttachments = p.attachments_data?.find((u) => typeof u === "string" && u.length > 0);
  return fromAttachments ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth
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
  const dryRun = url.searchParams.get("dry_run") === "1";
  const probe = url.searchParams.get("probe") === "1";
  const listNames = url.searchParams.get("list_names") === "1";

  // PROBE: dump raw first page of KeyCRM products to inspect shape
  if (probe) {
    const r = await fetch(`${KEYCRM_API_URL}/products?limit=3`, {
      headers: { Authorization: `Bearer ${keycrmKey}`, Accept: "application/json" },
    });
    const j = await r.json().catch(() => null);
    return new Response(JSON.stringify({ probe: true, status: r.status, body: j }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // LIST_NAMES: dump all KeyCRM product names + thumbnails for mapping
  if (listNames) {
    const map = await fetchAllKeycrmProducts(keycrmKey);
    const items = Array.from(map.values()).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      thumbnail: pickImageUrl(p),
    }));
    return new Response(JSON.stringify({ list_names: true, total: items.length, items }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Find broken products (image_path still points to dezik.com.ua)
  const { data: broken, error: selErr } = await admin
    .from("products")
    .select("id,name,image_path")
    .like("image_path", "%dezik.com.ua%");

  if (selErr) {
    return new Response(JSON.stringify({ error: "DB select failed", details: selErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!broken || broken.length === 0) {
    return new Response(JSON.stringify({ done: true, message: "No broken products" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build KeyCRM id → product map (single fetch covers all rows)
  let keycrmMap: Map<number, KeycrmProduct>;
  try {
    keycrmMap = await fetchAllKeycrmProducts(keycrmKey);
  } catch (e) {
    return new Response(JSON.stringify({ error: "KeyCRM fetch failed", details: (e as Error).message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const resolveKp = (rowId: string): KeycrmProduct | null => {
    const kid = KEYCRM_ID_MAP[rowId];
    if (!kid) return null;
    return keycrmMap.get(kid) ?? null;
  };

  // DRY-RUN: show match status + picked URL for every broken row
  if (dryRun) {
    return new Response(
      JSON.stringify({
        dry_run: true,
        broken_count: broken.length,
        keycrm_total: keycrmMap.size,
        rows: broken.map((r) => {
          const kp = resolveKp(r.id);
          return {
            id: r.id,
            name: r.name,
            keycrm_id: KEYCRM_ID_MAP[r.id] ?? null,
            keycrm_name: kp?.name ?? null,
            picked_image_url: kp ? pickImageUrl(kp) : null,
          };
        }),
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // FULL RUN
  const results: Array<{
    id: string;
    name: string;
    status: "updated" | "no_keycrm" | "no_image" | "download_failed" | "upload_failed" | "update_failed";
    message?: string;
    new_image_path?: string;
  }> = [];

  for (const row of broken) {
    try {
      const kp = resolveKp(row.id);
      if (!kp) {
        results.push({ id: row.id, name: row.name, status: "no_keycrm" });
        continue;
      }
      const imgUrl = pickImageUrl(kp);
      if (!imgUrl) {
        results.push({ id: row.id, name: row.name, status: "no_image" });
        continue;
      }

      const dlRes = await fetch(imgUrl);
      if (!dlRes.ok) {
        results.push({
          id: row.id,
          name: row.name,
          status: "download_failed",
          message: `HTTP ${dlRes.status} from ${imgUrl}`,
        });
        continue;
      }
      const bytes = new Uint8Array(await dlRes.arrayBuffer());
      const ext = extFromUrl(imgUrl, "jpg");
      const filename = `${row.id}.${ext}`;
      const ct = contentTypeFromExt(ext);

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(filename, bytes, { contentType: ct, upsert: true });

      if (upErr) {
        results.push({
          id: row.id,
          name: row.name,
          status: "upload_failed",
          message: upErr.message,
        });
        continue;
      }

      const newPath = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
      const { error: updErr } = await admin
        .from("products")
        .update({ image_path: newPath })
        .eq("id", row.id);

      if (updErr) {
        results.push({
          id: row.id,
          name: row.name,
          status: "update_failed",
          message: updErr.message,
        });
        continue;
      }

      results.push({ id: row.id, name: row.name, status: "updated", new_image_path: newPath });
    } catch (e) {
      results.push({
        id: row.id,
        name: row.name,
        status: "download_failed",
        message: (e as Error).message,
      });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return new Response(
    JSON.stringify({ done: true, total: broken.length, summary, results }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
