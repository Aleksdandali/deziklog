/**
 * Core KeyCRM sync logic. Used by both sync-order-to-keycrm and retry-failed-syncs.
 * Buyer dedup: find-or-create by cached keycrm_buyer_id, then by phone.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllKeycrmProducts, syncStockToDb } from "./keycrm-stock.ts";
import { redact } from "./redact.ts";
import { fetchWithRetry } from "./fetch-retry.ts";
import { toE164, phonesMatchE164, buyerPhones } from "./phone.ts";
import { FREE_SHIPPING_THRESHOLD } from "./shipping-policy.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";

// FREE_SHIPPING_THRESHOLD is defined in ./shipping-policy.ts (shared with create-np-ttn).
export { FREE_SHIPPING_THRESHOLD };

/** Search KeyCRM buyer by phone, trying multiple historical formats. */
async function findBuyerByPhone(
  phone: string,
  kcHeaders: Record<string, string>,
): Promise<number | undefined> {
  const e164 = toE164(phone);
  const digits = e164.replace(/\D/g, "");
  // +380… and 380… both normalize back to the same E.164 for verification.
  // The bare-national `0XXXXXXXXX` (slice(2)) variant was DROPPED (H5): KeyCRM's
  // filter[phone] is loose/substring, so a national-format query could match a
  // different buyer and leak their identity/history.
  const variants = Array.from(new Set([e164, digits]));

  for (const v of variants) {
    if (!v) continue;
    try {
      const res = await fetchWithRetry(
        `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(v)}&limit=1`,
        { headers: kcHeaders },
        { timeoutMs: 8000, retries: 2, label: "keycrm:buyer-find" },
      );
      if (!res.ok) continue;
      const data = await res.json();
      const b = data?.data?.[0];
      // H5: only trust a match whose OWN phone equals our user's phone (E.164).
      if (b?.id && buyerPhones(b).some((p) => phonesMatchE164(p, e164))) return b.id;
    } catch (_) { /* try next */ }
  }
  return undefined;
}

/** App payment-method key → matcher for the KeyCRM payment-method name. */
const PAYMENT_NAME_MATCH: Record<string, RegExp> = {
  // "Накладений платіж" / "Наложенный платеж" / "Післяплата"
  nalozhka: /накладен|наложен|післяплат|пiсляплат/i,
  // "Оплата на розрахунковий рахунок …" (NOT the bare "Безготівковий розрахунок")
  rozrahunok: /розрахунков\w*\s+рахун/i,
};

/**
 * Resolve a KeyCRM payment_method_id by matching the tenant's configured method
 * name (so we don't hardcode tenant-specific numeric ids). Returns undefined on
 * any failure — the caller then syncs the order without a payment line.
 */
async function resolveKeycrmPaymentMethodId(
  key: string,
  kcHeaders: Record<string, string>,
): Promise<number | undefined> {
  const re = PAYMENT_NAME_MATCH[key];
  if (!re) return undefined;
  try {
    const res = await fetchWithRetry(
      `${KEYCRM_API_URL}/order/payment-method?limit=50`,
      { headers: kcHeaders },
      { timeoutMs: 8000, retries: 1, label: "keycrm:payment-methods" },
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const list: Array<{ id: number; name: string }> = data?.data ?? (Array.isArray(data) ? data : []);
    return list.find((m) => re.test(m?.name || ""))?.id;
  } catch {
    return undefined;
  }
}

export async function syncOrderToKeyCRM(
  adminClient: SupabaseClient,
  orderId: string,
  userId: string,
  userEmail?: string,
): Promise<{ success: boolean; keycrm_order_id?: number; error?: string; np_ttn?: string | null; in_progress?: boolean }> {
  const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY");
  const KEYCRM_SOURCE_ID = Number(Deno.env.get("KEYCRM_SOURCE_ID") || "10");
  const NP_API_KEY = Deno.env.get("NOVA_POSHTA_API_KEY") || "";

  if (!KEYCRM_API_KEY) {
    await markFailed(adminClient, orderId, "KEYCRM_API_KEY not set");
    return { success: false, error: "KEYCRM_API_KEY not set in secrets" };
  }

  const kcHeaders = {
    Authorization: `Bearer ${KEYCRM_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // 1. Atomic claim — prevents race when multiple paths (DB trigger / client
  //    fire-and-forget / retry cron) try to sync the same order. RPC does an
  //    UPDATE … RETURNING under Postgres' row lock; only one worker wins.
  //    Stale claims (>2 min, e.g. crashed worker) are re-claimable.
  const { data: claimed, error: claimErr } = await adminClient
    .rpc("claim_order_for_keycrm_sync", { p_order_id: orderId, p_user_id: userId });

  if (claimErr) {
    await markFailed(adminClient, orderId, `Claim failed: ${claimErr.message}`);
    return { success: false, error: `Claim failed: ${claimErr.message}` };
  }

  const order = Array.isArray(claimed) && claimed.length > 0 ? claimed[0] : null;

  if (!order) {
    // No claim → re-read to find out why (already synced vs. another worker active).
    const { data: existing } = await adminClient
      .from("orders")
      .select("id, keycrm_order_id, np_ttn")
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      await markFailed(adminClient, orderId, "Order not found");
      return { success: false, error: "Order not found" };
    }

    if (existing.keycrm_order_id) {
      // Already synced (possibly by another path). Treat as idempotent success.
      return { success: true, keycrm_order_id: existing.keycrm_order_id, np_ttn: existing.np_ttn ?? null };
    }

    // Another worker holds an active claim. Don't mark failed — let it finish.
    return { success: true, in_progress: true };
  }

  // Join in products.keycrm_id so we can link each order line to a KeyCRM
  // catalog entry (required for KeyCRM to show the product picture).
  const { data: items } = await adminClient
    .from("order_items")
    .select("*, product:products(keycrm_id)")
    .eq("order_id", orderId);
  const buyerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Клієнт";

  // Always send phones in E.164 to KeyCRM so dedup search is deterministic.
  const buyerPhone = toE164(order.phone);

  // 2. Find or create buyer (DEDUP)
  const { data: profile } = await adminClient
    .from("profiles")
    .select("keycrm_buyer_id, name, last_name, phone")
    .eq("id", userId)
    .single();

  let buyerId: number | undefined;

  if (profile?.keycrm_buyer_id) {
    // Already cached — update buyer data in KeyCRM
    buyerId = profile.keycrm_buyer_id;
    try {
      await fetchWithRetry(`${KEYCRM_API_URL}/buyer/${buyerId}`, {
        method: "PUT",
        headers: kcHeaders,
        body: JSON.stringify({ full_name: buyerName, phone: buyerPhone, email: userEmail || undefined }),
      }, { timeoutMs: 8000, retries: 1, label: "keycrm:buyer-update" });
    } catch (e) {
      console.warn("KeyCRM buyer update failed:", e);
    }
  } else {
    // Try find by phone — checks E.164, 380…, 0… variants for legacy buyers
    buyerId = await findBuyerByPhone(buyerPhone, kcHeaders);

    // If not found — create
    if (!buyerId) {
      try {
        // retries:0 — POST /buyer is non-idempotent (would create duplicates).
        const buyerRes = await fetchWithRetry(`${KEYCRM_API_URL}/buyer`, {
          method: "POST",
          headers: kcHeaders,
          body: JSON.stringify({ full_name: buyerName, phone: buyerPhone, email: userEmail || undefined }),
        }, { timeoutMs: 8000, retries: 0, label: "keycrm:buyer-create" });
        const buyerData = await buyerRes.json();
        if (buyerRes.ok && buyerData.id) buyerId = buyerData.id;
        else console.warn("KeyCRM buyer create:", redact(buyerData));
      } catch (e) {
        console.warn("KeyCRM buyer create failed:", e);
      }
    }

    // Cache buyer_id on profile
    if (buyerId) {
      await adminClient.from("profiles").update({ keycrm_buyer_id: buyerId }).eq("id", userId);
    }
  }

  // 3. Build recipient name (may differ from buyer)
  const recipientName = `${order.recipient_first_name || order.first_name || ""} ${order.recipient_last_name || order.last_name || ""}`.trim() || buyerName;
  const recipientPhone = toE164(order.recipient_phone || order.phone);
  const deliveryType = order.delivery_type || "warehouse";

  // 4. Create order in KeyCRM
  const keycrmPayload: Record<string, unknown> = {
    source_id: KEYCRM_SOURCE_ID,
    buyer_id: buyerId || undefined,
    buyer: { full_name: buyerName, phone: buyerPhone, email: userEmail || undefined },
    shipping: {
      delivery_service_id: 1,
      shipping_address_city: order.city_name || "",
      recipient_full_name: recipientName,
      recipient_phone: recipientPhone,
      ...(deliveryType === "warehouse"
        ? {
            shipping_receive_point: order.warehouse_name || order.delivery_address,
            warehouse_ref: order.warehouse_ref || undefined,
          }
        : {
            shipping_receive_point: `${order.address_street || ""} ${order.address_building || ""}${order.address_apartment ? ", кв. " + order.address_apartment : ""}`.trim() || order.delivery_address,
          }),
    },
    // Link each line to a KeyCRM catalog product when possible — required for
    // KeyCRM to show product pictures & inherit canonical name/sku in the order
    // detail view. Falls back to a free-form line (name+sku) if products.keycrm_id
    // is NULL (legacy/manually-added products not yet reconciled by the cron).
    products: (items || []).map((item: { product_name: string; product_id: string; price_at_order: number; quantity: number; product?: { keycrm_id: number | null } | null }) => {
      const keycrmId = item.product?.keycrm_id ?? null;
      return keycrmId
        ? { product_id: keycrmId, price: item.price_at_order, quantity: item.quantity }
        : { name: item.product_name, sku: item.product_id, price: item.price_at_order, quantity: item.quantity };
    }),
  };

  // Attach the chosen payment method to the KeyCRM order. Resolved by name (no
  // hardcoded tenant ids) and best-effort: if it can't be resolved the order
  // still syncs, just without a payment line. payment_method is re-read here so
  // we don't depend on the claim RPC's column list.
  try {
    const { data: pmRow } = await adminClient
      .from("orders").select("payment_method").eq("id", orderId).maybeSingle();
    const pmKey = pmRow?.payment_method as string | null;
    if (pmKey) {
      const pmId = await resolveKeycrmPaymentMethodId(pmKey, kcHeaders);
      if (pmId) {
        const orderTotal = (items || []).reduce(
          (sum: number, it: { price_at_order?: number; quantity?: number }) =>
            sum + (it.price_at_order || 0) * (it.quantity || 0), 0);
        keycrmPayload.payments = [{ payment_method_id: pmId, amount: orderTotal, status: "not_paid" }];
      } else {
        console.warn("KeyCRM payment method not resolved for key:", pmKey);
      }
    }
  } catch (e) {
    console.warn("KeyCRM payment attach failed:", e);
  }

  // retries:0 — POST /order is non-idempotent. The helper gives us a hard
  // timeout (the hang that previously caused the duplicate-order window) WITHOUT
  // retrying a request that may have already created the order.
  const keycrmRes = await fetchWithRetry(`${KEYCRM_API_URL}/order`, {
    method: "POST",
    headers: kcHeaders,
    body: JSON.stringify(keycrmPayload),
  }, { timeoutMs: 12000, retries: 0, label: "keycrm:order-create" });

  const keycrmData = await keycrmRes.json();

  if (!keycrmRes.ok) {
    const errMsg = `KeyCRM ${keycrmRes.status}: ${redact(keycrmData).slice(0, 500)}`;
    console.error(errMsg);
    await markFailed(adminClient, orderId, errMsg);
    return { success: false, error: errMsg };
  }

  const keycrmOrderId = keycrmData.id;

  // 5a. H1/M1: persist keycrm_order_id IMMEDIATELY, before any further external
  // call (NP TTN). The claim RPC guards on `keycrm_order_id IS NULL`, so from
  // this point the order can never be re-claimed/re-POSTed even if this isolate
  // dies mid-NP-block. Status 'order_created' = KeyCRM order exists, shipping
  // may still be in progress.
  {
    const { error: persistErr } = await adminClient.from("orders").update({
      keycrm_order_id: keycrmOrderId,
      keycrm_sync_status: "order_created",
      keycrm_sync_error: null,
    }).eq("id", orderId);
    if (persistErr) {
      // KeyCRM order exists but we couldn't record its id. Do NOT route through
      // markFailed (a retry would re-POST a duplicate). Flag for manual review.
      console.error(`CRITICAL: KeyCRM order ${keycrmOrderId} created but id persist failed:`, persistErr.message);
      await adminClient.from("orders").update({
        keycrm_sync_status: "order_created_unpersisted",
        keycrm_sync_error: `KeyCRM order ${keycrmOrderId} created but id persist failed: ${persistErr.message}`.slice(0, 1000),
      }).eq("id", orderId).is("keycrm_order_id", null);
      return { success: false, error: "keycrm_order_id persist failed", keycrm_order_id: keycrmOrderId };
    }
  }

  // 5. NP TTN (optional — only for warehouse delivery with NP refs)
  // Skip if already created on a previous attempt to avoid duplicate shipping labels.
  let ttn: string | null = order.np_ttn ?? null;
  // L5: NP sender refs are required to create a TTN. If any is missing, the
  // request would silently fail and the order would be marked synced with no
  // shipping label. Detect that explicitly and warn instead of relying on `!`.
  const npSender = {
    CitySender: Deno.env.get("NP_SENDER_ADDRESS_REF") ?? "",
    Sender: Deno.env.get("NP_SENDER_REF") ?? "",
    SenderAddress: Deno.env.get("NP_SENDER_WAREHOUSE_REF") ?? "",
    ContactSender: Deno.env.get("NP_SENDER_CONTACT_REF") ?? "",
    SendersPhone: Deno.env.get("NP_SENDER_PHONE") ?? "",
  };
  const npSenderConfigured = Object.values(npSender).every((v) => v.length > 0);
  if (!ttn && !npSenderConfigured) {
    console.warn(`[NP TTN] sender env(s) missing — skipping TTN for order ${order.id.slice(0, 8)}`);
  }
  if (!ttn && npSenderConfigured && order.city_ref && NP_API_KEY && (deliveryType === "warehouse" ? order.warehouse_ref : order.address_street)) {
    try {
      const payerType = order.total_amount >= FREE_SHIPPING_THRESHOLD ? "Sender" : "Recipient";
      const serviceType = deliveryType === "address" ? "WarehouseDoors" : "WarehouseWarehouse";

      const methodProperties: Record<string, string> = {
        PayerType: payerType, PaymentMethod: "Cash",
        DateTime: new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }),
        CargoType: "Parcel", Weight: "1", ServiceType: serviceType, SeatsAmount: "1",
        Description: `Замовлення #${order.id.slice(0, 8)}`, Cost: String(order.total_amount),
        ...npSender,
        CityRecipient: order.city_ref,
        RecipientsPhone: recipientPhone, NewAddress: "1",
        RecipientCityName: order.city_name || "",
        RecipientName: recipientName, RecipientType: "PrivatePerson",
      };

      if (deliveryType === "warehouse") {
        methodProperties.RecipientAddress = order.warehouse_ref;
        methodProperties.RecipientAddressName = order.warehouse_name || "";
      } else {
        methodProperties.RecipientAddressName = `${order.address_street || ""} ${order.address_building || ""}`.trim();
      }

      // retries:0 — InternetDocument.save is non-idempotent (would create a
      // duplicate shipping label). Timeout only.
      const npRes = await fetchWithRetry(NP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: NP_API_KEY, modelName: "InternetDocument", calledMethod: "save", methodProperties }),
      }, { timeoutMs: 8000, retries: 0, label: "np:ttn-save" });
      const npData = await npRes.json();
      if (npData.success && npData.data?.[0]) {
        ttn = npData.data[0].IntDocNumber;
        const deliveryCost = npData.data[0].CostOnSite;
        // M1: persist the TTN we just paid NP to create BEFORE any further hop,
        // so an isolate death after this cannot orphan the label.
        await adminClient.from("orders").update({ np_ttn: ttn, np_delivery_cost: deliveryCost ? Number(deliveryCost) : null }).eq("id", orderId);
        try {
          await fetchWithRetry(`${KEYCRM_API_URL}/order/${keycrmOrderId}`, {
            method: "PUT", headers: kcHeaders,
            body: JSON.stringify({ shipping: { tracking_code: ttn } }),
          }, { timeoutMs: 8000, retries: 1, label: "keycrm:order-ttn" });
        } catch { /* non-critical */ }
      } else {
        console.warn("NP TTN failed:", redact(npData.errors || npData.warnings));
      }
    } catch (e) {
      console.warn("NP TTN error:", e);
    }
  }

  // 6. Mark synced (keycrm_order_id + np_ttn already persisted above).
  await adminClient.from("orders").update({
    keycrm_sync_status: "synced",
    keycrm_sync_error: null,
  }).eq("id", orderId);

  // 7. Targeted stock refresh for ordered SKUs. Best-effort: order success
  // doesn't depend on this. KeyCRM already decremented its own stock when we
  // created the order above; this just propagates the new `in_stock` value
  // back into our DB without waiting for the 5h cron.
  const productIds = (items || [])
    .map((it: { product_id: string }) => it.product_id)
    .filter(Boolean);
  if (productIds.length > 0) {
    try {
      const keycrmMap = await fetchAllKeycrmProducts(KEYCRM_API_KEY);
      await syncStockToDb(adminClient, keycrmMap, productIds);
    } catch (e) {
      console.warn("[post-order stock refresh] failed:", (e as Error).message);
    }
  }

  return { success: true, keycrm_order_id: keycrmOrderId, np_ttn: ttn };
}

async function markFailed(client: SupabaseClient, orderId: string, error: string) {
  await client.from("orders").update({
    keycrm_sync_status: "failed",
    keycrm_sync_error: error.slice(0, 1000),
  }).eq("id", orderId);
}
