import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { syncOrderToKeyCRM } from "../_shared/sync-logic.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";

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
    // Includes stale `syncing` claims (>2 min old) so a crashed worker
    // doesn't leave an order permanently stuck. Fresh `syncing` rows are
    // filtered out — the active worker will finish (or go stale) on its own.
    // Atomic re-claim happens inside syncOrderToKeyCRM via the claim RPC.
    const STALE_SYNC_MS = 2 * 60 * 1000;
    const { data: candidates, error } = await adminClient
      .from("orders")
      .select("id, user_id, keycrm_sync_attempts, keycrm_sync_status, keycrm_sync_started_at")
      .in("keycrm_sync_status", ["pending", "failed", "syncing"])
      .is("keycrm_order_id", null)
      .lt("keycrm_sync_attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      return jsonRes({ success: true, retried: 0, message: error.message });
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
      // Increment attempts
      await adminClient
        .from("orders")
        .update({ keycrm_sync_attempts: (order.keycrm_sync_attempts || 0) + 1 })
        .eq("id", order.id);

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
        } else {
          failed++;
          console.warn(`Sync failed: order ${order.id.slice(0, 8)} — ${result.error}`);
        }
        results.push({ order_id: order.id.slice(0, 8), ...result });
      } catch (e) {
        failed++;
        const msg = (e as Error).message;
        console.error(`Sync error: order ${order.id.slice(0, 8)}:`, msg);
        // Mark failed
        await adminClient.from("orders").update({
          keycrm_sync_status: "failed",
          keycrm_sync_error: msg.slice(0, 1000),
        }).eq("id", order.id);
        results.push({ order_id: order.id.slice(0, 8), success: false, error: msg });
      }

      // Small delay
      await new Promise((r) => setTimeout(r, 500));
    }

    return jsonRes({ success: true, total: orders.length, retried, failed, results });
  } catch (err) {
    console.error("Retry cron error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
