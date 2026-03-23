/**
 * Cron function: retries failed/pending KeyCRM order syncs.
 * Run every 10 minutes via Supabase Cron or external scheduler.
 *
 * Max 5 attempts per order. After that, stays "failed" for manual review.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: accept cron secret or service role
    const authSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");

    if (!authSecret && !authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (authSecret && expectedSecret && authSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find orders that need retry
    const { data: orders, error } = await adminClient
      .from("orders")
      .select("id, user_id, keycrm_sync_attempts")
      .in("keycrm_sync_status", ["pending", "failed"])
      .is("keycrm_order_id", null)
      .lt("keycrm_sync_attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("Failed to fetch orders:", error);
      return new Response(JSON.stringify({ error: "DB query failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, retried: 0, message: "No orders to retry" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let retried = 0;
    let failed = 0;

    for (const order of orders) {
      // Increment attempt counter
      await adminClient
        .from("orders")
        .update({ keycrm_sync_attempts: (order.keycrm_sync_attempts || 0) + 1 })
        .eq("id", order.id);

      // Get user email for sync
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", order.user_id)
        .single();

      const { data: authUser } = await adminClient.auth.admin.getUserById(order.user_id);

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-order-to-keycrm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            order_id: order.id,
            user_id: order.user_id,
            user_email: authUser?.user?.email || undefined,
            _service_role: true,
          }),
        });

        if (res.ok) {
          retried++;
          console.log(`Retry OK: order ${order.id.slice(0, 8)}`);
        } else {
          failed++;
          const errText = await res.text();
          console.warn(`Retry failed: order ${order.id.slice(0, 8)} — ${errText.slice(0, 200)}`);
        }
      } catch (e) {
        failed++;
        console.error(`Retry error: order ${order.id.slice(0, 8)}:`, e);
      }

      // Small delay between retries to avoid rate limits
      await new Promise((r) => setTimeout(r, 1000));
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: orders.length,
        retried,
        failed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Retry cron error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
