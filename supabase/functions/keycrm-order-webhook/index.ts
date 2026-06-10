/**
 * Webhook endpoint for KeyCRM order status changes.
 * When KeyCRM updates an order status, it calls this endpoint.
 * We update the order in Supabase and send a push notification to the user.
 *
 * KeyCRM payload (real shape): { "event": "...", "context": { "id", "status_id",
 * "status_changed_at", "updated_at", ... } }. KeyCRM CANNOT sign webhooks or send
 * custom headers — it can only append a static URL query param, so auth is the
 * shared secret via ?secret= (header also accepted for tests). Replay protection
 * (KeyCRM retries 3×) is done via the keycrm_webhook_events dedupe table.
 *
 * Register in KeyCRM as: <fn-url>?secret=<KEYCRM_WEBHOOK_SECRET>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { mapKeyCRMStatus, STATUS_LABELS } from "../_shared/keycrm-status.ts";
import { safeError } from "../_shared/safe-error.ts";

const WEBHOOK_SECRET = Deno.env.get("KEYCRM_WEBHOOK_SECRET");

function ack(message: string) {
  return new Response(JSON.stringify({ ok: true, message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: header OR ?secret= URL param (KeyCRM can only do the latter).
    // Never log the URL — it carries the secret.
    const url = new URL(req.url);
    const secret = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
    if (!secret || !WEBHOOK_SECRET || !timingSafeEqual(secret, WEBHOOK_SECRET)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    // KeyCRM nests the payload under `context`; tolerate a flat shape too.
    const ctx = body.context ?? body;
    const keycrmOrderId = ctx.id ?? body.order_id ?? body.id;
    const newStatus = mapKeyCRMStatus(ctx.status_id ?? ctx.status ?? body.status_id ?? body.status);
    const statusChangedAt: string | null = ctx.status_changed_at ?? ctx.updated_at ?? null;
    const eventId: string = body.event ?? "order.change_order_status";

    if (!keycrmOrderId) {
      return new Response(
        JSON.stringify({ error: "Missing order id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!newStatus) {
      // Unknown status → log and ack so KeyCRM doesn't keep retrying, but
      // don't pollute orders.status with raw IDs.
      console.warn("[keycrm-webhook] unknown status, skipping:", { keycrmOrderId, status_id: ctx.status_id });
      return ack("Unknown status, skipped");
    }

    // Use service role to update any order
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Replay/idempotency (H4): KeyCRM retries each event up to 3×. Dedupe on a
    // stable (order, status, change-time) key — insert-first so concurrent
    // retries collide on the PK and only one proceeds.
    const dedupeKey = `${keycrmOrderId}:${ctx.status_id ?? newStatus}:${statusChangedAt ?? ""}`;
    const { error: dupErr } = await supabase
      .from("keycrm_webhook_events")
      .insert({ dedupe_key: dedupeKey, keycrm_order_id: Number(keycrmOrderId) || null, event: eventId });
    if (dupErr) {
      // Unique violation (already processed) or transient DB error: ack so KeyCRM
      // stops retrying; the 5-min poller is the backstop for any missed event.
      return ack("Duplicate or already processed");
    }

    // Find order by keycrm_order_id
    const { data: order, error: findError } = await supabase
      .from("orders")
      .select("id, user_id, status, keycrm_status_changed_at")
      .eq("keycrm_order_id", keycrmOrderId)
      .maybeSingle();

    if (findError || !order) {
      return new Response(
        JSON.stringify({ error: "Order not found", keycrmOrderId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip if status hasn't changed
    if (order.status === newStatus) {
      return ack("Status unchanged");
    }

    // M3: monotonic guard — don't overwrite a newer change (e.g. from the poller)
    // with an older webhook event.
    if (statusChangedAt && order.keycrm_status_changed_at &&
        new Date(statusChangedAt).getTime() < new Date(order.keycrm_status_changed_at).getTime()) {
      return ack("Stale event, skipped");
    }

    // Update order status
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: newStatus, keycrm_status_changed_at: statusChangedAt ?? new Date().toISOString() })
      .eq("id", order.id);

    if (updateError) {
      throw new Error(`Failed to update order: ${updateError.message}`);
    }

    // Send push notification (best-effort; never blocks the 200 — see expo-push.ts)
    const { data: profile } = await supabase
      .from("profiles")
      .select("expo_push_token, notification_order_status")
      .eq("id", order.user_id)
      .maybeSingle();

    if (
      profile?.expo_push_token &&
      profile.notification_order_status !== false
    ) {
      const label = STATUS_LABELS[newStatus];
      const message = buildPushMessage(
        profile.expo_push_token,
        "Статус замовлення змінено",
        `Ваше замовлення ${label}.`,
        { orderId: order.id, screen: "order" },
      );
      await sendExpoPush([message], supabase);
    }

    return new Response(
      JSON.stringify({ ok: true, orderId: order.id, newStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify(safeError("keycrm-webhook", err)),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
