import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY")!;
const KEYCRM_SOURCE_ID = Number(Deno.env.get("KEYCRM_SOURCE_ID") || "10");

const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NP_API_KEY = Deno.env.get("NOVA_POSHTA_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Parse body early so we have order_id for error handling
  let orderId: string | null = null;
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonRes({ error: "No auth header" }, 401);
    }

    const body = await req.json();
    orderId = body.order_id || null;
    if (!orderId) {
      return jsonRes({ error: "order_id required" }, 400);
    }

    // Auth: user JWT or cron secret (for retry)
    let userId: string;
    let userEmail: string | undefined;

    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    const isCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;

    if (isCron) {
      // Called from retry-failed-syncs via shared sync-logic
      userId = body.user_id;
      userEmail = body.user_email;
      if (!userId) {
        return jsonRes({ error: "user_id required for cron calls" }, 400);
      }
    } else {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return jsonRes({ error: "Unauthorized" }, 401);
      }
      userId = user.id;
      userEmail = user.email;
    }

    // 1. Fetch order + items
    const { data: order, error: orderErr } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single();

    if (orderErr || !order) {
      await markFailed(adminClient, orderId, "Order not found");
      return jsonRes({ error: "Order not found" }, 404);
    }

    // Already synced? Skip
    if (order.keycrm_order_id) {
      await adminClient.from("orders").update({ keycrm_sync_status: "synced", keycrm_sync_error: null }).eq("id", orderId);
      return jsonRes({ success: true, keycrm_order_id: order.keycrm_order_id, skipped: true });
    }

    const { data: items } = await adminClient
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    const buyerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Клієнт";

    // 2. Create/find buyer
    let buyerId: number | undefined;
    try {
      const buyerRes = await fetch(`${KEYCRM_API_URL}/buyer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEYCRM_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ full_name: buyerName, phone: order.phone, email: userEmail || undefined }),
      });
      const buyerData = await buyerRes.json();
      if (buyerRes.ok && buyerData.id) buyerId = buyerData.id;
      else console.warn("KeyCRM buyer:", buyerData);
    } catch (e) {
      console.warn("KeyCRM buyer failed:", e);
    }

    // 3. Create order in KeyCRM
    const keycrmPayload: Record<string, any> = {
      source_id: KEYCRM_SOURCE_ID,
      buyer: { full_name: buyerName, phone: order.phone, email: userEmail || undefined },
      shipping: {
        delivery_service_id: 1,
        shipping_receive_point: order.warehouse_name || order.delivery_address,
        shipping_address_city: order.city_name || "",
        recipient_full_name: buyerName,
        recipient_phone: order.phone,
        warehouse_ref: order.warehouse_ref || undefined,
      },
      products: (items || []).map((item: any) => ({
        name: item.product_name, sku: item.product_id,
        price: item.price_at_order, quantity: item.quantity,
      })),
    };
    if (buyerId) keycrmPayload.buyer_id = buyerId;

    const keycrmRes = await fetch(`${KEYCRM_API_URL}/order`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEYCRM_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(keycrmPayload),
    });

    const keycrmData = await keycrmRes.json();

    if (!keycrmRes.ok) {
      const errMsg = `KeyCRM ${keycrmRes.status}: ${JSON.stringify(keycrmData).slice(0, 500)}`;
      console.error(errMsg);
      await markFailed(adminClient, orderId, errMsg);
      return jsonRes({ error: "KeyCRM sync failed" }, 502);
    }

    const keycrmOrderId = keycrmData.id;

    // 4. Create NP TTN (optional)
    let ttn: string | null = null;
    if (order.warehouse_ref && order.city_ref && NP_API_KEY) {
      try {
        const payerType = order.total_amount >= 2000 ? "Sender" : "Recipient";
        const npRes = await fetch(NP_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: NP_API_KEY, modelName: "InternetDocument", calledMethod: "save",
            methodProperties: {
              PayerType: payerType, PaymentMethod: "Cash",
              DateTime: new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }),
              CargoType: "Parcel", Weight: "1", ServiceType: "WarehouseWarehouse", SeatsAmount: "1",
              Description: `Замовлення #${order.id.slice(0, 8)}`, Cost: String(order.total_amount),
              CitySender: Deno.env.get("NP_SENDER_ADDRESS_REF")!, Sender: Deno.env.get("NP_SENDER_REF")!,
              SenderAddress: Deno.env.get("NP_SENDER_WAREHOUSE_REF")!, ContactSender: Deno.env.get("NP_SENDER_CONTACT_REF")!,
              SendersPhone: Deno.env.get("NP_SENDER_PHONE")!,
              CityRecipient: order.city_ref, RecipientAddress: order.warehouse_ref,
              RecipientsPhone: order.phone, NewAddress: "1",
              RecipientCityName: order.city_name || "", RecipientAddressName: order.warehouse_name || "",
              RecipientName: buyerName, RecipientType: "PrivatePerson",
            },
          }),
        });
        const npData = await npRes.json();
        if (npData.success && npData.data?.[0]) {
          ttn = npData.data[0].IntDocNumber;
          const deliveryCost = npData.data[0].CostOnSite;
          // Update KeyCRM with tracking
          try {
            await fetch(`${KEYCRM_API_URL}/order/${keycrmOrderId}`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${KEYCRM_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
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

    // 5. Mark synced
    await adminClient.from("orders").update({
      keycrm_order_id: keycrmOrderId,
      keycrm_sync_status: "synced",
      keycrm_sync_error: null,
    }).eq("id", orderId);

    return jsonRes({ success: true, keycrm_order_id: keycrmOrderId, buyer_id: buyerId || null, np_ttn: ttn });
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("Sync error:", msg);
    if (orderId) await markFailed(adminClient, orderId, msg);
    return jsonRes({ error: "Internal error", message: msg }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function markFailed(client: any, orderId: string, error: string) {
  await client.from("orders").update({
    keycrm_sync_status: "failed",
    keycrm_sync_error: error.slice(0, 1000),
  }).eq("id", orderId);
}
