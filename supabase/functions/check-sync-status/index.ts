import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({}));

  // If test_order_id provided, try syncing that order directly
  if (body.test_order_id) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get order user_id
    const { data: order } = await adminClient
      .from("orders")
      .select("id, user_id")
      .eq("id", body.test_order_id)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const { data: authUser } = await adminClient.auth.admin.getUserById(order.user_id);

    const syncPayload = {
      order_id: order.id,
      user_id: order.user_id,
      user_email: authUser?.user?.email || undefined,
      _service_role: true,
    };

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-order-to-keycrm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(syncPayload),
      });

      const resText = await res.text();
      return new Response(JSON.stringify({
        sync_status: res.status,
        sync_response: resText,
        payload_sent: { ...syncPayload, user_email: "***" },
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Default: list orders
  const { data: orders } = await adminClient
    .from("orders")
    .select("id, status, keycrm_order_id, keycrm_sync_status, keycrm_sync_error, keycrm_sync_attempts, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return new Response(JSON.stringify(orders, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
