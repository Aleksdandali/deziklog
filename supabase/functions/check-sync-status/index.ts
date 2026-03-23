import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { syncOrderToKeyCRM } from "../_shared/sync-logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));

  // Reset attempts for all failed orders
  if (body.reset === true) {
    await adminClient
      .from("orders")
      .update({ keycrm_sync_status: "pending", keycrm_sync_attempts: 0, keycrm_sync_error: null })
      .eq("keycrm_sync_status", "failed");
    return jsonRes({ done: "reset all failed to pending" });
  }

  // Test sync one order directly
  if (body.test_order_id) {
    const { data: order } = await adminClient
      .from("orders")
      .select("id, user_id")
      .eq("id", body.test_order_id)
      .single();
    if (!order) return jsonRes({ error: "Order not found" });

    let userEmail: string | undefined;
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(order.user_id);
      userEmail = authUser?.user?.email;
    } catch {}

    const result = await syncOrderToKeyCRM(adminClient, order.id, order.user_id, userEmail);
    return jsonRes(result);
  }

  // Default: list orders
  const { data: orders } = await adminClient
    .from("orders")
    .select("id, status, keycrm_order_id, keycrm_sync_status, keycrm_sync_error, keycrm_sync_attempts, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return jsonRes(orders);
});

function jsonRes(data: any) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
