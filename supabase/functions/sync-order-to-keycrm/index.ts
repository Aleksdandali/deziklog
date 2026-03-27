import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { syncOrderToKeyCRM } from "../_shared/sync-logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let orderId: string | null = null;

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

    // Auth: user JWT or cron secret (for retry)
    let userId: string;
    let userEmail: string | undefined;

    const cronSecret = req.headers.get("x-cron-secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    const isCron = cronSecret && expectedCronSecret && cronSecret === expectedCronSecret;

    if (isCron) {
      userId = body.user_id;
      userEmail = body.user_email;
      if (!userId) {
        return jsonRes({ error: "user_id required for cron calls" }, 400);
      }
    } else {
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
      userEmail = user.email;
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await syncOrderToKeyCRM(adminClient, orderId, userId, userEmail);

    if (!result.success) {
      return jsonRes({ error: result.error }, 502);
    }

    return jsonRes({
      success: true,
      keycrm_order_id: result.keycrm_order_id,
      np_ttn: result.np_ttn ?? null,
    });
  } catch (err) {
    const msg = (err as Error).message || "Unknown error";
    console.error("Sync error:", msg);
    if (orderId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await adminClient.from("orders").update({
        keycrm_sync_status: "failed",
        keycrm_sync_error: msg.slice(0, 1000),
      }).eq("id", orderId);
    }
    return jsonRes({ error: "Internal error", message: msg }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
