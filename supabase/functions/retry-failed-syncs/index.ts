import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { syncOrderToKeyCRM } from "../_shared/sync-logic.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";
import { redact } from "../_shared/redact.ts";
import { safeError } from "../_shared/safe-error.ts";

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: ONLY cron secret (no anon/user access)
    const authSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");

    if (!authSecret || !expectedSecret || !timingSafeEqual(authSecret, expectedSecret)) {
      return jsonRes({ error: "Unauthorized" }, 403);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find orders needing retry.
    // - keycrm_order_id IS NULL: not yet synced.
    // - status pending/failed/syncing: 'failed_permanent' (terminal) and
    //   'order_created*' (KeyCRM order exists) are intentionally excluded.
    // - attempts < MAX: give up after MAX_ATTEMPTS (now incremented atomically
    //   inside the claim RPC, so no JS increment here).
    // - keycrm_next_retry_at gate: respect the exponential backoff the claim RPC
    //   sets; NULL = never attempted → eligible immediately. This also naturally
    //   excludes a fresh 'syncing' claim (its next_retry_at is in the future).
    const STALE_SYNC_MS = 2 * 60 * 1000;
    const nowIso = new Date().toISOString();
    const { data: candidates, error } = await adminClient
      .from("orders")
      .select("id, user_id, keycrm_sync_attempts, keycrm_sync_status, keycrm_sync_started_at")
      .in("keycrm_sync_status", ["pending", "failed", "syncing"])
      .is("keycrm_order_id", null)
      .lt("keycrm_sync_attempts", MAX_ATTEMPTS)
      .or(`keycrm_next_retry_at.is.null,keycrm_next_retry_at.lte.${nowIso}`)
      .order("keycrm_next_retry_at", { ascending: true, nullsFirst: true })
      .limit(20);

    if (error) {
      // L1: a SELECT failure must be visible to monitoring — 500, not 200.
      console.error("[retry-failed-syncs] candidate query failed:", error.message);
      return jsonRes({ success: false, retried: 0, error: error.message }, 500);
    }

    const now = Date.now();
    const orders = (candidates ?? []).filter((o) => {
      if (o.keycrm_sync_status !== "syncing") return true;
      if (!o.keycrm_sync_started_at) return true;
      return now - new Date(o.keycrm_sync_started_at).getTime() > STALE_SYNC_MS;
    }).slice(0, 10);

    if (!orders.length) {
      return jsonRes({ success: true, retried: 0, message: "No orders to retry" });
    }

    let retried = 0;
    let failed = 0;
    const results: any[] = [];

    for (const order of orders) {
      // NOTE: attempts are incremented atomically inside claim_order_for_keycrm_sync
      // (called within syncOrderToKeyCRM) — do NOT increment here (would double-count).

      // Get user email (phone-first auth: prefer profile.email, fall back to auth.users.email for legacy)
      let userEmail: string | undefined;
      try {
        const { data: prof } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", order.user_id)
          .maybeSingle();
        if (prof?.email) userEmail = prof.email;
        if (!userEmail) {
          const { data: authUser } = await adminClient.auth.admin.getUserById(order.user_id);
          userEmail = authUser?.user?.email ?? undefined;
        }
      } catch { /* ok */ }

      try {
        const result = await syncOrderToKeyCRM(adminClient, order.id, order.user_id, userEmail);
        if (result.success) {
          retried++;
          console.log(`Sync OK: order ${order.id.slice(0, 8)} → KeyCRM #${result.keycrm_order_id}`);
        } else if (result.in_progress) {
          // Another worker holds the claim — not a failure, don't escalate.
          console.log(`Sync in-progress elsewhere: order ${order.id.slice(0, 8)}`);
        } else {
          failed++;
          console.warn(`Sync failed: order ${order.id.slice(0, 8)} — ${result.error}`);
          await escalateIfTerminal(adminClient, order.id, result.error ?? "unknown");
        }
        results.push({ order_id: order.id.slice(0, 8), ...result });
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        console.error(`Sync error: order ${order.id.slice(0, 8)}:`, msg);
        await adminClient.from("orders").update({
          keycrm_sync_status: "failed",
          keycrm_sync_error: msg.slice(0, 1000),
        }).eq("id", order.id);
        await escalateIfTerminal(adminClient, order.id, msg);
        results.push({ order_id: order.id.slice(0, 8), success: false, error: msg });
      }

      // Small delay
      await new Promise((r) => setTimeout(r, 500));
    }

    return jsonRes({ success: true, total: orders.length, retried, failed, results });
  } catch (err) {
    console.error("Retry cron error:", err);
    return jsonRes(safeError("retry-failed-syncs", err), 500);
  }
});

/**
 * H2 dead-letter: once an order has burned all MAX_ATTEMPTS and still has no
 * KeyCRM id, flip it to the terminal 'failed_permanent' state, record a durable
 * admin_alert, and best-effort push the operators — so a paid order can never be
 * silently abandoned.
 */
async function escalateIfTerminal(admin: SupabaseClient, orderId: string, errMsg: string) {
  const { data: cur } = await admin
    .from("orders")
    .select("keycrm_sync_attempts, keycrm_order_id, keycrm_sync_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!cur || cur.keycrm_order_id) return; // actually synced meanwhile — ignore
  if ((cur.keycrm_sync_attempts ?? 0) < MAX_ATTEMPTS) return; // more retries left
  if (cur.keycrm_sync_status === "failed_permanent") return; // already escalated

  await admin.from("orders")
    .update({ keycrm_sync_status: "failed_permanent" })
    .eq("id", orderId);

  await admin.from("admin_alerts").insert({
    kind: "order_sync_failed_permanent",
    severity: "error",
    order_id: orderId,
    message: `Замовлення ${orderId.slice(0, 8)} не синхронізувалося з KeyCRM після ${MAX_ATTEMPTS} спроб`,
    context: { error: redact(errMsg) },
  });

  // Best-effort operator push (never throws — see expo-push.ts).
  try {
    const { data: admins } = await admin.from("admins").select("user_id");
    const ids = (admins ?? []).map((a: { user_id: string }) => a.user_id);
    if (ids.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("expo_push_token")
        .in("id", ids)
        .not("expo_push_token", "is", null);
      const msgs = (profs ?? [])
        .filter((p: { expo_push_token: string | null }) => p.expo_push_token)
        .map((p: { expo_push_token: string }) =>
          buildPushMessage(
            p.expo_push_token,
            "Помилка синхронізації замовлення",
            `Замовлення ${orderId.slice(0, 8)} застрягло після ${MAX_ATTEMPTS} спроб.`,
            { screen: "admin_alerts", orderId },
          )
        );
      if (msgs.length) await sendExpoPush(msgs, admin);
    }
  } catch (e) {
    console.warn("[retry-failed-syncs] alert push failed:", (e as Error).message);
  }
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
