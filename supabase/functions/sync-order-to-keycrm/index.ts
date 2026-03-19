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

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for updates
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch order + items
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    const buyerName = `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Клієнт";

    // 2. Create/find buyer in KeyCRM
    let buyerId: number | undefined;
    try {
      const buyerRes = await fetch(`${KEYCRM_API_URL}/buyer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEYCRM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          full_name: buyerName,
          phone: order.phone,
          email: user.email || undefined,
        }),
      });
      const buyerData = await buyerRes.json();
      if (buyerRes.ok && buyerData.id) {
        buyerId = buyerData.id;
      } else {
        console.warn("KeyCRM buyer creation response:", buyerData);
      }
    } catch (e) {
      console.warn("KeyCRM buyer creation failed:", e);
    }

    // 3. Create order in KeyCRM with enhanced shipping
    const keycrmPayload: Record<string, any> = {
      source_id: KEYCRM_SOURCE_ID,
      buyer: {
        full_name: buyerName,
        phone: order.phone,
        email: user.email || undefined,
      },
      shipping: {
        delivery_service_id: 1, // Nova Poshta in KeyCRM
        shipping_receive_point: order.warehouse_name || order.delivery_address,
        shipping_address_city: order.city_name || "",
        recipient_full_name: buyerName,
        recipient_phone: order.phone,
        warehouse_ref: order.warehouse_ref || undefined,
      },
      products: (items || []).map((item: any) => ({
        name: item.product_name,
        sku: item.product_id,
        price: item.price_at_order,
        quantity: item.quantity,
      })),
    };

    if (buyerId) {
      keycrmPayload.buyer_id = buyerId;
    }

    const keycrmRes = await fetch(`${KEYCRM_API_URL}/order`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEYCRM_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(keycrmPayload),
    });

    const keycrmData = await keycrmRes.json();

    if (!keycrmRes.ok) {
      console.error("KeyCRM order error:", keycrmData);
      return new Response(
        JSON.stringify({ error: "KeyCRM sync failed", details: keycrmData }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const keycrmOrderId = keycrmData.id;

    // 4. Create NP TTN (if we have NP shipping data)
    let ttn: string | null = null;
    if (order.warehouse_ref && order.city_ref && NP_API_KEY) {
      try {
        const payerType = order.total_amount >= 2000 ? "Sender" : "Recipient";

        const npPayload = {
          apiKey: NP_API_KEY,
          modelName: "InternetDocument",
          calledMethod: "save",
          methodProperties: {
            PayerType: payerType,
            PaymentMethod: "Cash",
            DateTime: new Date().toLocaleDateString("uk-UA", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            }),
            CargoType: "Parcel",
            Weight: "1",
            ServiceType: "WarehouseWarehouse",
            SeatsAmount: "1",
            Description: `Замовлення #${order.id.slice(0, 8)}`,
            Cost: String(order.total_amount),
            CitySender: Deno.env.get("NP_SENDER_ADDRESS_REF")!,
            Sender: Deno.env.get("NP_SENDER_REF")!,
            SenderAddress: Deno.env.get("NP_SENDER_WAREHOUSE_REF")!,
            ContactSender: Deno.env.get("NP_SENDER_CONTACT_REF")!,
            SendersPhone: Deno.env.get("NP_SENDER_PHONE")!,
            CityRecipient: order.city_ref,
            RecipientAddress: order.warehouse_ref,
            RecipientsPhone: order.phone,
            NewAddress: "1",
            RecipientCityName: order.city_name || "",
            RecipientAddressName: order.warehouse_name || "",
            RecipientName: buyerName,
            RecipientType: "PrivatePerson",
          },
        };

        const npRes = await fetch(NP_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(npPayload),
        });

        const npData = await npRes.json();

        if (npData.success && npData.data?.[0]) {
          ttn = npData.data[0].IntDocNumber;
          const deliveryCost = npData.data[0].CostOnSite;

          // 5. Update KeyCRM order with tracking number
          try {
            await fetch(`${KEYCRM_API_URL}/order/${keycrmOrderId}`, {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${KEYCRM_API_KEY}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                shipping: {
                  tracking_code: ttn,
                },
              }),
            });
          } catch (e) {
            console.warn("KeyCRM tracking update failed:", e);
          }

          // Update order with TTN + delivery cost
          await adminClient
            .from("orders")
            .update({
              np_ttn: ttn,
              np_delivery_cost: deliveryCost ? Number(deliveryCost) : null,
            })
            .eq("id", order_id);
        } else {
          console.warn("NP TTN creation failed:", npData.errors || npData.warnings);
        }
      } catch (e) {
        console.warn("NP TTN creation error:", e);
      }
    }

    // 6. Update Supabase order with KeyCRM ID
    await adminClient
      .from("orders")
      .update({ keycrm_order_id: keycrmOrderId })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        success: true,
        keycrm_order_id: keycrmOrderId,
        buyer_id: buyerId || null,
        np_ttn: ttn,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
