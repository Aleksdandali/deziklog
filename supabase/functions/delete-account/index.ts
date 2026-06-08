/**
 * Delete user account and all associated data.
 * Apple App Store requires account deletion functionality.
 *
 * Auth: requires valid user JWT (Bearer token).
 * Uses service_role to delete user from auth + cascade data.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Purge every object under `${userId}/…` from a private per-user bucket.
// Files live two levels deep (userId/<entityId>/<file>): cycle-photos holds
// userId/<sessionId>/before.jpg + userId/sterilizer/<id>.jpg, solution-photos
// holds userId/<solutionId>/photo.jpg.
async function purgeUserBucket(admin: SupabaseClient, bucket: string, userId: string) {
  const { data: folders } = await admin.storage.from(bucket).list(userId);
  if (!folders?.length) return;
  for (const folder of folders) {
    const { data: files } = await admin.storage.from(bucket).list(`${userId}/${folder.name}`);
    if (files?.length) {
      await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${folder.name}/${f.name}`));
    }
  }
}

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
    // 1. Storage files — every private per-user bucket.
    await purgeUserBucket(adminClient, "cycle-photos", userId);
    await purgeUserBucket(adminClient, "solution-photos", userId);

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
    // Apple §5.1.1(v) and GDPR Art.17 require complete erasure of personal data.
    // Tables without ON DELETE CASCADE to auth.users must be deleted explicitly.
    await adminClient.from("orders").delete().eq("user_id", userId);
    await adminClient.from("sterilization_sessions").delete().eq("user_id", userId);
    await adminClient.from("sterilizers").delete().eq("user_id", userId);
    await adminClient.from("instruments").delete().eq("user_id", userId);
    await adminClient.from("solutions").delete().eq("user_id", userId);
    await adminClient.from("employees").delete().eq("user_id", userId);
    await adminClient.from("ai_chat_usage").delete().eq("user_id", userId);
    await adminClient.from("keycrm_lookup_usage").delete().eq("user_id", userId);
    await adminClient.from("keycrm_history_usage").delete().eq("user_id", userId);
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
