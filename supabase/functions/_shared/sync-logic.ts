/**
 * Core KeyCRM sync logic. Used by both sync-order-to-keycrm and retry-failed-syncs.
 * Buyer dedup: find-or-create by cached keycrm_buyer_id, then by phone.
 */

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";

/** Orders >= this amount (UAH) get free shipping (sender pays) */
export const FREE_SHIPPING_THRESHOLD = 2000;

export async function syncOrderToKeyCRM(
  adminClient: any,
  orderId: string,
  userId: string,
  userEmail?: string,
): Promise<{ success: boolean; keycrm_order_id?: number; error?: string; np_ttn?: string | null }> {
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

  // 1. Fetch order
  const { data: order, error: orderErr } = await adminClient
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .single();

  if (orderErr || !order) {
    await markFailed(adminClient, orderId, "Order not found");
    return { success: false, error: "Order not found" };
  }

  // Already synced
  if (order.keycrm_order_id) {
    await adminClient.from("orders").update({ keycrm_sync_status: "synced", keycrm_sync_error: null }).eq("id", orderId);
    return { success: true, keycrm_order_id: order.keycrm_order_id };
  }

  const { data: items } = await adminClient.from("order_items").select("*").eq("order_id", orderId);
  const buyerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Клієнт";

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
        body: JSON.stringify({ full_name: buyerName, phone: order.phone, email: userEmail || undefined }),
      });
    } catch (e) {
      console.warn("KeyCRM buyer update failed:", e);
    }
  } else {
    // Try find by phone
    try {
      const searchRes = await fetch(
        `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(order.phone)}&limit=1`,
        { headers: kcHeaders },
      );
      const searchData = await searchRes.json();
      if (searchRes.ok && searchData.data?.length > 0) {
        buyerId = searchData.data[0].id;
      }
    } catch (e) {
      console.warn("KeyCRM buyer search failed:", e);
    }

    // If not found — create
    if (!buyerId) {
      try {
        const buyerRes = await fetch(`${KEYCRM_API_URL}/buyer`, {
          method: "POST",
          headers: kcHeaders,
          body: JSON.stringify({ full_name: buyerName, phone: order.phone, email: userEmail || undefined }),
        });
        const buyerData = await buyerRes.json();
        if (buyerRes.ok && buyerData.id) buyerId = buyerData.id;
        else console.warn("KeyCRM buyer create:", buyerData);
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
  const recipientPhone = order.recipient_phone || order.phone;
  const deliveryType = order.delivery_type || "warehouse";

  // 4. Create order in KeyCRM
  const keycrmPayload: Record<string, any> = {
    source_id: KEYCRM_SOURCE_ID,
    buyer_id: buyerId || undefined,
    buyer: { full_name: buyerName, phone: order.phone, email: userEmail || undefined },
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
    products: (items || []).map((item: any) => ({
      name: item.product_name, sku: item.product_id,
      price: item.price_at_order, quantity: item.quantity,
    })),
  };

  const keycrmRes = await fetch(`${KEYCRM_API_URL}/order`, {
    method: "POST",
    headers: kcHeaders,
    body: JSON.stringify(keycrmPayload),
  });

  const keycrmData = await keycrmRes.json();

  if (!keycrmRes.ok) {
    const errMsg = `KeyCRM ${keycrmRes.status}: ${JSON.stringify(keycrmData).slice(0, 500)}`;
    console.error(errMsg);
    await markFailed(adminClient, orderId, errMsg);
    return { success: false, error: errMsg };
  }

  const keycrmOrderId = keycrmData.id;

  // 5. NP TTN (optional — only for warehouse delivery with NP refs)
  let ttn: string | null = null;
  if (order.city_ref && NP_API_KEY && (deliveryType === "warehouse" ? order.warehouse_ref : order.address_street)) {
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
        console.warn("NP TTN failed:", npData.errors || npData.warnings);
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

  return { success: true, keycrm_order_id: keycrmOrderId, np_ttn: ttn };
}

async function markFailed(client: any, orderId: string, error: string) {
  await client.from("orders").update({
    keycrm_sync_status: "failed",
    keycrm_sync_error: error.slice(0, 1000),
  }).eq("id", orderId);
}
