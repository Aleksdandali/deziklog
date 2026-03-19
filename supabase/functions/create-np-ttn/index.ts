import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NP_API_KEY = Deno.env.get("NOVA_POSHTA_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // Use service role to read/update order
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error: orderErr } = await adminClient
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.warehouse_ref || !order.city_ref) {
      return new Response(
        JSON.stringify({ error: "Order missing NP city/warehouse refs" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Free shipping for orders >= 2000 UAH
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
        Recipient: "",
        RecipientAddress: order.warehouse_ref,
        ContactRecipient: "",
        RecipientsPhone: order.phone,
        // NP will create recipient counterparty from phone + name
        NewAddress: "1",
        RecipientCityName: order.city_name || "",
        RecipientAddressName: order.warehouse_name || "",
        RecipientName: `${order.first_name || ""} ${order.last_name || ""}`.trim(),
        RecipientType: "PrivatePerson",
      },
    };

    const npRes = await fetch(NP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(npPayload),
    });

    const npData = await npRes.json();

    if (!npData.success || !npData.data?.[0]) {
      console.error("NP TTN creation failed:", npData);
      return new Response(
        JSON.stringify({
          error: "NP TTN creation failed",
          details: npData.errors || npData.warnings,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const ttn = npData.data[0].IntDocNumber;
    const deliveryCost = npData.data[0].CostOnSite;

    // Save TTN back to order
    await adminClient
      .from("orders")
      .update({
        np_ttn: ttn,
        np_delivery_cost: deliveryCost ? Number(deliveryCost) : null,
      })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({ success: true, ttn, delivery_cost: deliveryCost }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("TTN creation error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
