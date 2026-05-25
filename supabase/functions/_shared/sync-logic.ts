/**
 * Core KeyCRM sync logic. Used by both sync-order-to-keycrm and retry-failed-syncs.
 * Buyer dedup: find-or-create by cached keycrm_buyer_id, then by phone.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchAllKeycrmProducts, syncStockToDb } from "./keycrm-stock.ts";
import { redact } from "./redact.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";

/** Orders >= this amount (UAH) get free shipping (sender pays) */
export const FREE_SHIPPING_THRESHOLD = 2000;

/** Normalize any phone string to E.164 (+380XXXXXXXXX). */
function toE164(phone: string | null | undefined): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("380")) return `+${d}`;
  if (d.startsWith("0") && d.length === 10) return `+38${d}`;
  if (d.length === 9) return `+380${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

/** Search KeyCRM buyer by phone, trying multiple historical formats. */
async function findBuyerByPhone(
  phone: string,
  kcHeaders: Record<string, string>,
): Promise<number | undefined> {
  const e164 = toE164(phone);
  const digits = e164.replace(/\D/g, "");
  const variants = Array.from(new Set([e164, digits, digits.slice(2)])); // +380…, 380…, 0XXXXXXXXX

  for (const v of variants) {
    if (!v) continue;
    try {
      const res = await fetch(
        `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(v)}&limit=1`,
        { headers: kcHeaders },
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.data?.length > 0) return data.data[0].id;
    } catch (_) { /* try next */ }
  }
  return undefined;
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
      await fetch(`${KEYCRM_API_URL}/buyer/${buyerId}`, {
        method: "PUT",
        headers: kcHeaders,
        body: JSON.stringify({ full_name: buyerName, phone: buyerPhone, email: userEmail || undefined }),
      });
    } catch (e) {
      console.warn("KeyCRM buyer update failed:", e);
    }
  } else {
    // Try find by phone — checks E.164, 380…, 0… variants for legacy buyers
    buyerId = await findBuyerByPhone(buyerPhone, kcHeaders);

    // If not found — create
    if (!buyerId) {
      try {
        const buyerRes = await fetch(`${KEYCRM_API_URL}/buyer`, {
          method: "POST",
          headers: kcHeaders,
          body: JSON.stringify({ full_name: buyerName, phone: buyerPhone, email: userEmail || undefined }),
        });
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

  const keycrmRes = await fetch(`${KEYCRM_API_URL}/order`, {
    method: "POST",
    headers: kcHeaders,
    body: JSON.stringify(keycrmPayload),
  });

  const keycrmData = await keycrmRes.json();

  if (!keycrmRes.ok) {
    const errMsg = `KeyCRM ${keycrmRes.status}: ${redact(keycrmData).slice(0, 500)}`;
    console.error(errMsg);
    await markFailed(adminClient, orderId, errMsg);
    return { success: false, error: errMsg };
  }

  const keycrmOrderId = keycrmData.id;

  // 5. NP TTN (optional — only for warehouse delivery with NP refs)
  // Skip if already created on a previous attempt to avoid duplicate shipping labels.
  let ttn: string | null = order.np_ttn ?? null;
  if (!ttn && order.city_ref && NP_API_KEY && (deliveryType === "warehouse" ? order.warehouse_ref : order.address_street)) {
    try {
      const payerType = order.total_amount >= FREE_SHIPPING_THRESHOLD ? "Sender" : "Recipient";
      const serviceType = deliveryType === "address" ? "WarehouseDoors" : "WarehouseWarehouse";

      const methodProperties: Record<string, string> = {
        PayerType: payerType, PaymentMethod: "Cash",
        DateTime: new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }),
        CargoType: "Parcel", Weight: "1", ServiceType: serviceType, SeatsAmount: "1",
        Description: `Замовлення #${order.id.slice(0, 8)}`, Cost: String(order.total_amount),
        CitySender: Deno.env.get("NP_SENDER_ADDRESS_REF")!, Sender: Deno.env.get("NP_SENDER_REF")!,
        SenderAddress: Deno.env.get("NP_SENDER_WAREHOUSE_REF")!, ContactSender: Deno.env.get("NP_SENDER_CONTACT_REF")!,
        SendersPhone: Deno.env.get("NP_SENDER_PHONE")!,
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

      const npRes = await fetch(NP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: NP_API_KEY, modelName: "InternetDocument", calledMethod: "save", methodProperties }),
      });
      const npData = await npRes.json();
      if (npData.success && npData.data?.[0]) {
        ttn = npData.data[0].IntDocNumber;
        const deliveryCost = npData.data[0].CostOnSite;
        try {
          await fetch(`${KEYCRM_API_URL}/order/${keycrmOrderId}`, {
            method: "PUT", headers: kcHeaders,
            body: JSON.stringify({ shipping: { tracking_code: ttn } }),
          });
        } catch { /* non-critical */ }
        await adminClient.from("orders").update({ np_ttn: ttn, np_delivery_cost: deliveryCost ? Number(deliveryCost) : null }).eq("id", orderId);
      } else {
        console.warn("NP TTN failed:", redact(npData.errors || npData.warnings));
      }
    } catch (e) {
      console.warn("NP TTN error:", e);
    }
  }

  // 6. Mark synced
  await adminClient.from("orders").update({
    keycrm_order_id: keycrmOrderId,
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
