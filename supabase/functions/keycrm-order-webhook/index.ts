/**
 * Webhook endpoint for KeyCRM order status changes.
 * When KeyCRM updates an order status, it calls this endpoint.
 * We update the order in Supabase and send a push notification to the user.
 *
 * Expected payload from KeyCRM:
 * { "order_id": number, "status": "confirmed" | "canceled", ... }
 *
 * Secure with KEYCRM_WEBHOOK_SECRET env var.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";

const WEBHOOK_SECRET = Deno.env.get("KEYCRM_WEBHOOK_SECRET");

const STATUS_MAP: Record<string, string> = {
  // Map KeyCRM status IDs/names to our internal statuses
  // Adjust these mappings based on your KeyCRM configuration
  "1": "pending",
  "2": "confirmed",
  "3": "canceled",
  "new": "pending",
  "confirmed": "confirmed",
  "canceled": "canceled",
  "cancelled": "canceled",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "підтверджено",
  canceled: "скасовано",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify webhook secret (header only — never accept from URL params)
    const secret = req.headers.get("x-webhook-secret");
    if (!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const keycrmOrderId = body.order_id || body.id;
    const rawStatus = String(body.status || body.status_id || "");
    const newStatus = STATUS_MAP[rawStatus] ?? rawStatus;

    if (!keycrmOrderId || !newStatus) {
      return new Response(
        JSON.stringify({ error: "Missing order_id or status" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Use service role to update any order
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find order by keycrm_order_id
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("id, user_id, status")
      .eq("keycrm_order_id", keycrmOrderId)
      .maybeSingle();

    if (findError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", keycrmOrderId }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Skip if status hasn't changed
    if (order.status === newStatus) {
      return new Response(
        JSON.stringify({ ok: true, message: "Status unchanged" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    // Send push notification
    const { data: profile } = await supabase
      .from("profiles")
      .select("expo_push_token, notification_order_status")
      .eq("id", order.user_id)
      .maybeSingle();

    if (
      profile?.expo_push_token &&
      profile.notification_order_status !== false
    ) {
      const label = STATUS_LABELS[newStatus] ?? newStatus;
      const message = buildPushMessage(
        profile.expo_push_token,
        "Статус замовлення змінено",
        `Ваше замовлення ${label}.`,
        { orderId: order.id, screen: "order" },
      );
      await sendExpoPush([message]);
    }

    return new Response(
      JSON.stringify({ ok: true, orderId: order.id, newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
