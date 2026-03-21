/**
 * Delete user account and all associated data.
 * Apple App Store requires account deletion functionality.
 *
 * Auth: requires valid user JWT (Bearer token).
 * Uses service_role to delete user from auth + cascade data.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No auth header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify the user's JWT to get their ID
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = user.id;

    // Use service role to delete all user data
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Delete user data in order (respecting foreign keys)
    // 1. Storage files
    const { data: photos } = await adminClient.storage
      .from("cycle-photos")
      .list(userId);
    if (photos?.length) {
      for (const folder of photos) {
        const { data: files } = await adminClient.storage
          .from("cycle-photos")
          .list(`${userId}/${folder.name}`);
        if (files?.length) {
          const paths = files.map((f) => `${userId}/${folder.name}/${f.name}`);
          await adminClient.storage.from("cycle-photos").remove(paths);
        }
      }
    }

    // 2. Order items (via orders)
    const { data: orders } = await adminClient
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    if (orders?.length) {
      const orderIds = orders.map((o: { id: string }) => o.id);
      await adminClient.from("order_items").delete().in("order_id", orderIds);
    }

    // 3. All user-owned tables
    await adminClient.from("orders").delete().eq("user_id", userId);
    await adminClient.from("sterilization_sessions").delete().eq("user_id", userId);
    await adminClient.from("sterilizers").delete().eq("user_id", userId);
    await adminClient.from("instruments").delete().eq("user_id", userId);
    await adminClient.from("profiles").delete().eq("id", userId);

    // 4. Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Failed to delete auth user: ${deleteError.message}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
