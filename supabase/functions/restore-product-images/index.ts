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
import { reconcileKeycrmIds } from "../_shared/keycrm-products-lookup.ts";

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

// SSRF guard: KeyCRM is upstream-trusted, but a compromised admin or stale
// dataset could plant `http://169.254.169.254/...` (cloud metadata) or
// `http://10.x.x.x/...` (internal). Reject non-https and private/loopback hosts
// before we let the function fetch & upload arbitrary bytes into our bucket.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "" || h === "::" || h === "::1") return true;
  if (h.startsWith("[")) return isPrivateHost(h.slice(1, -1));
  // IPv4
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;        // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  // IPv6 broad strokes — link-local + ULA + loopback
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

function isSafeImageUrl(rawUrl: string): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "https:") return false;
  return !isPrivateHost(u.hostname);
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

  const admin = createClient(supabaseUrl, serviceRoleKey);

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

  // Self-heal products.keycrm_id from KeyCRM's catalog before we read it.
  // No-op in dry-run mode so the dry-run remains side-effect free.
  if (!dryRun) {
    try { await reconcileKeycrmIds(admin, keycrmMap); }
    catch (e) { console.warn("reconcileKeycrmIds failed:", (e as Error).message); }
  }

  // Find broken products (image_path still points to dezik.com.ua)
  const { data: broken, error: selErr } = await admin
    .from("products")
    .select("id,name,image_path,keycrm_id")
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

  const resolveKp = (row: { keycrm_id: number | null }): KeycrmProduct | null => {
    if (!row.keycrm_id) return null;
    return keycrmMap.get(row.keycrm_id) ?? null;
  };

  // DRY-RUN: show match status + picked URL for every broken row
  if (dryRun) {
    return new Response(
      JSON.stringify({
        dry_run: true,
        broken_count: broken.length,
        keycrm_total: keycrmMap.size,
        rows: broken.map((r) => {
          const kp = resolveKp(r);
          return {
            id: r.id,
            name: r.name,
            keycrm_id: r.keycrm_id ?? null,
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
      const kp = resolveKp(row);
      if (!kp) {
        results.push({ id: row.id, name: row.name, status: "no_keycrm" });
        continue;
      }
      const imgUrl = pickImageUrl(kp);
      if (!imgUrl) {
        results.push({ id: row.id, name: row.name, status: "no_image" });
        continue;
      }
      if (!isSafeImageUrl(imgUrl)) {
        results.push({
          id: row.id,
          name: row.name,
          status: "download_failed",
          message: `SSRF guard rejected URL: ${imgUrl}`,
        });
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
