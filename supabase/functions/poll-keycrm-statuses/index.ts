/**
 * Poll KeyCRM for order status changes.
 * Called by cron every 5 minutes or manually.
 * Checks all synced orders that are not yet delivered/canceled,
 * compares status with KeyCRM, and updates if changed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

/**
 * Map KeyCRM status_id → our app status
 * Adjust if you add more statuses in KeyCRM
 */
const KEYCRM_STATUS_MAP: Record<number, string> = {
  1: "pending",       // new
  8: "processing",    // 🚚Передан на сборку
  12: "delivered",    // completed
};

const STATUS_LABELS: Record<string, string> = {
  processing: "передано на збірку",
  delivered: "доставлено",
  confirmed: "підтверджено",
  canceled: "скасовано",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: only cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");

    if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY");
    if (!KEYCRM_API_KEY) {
      return jsonRes({ error: "KEYCRM_API_KEY not set" }, 500);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all orders that are synced but not in final state
    const { data: orders, error } = await adminClient
      .from("orders")
      .select("id, user_id, keycrm_order_id, status")
      .not("keycrm_order_id", "is", null)
      .not("status", "in", '("delivered","canceled")')
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !orders?.length) {
      return jsonRes({ success: true, checked: 0, updated: 0 });
    }

    const kcHeaders = {
      Authorization: `Bearer ${KEYCRM_API_KEY}`,
      Accept: "application/json",
    };

    let updated = 0;
    const results: any[] = [];

    for (const order of orders) {
      try {
        const res = await fetch(
          `${KEYCRM_API_URL}/order/${order.keycrm_order_id}`,
          { headers: kcHeaders },
        );

        if (!res.ok) {
          console.warn(`KeyCRM order ${order.keycrm_order_id}: ${res.status}`);
          continue;
        }

        const kcOrder = await res.json();
        const kcStatusId = kcOrder.status_id;
        const newStatus = KEYCRM_STATUS_MAP[kcStatusId];

        if (!newStatus || newStatus === order.status) continue;

        // Update status in DB
        await adminClient
          .from("orders")
          .update({ status: newStatus })
          .eq("id", order.id);

        // Send push notification
        const { data: profile } = await adminClient
          .from("profiles")
          .select("expo_push_token, notification_order_status")
          .eq("id", order.user_id)
          .maybeSingle();

        if (profile?.expo_push_token && profile.notification_order_status !== false) {
          const label = STATUS_LABELS[newStatus] ?? newStatus;
          await sendExpoPush([
            buildPushMessage(
              profile.expo_push_token,
              "Статус замовлення",
              `Ваше замовлення ${label}.`,
              { orderId: order.id, screen: "order" },
            ),
          ]);
        }

        updated++;
        results.push({
          order_id: order.id.slice(0, 8),
          keycrm_id: order.keycrm_order_id,
          old_status: order.status,
          new_status: newStatus,
        });

        // Small delay between API calls
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        console.warn(`Poll error for order ${order.id.slice(0, 8)}:`, e);
      }
    }

    return jsonRes({ success: true, checked: orders.length, updated, results });
  } catch (err) {
    console.error("Poll error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
