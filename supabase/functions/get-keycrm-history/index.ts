// Live-view of the buyer's KeyCRM order history.
// Used on the "Мої замовлення" → "Історія з KeyCRM" screen so masters who were
// onboarded *after* their KeyCRM record was created can still see legacy orders.
//
// Auth: requires user JWT.
// Strategy:
//   1. Resolve profile.keycrm_buyer_id; fall back to phone search if missing.
//   2. Fetch KeyCRM /order filtered by buyer with products + offer included.
//   3. Drop rows already mirrored in Supabase (orders.keycrm_order_id) so we
//      don't show duplicates next to the native list.
//   4. Return a normalized payload tailored for the mobile UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { redact } from "../_shared/redact.ts";
import { buyerPhones, phonesMatchE164 } from "../_shared/phone.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const TIMEOUT_MS = 8000;
const PAGE_LIMIT = 50;
/** Screen "Історія з KeyCRM" is typically opened a handful of times/day.
 *  Anything above this is abuse/loops — return empty silently. */
const DAILY_HISTORY_LIMIT = 60;

interface NormalizedItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  sum: number;
}

interface NormalizedOrder {
  keycrm_order_id: number;
  number: string;
  status: string | null;
  status_group: string | null;
  total: number;
  currency: string | null;
  created_at: string;
  items: NormalizedItem[];
  ttn: string | null;
  manager_comment: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "No auth header" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonRes({ error: "Unauthorized" }, 401);

    const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY");
    if (!KEYCRM_API_KEY) {
      // Misconfigured deploy — the screen will show "empty" rather than break.
      return jsonRes({ orders: [] });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Per-user daily cap (protects KeyCRM API quota from refresh-loop abuse).
    const { data: usageCount } = await adminClient
      .rpc("increment_keycrm_history_usage", { p_user_id: user.id });
    if (typeof usageCount === "number" && usageCount > DAILY_HISTORY_LIMIT) {
      return jsonRes({ orders: [] });
    }

    // 1. Resolve buyer_id.
    const { data: profile } = await adminClient
      .from("profiles")
      .select("keycrm_buyer_id")
      .eq("id", user.id)
      .maybeSingle();

    let buyerId = profile?.keycrm_buyer_id as number | null;

    if (!buyerId && user.phone) {
      buyerId = await findBuyerIdByPhone(user.phone, KEYCRM_API_KEY);
      if (buyerId) {
        await adminClient.from("profiles")
          .update({ keycrm_buyer_id: buyerId })
          .eq("id", user.id);
      }
    }

    if (!buyerId) return jsonRes({ orders: [] });

    // 2. Pull existing keycrm_order_id values to dedupe against the native list.
    const { data: synced } = await adminClient
      .from("orders")
      .select("keycrm_order_id")
      .eq("user_id", user.id)
      .not("keycrm_order_id", "is", null);
    const syncedIds = new Set<number>(
      (synced ?? []).map((r: { keycrm_order_id: number }) => r.keycrm_order_id),
    );

    // 3. Fetch from KeyCRM. buyer_id was verified by exact phone match (or came
    //    from the cached, already-verified profile.keycrm_buyer_id), so this is
    //    a safe GET to retry on transient 429/5xx.
    let raw: KeyCRMOrder[] = [];
    {
      const url =
        `${KEYCRM_API_URL}/order?filter[buyer_id]=${buyerId}` +
        `&include=products.offer,status` +
        `&sort=-created_at&limit=${PAGE_LIMIT}`;
      const res = await fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${KEYCRM_API_KEY}`,
          Accept: "application/json",
        },
      }, { timeoutMs: TIMEOUT_MS, retries: 2, label: "keycrm:history" });
      if (!res.ok) {
        console.warn("[get-keycrm-history] KeyCRM status:", res.status);
        return jsonRes({ orders: [] });
      }
      const data = await res.json();
      raw = Array.isArray(data?.data) ? data.data : [];
    }

    // 4. Normalize + dedupe.
    const normalized: NormalizedOrder[] = raw
      .filter((o) => typeof o?.id === "number" && !syncedIds.has(o.id))
      .map(normalize);

    return jsonRes({ orders: normalized });
  } catch (err) {
    console.warn("[get-keycrm-history] error:", redact((err as Error).message));
    return jsonRes({ orders: [] });
  }
});

async function findBuyerIdByPhone(rawPhone: string, apiKey: string): Promise<number | null> {
  const phoneE164 = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
  const digits = phoneE164.replace(/\D/g, "");
  // slice(2) national variant DROPPED (H5) — see phone.ts / sync-logic.
  const variants = Array.from(new Set([phoneE164, digits]));

  try {
    for (const v of variants) {
      if (!v) continue;
      const res = await fetchWithRetry(
        `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(v)}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
        { timeoutMs: TIMEOUT_MS, retries: 2, label: "keycrm:history-buyer" },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const b = data?.data?.[0];
      // H5: only accept a buyer whose own phone exactly matches (E.164), so a
      // loose KeyCRM match can't expose another person's order history.
      if (b?.id && buyerPhones(b).some((p) => phonesMatchE164(p, phoneE164))) return b.id as number;
    }
  } catch (e) {
    console.warn("[get-keycrm-history] buyer lookup error:", redact((e as Error).message));
  }
  return null;
}

interface KeyCRMOrder {
  id: number;
  parent_id?: number;
  ordered_at?: string;
  created_at?: string;
  grand_total?: number | string;
  total_discount?: number;
  total?: number | string;
  currency_code?: string;
  manager_comment?: string;
  status_id?: number;
  status?: { name?: string; group?: string };
  shipping?: { tracking_code?: string | null } | null;
  products?: Array<{
    id?: number;
    name?: string;
    quantity?: number;
    price?: number | string;
    offer?: { product_name?: string; name?: string } | null;
  }>;
}

function normalize(o: KeyCRMOrder): NormalizedOrder {
  const items: NormalizedItem[] = (o.products ?? []).map((p) => {
    const price = num(p.price);
    const qty = Number(p.quantity ?? 1);
    return {
      id: Number(p.id ?? 0),
      name: p.offer?.product_name || p.offer?.name || p.name || "Товар",
      quantity: qty,
      price,
      sum: price * qty,
    };
  });
  const total = num(o.grand_total ?? o.total) || items.reduce((s, i) => s + i.sum, 0);
  return {
    keycrm_order_id: o.id,
    number: String(o.parent_id ?? o.id),
    status: o.status?.name ?? null,
    status_group: o.status?.group ?? null,
    total,
    currency: o.currency_code ?? null,
    created_at: o.ordered_at || o.created_at || new Date().toISOString(),
    items,
    ttn: o.shipping?.tracking_code ?? null,
    manager_comment: o.manager_comment ?? null,
  };
}

function num(v: number | string | undefined | null): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
