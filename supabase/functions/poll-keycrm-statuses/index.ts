/**
 * Poll KeyCRM for order status changes.
 * Called by cron every 5 minutes or manually.
 * Checks synced orders that are not yet delivered/canceled, least-recently
 * polled first (cursor), compares status with KeyCRM, and updates if changed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { safeError } from "../_shared/safe-error.ts";
import { mapKeyCRMStatus, STATUS_LABELS } from "../_shared/keycrm-status.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: only cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");

    if (!cronSecret || !expectedSecret || !timingSafeEqual(cronSecret, expectedSecret)) {
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

    // Synced, non-final orders — least-recently-polled first (M8 cursor) so that
    // with >50 active orders the oldest still get checked instead of starving.
    const { data: orders, error } = await adminClient
      .from("orders")
      .select("id, user_id, keycrm_order_id, status, keycrm_status_changed_at")
      .not("keycrm_order_id", "is", null)
      .not("status", "in", '("delivered","canceled")')
      .order("last_polled_at", { ascending: true, nullsFirst: true })
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
      const polledAt = new Date().toISOString();
      try {
        const res = await fetchWithRetry(
          `${KEYCRM_API_URL}/order/${order.keycrm_order_id}`,
          { headers: kcHeaders },
          { timeoutMs: 8000, retries: 2, label: "keycrm:order-poll" },
        );

        if (!res.ok) {
          console.warn(`KeyCRM order ${order.keycrm_order_id}: ${res.status}`);
          // Still advance the cursor so a persistently-erroring order doesn't
          // block the rest of the queue forever.
          await adminClient.from("orders").update({ last_polled_at: polledAt }).eq("id", order.id);
          continue;
        }

        const kcOrder = await res.json();
        const newStatus = mapKeyCRMStatus(kcOrder.status_id);

        // M9: surface unmapped statuses instead of silently dropping them.
        if (!newStatus) {
          console.error("[poll] unmapped KeyCRM status_id", {
            order_id: order.id.slice(0, 8),
            keycrm_order_id: order.keycrm_order_id,
            status_id: kcOrder.status_id,
          });
          await adminClient.from("orders").update({ last_polled_at: polledAt }).eq("id", order.id);
          continue;
        }

        if (newStatus === order.status) {
          await adminClient.from("orders").update({ last_polled_at: polledAt }).eq("id", order.id);
          continue;
        }

        // M3: monotonic guard — don't let a stale poll snapshot overwrite a newer
        // change already applied (e.g. by the realtime webhook).
        const changedAt: string | null =
          kcOrder.status_changed_at ?? kcOrder.updated_at ?? null;
        if (changedAt && order.keycrm_status_changed_at &&
            new Date(changedAt).getTime() < new Date(order.keycrm_status_changed_at).getTime()) {
          await adminClient.from("orders").update({ last_polled_at: polledAt }).eq("id", order.id);
          continue;
        }

        await adminClient
          .from("orders")
          .update({
            status: newStatus,
            keycrm_status_changed_at: changedAt ?? polledAt,
            last_polled_at: polledAt,
          })
          .eq("id", order.id);

        // Send push notification
        const { data: profile } = await adminClient
          .from("profiles")
          .select("expo_push_token, notification_order_status")
          .eq("id", order.user_id)
          .maybeSingle();

        if (profile?.expo_push_token && profile.notification_order_status !== false) {
          const label = STATUS_LABELS[newStatus];
          await sendExpoPush([
            buildPushMessage(
              profile.expo_push_token,
              "Статус замовлення",
              `Ваше замовлення ${label}.`,
              { orderId: order.id, screen: "order" },
            ),
          ], adminClient);
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
        // Best-effort cursor advance even on error.
        try { await adminClient.from("orders").update({ last_polled_at: polledAt }).eq("id", order.id); } catch { /* ignore */ }
      }
    }

    return jsonRes({ success: true, checked: orders.length, updated, results });
  } catch (err) {
    console.error("Poll error:", err);
    return jsonRes(safeError("poll-keycrm-statuses", err), 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
