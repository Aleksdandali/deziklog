import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { syncOrderToKeyCRM } from "../_shared/sync-logic.ts";
import { safeError } from "../_shared/safe-error.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let orderId: string | null = null;
  let userId: string | null = null;

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

    // User JWT only. The former x-cron-secret branch (trusting body.user_id /
    // body.user_email) is gone: its sole caller — the order-insert DB trigger —
    // was dropped in migration 20260609000005, and retry-failed-syncs imports
    // syncOrderToKeyCRM directly without HTTP.
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
    let userEmail = user.email;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Phone-first auth: auth.users.email is usually empty.
    // Use profile.email if user filled it during onboarding.
    if (!userEmail) {
      const { data: prof } = await adminClient
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.email) userEmail = prof.email;
    }

    const result = await syncOrderToKeyCRM(adminClient, orderId, userId, userEmail);

    if (!result.success) {
      // Full detail is persisted server-side in orders.keycrm_sync_error;
      // the client only needs to know the sync did not go through.
      return jsonRes(safeError("sync-order-to-keycrm", result.error, "Sync failed"), 502);
    }

    return jsonRes({
      success: true,
      keycrm_order_id: result.keycrm_order_id,
      np_ttn: result.np_ttn ?? null,
    });
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    if (orderId && userId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      // Owner-scoped: orderId comes from the request body, so without the
      // user_id filter a caller could mark a foreign order as failed.
      await adminClient.from("orders").update({
        keycrm_sync_status: "failed",
        keycrm_sync_error: msg.slice(0, 1000),
      }).eq("id", orderId).eq("user_id", userId);
    }
    return jsonRes(safeError("sync-order-to-keycrm", err, "Sync failed"), 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
