/**
 * Delete user account and all associated data.
 * Apple App Store requires account deletion functionality.
 *
 * Auth: requires valid user JWT (Bearer token).
 * Uses service_role to delete user from auth + cascade data.
 *
 * Also anonymizes the linked KeyCRM buyer (GDPR Art.17 / privacy-policy
 * promise): KeyCRM has no DELETE /buyer endpoint, so we PUT a blanked
 * profile. Best-effort — KeyCRM downtime must never block the Apple-mandated
 * account deletion; failures land in admin_alerts for manual follow-up.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { safeError } from "../_shared/safe-error.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";

// Purge every object under `${userId}/…` from a private per-user bucket.
// Files live two levels deep (userId/<entityId>/<file>): cycle-photos holds
// userId/<sessionId>/before.jpg + userId/sterilizer/<id>.jpg, solution-photos
// holds userId/<solutionId>/photo.jpg. storage.list() returns at most `limit`
// entries per call, so both levels are paginated — a long-time user easily has
// >100 session folders, and an unpaginated purge would silently leave the rest.
async function purgeUserBucket(admin: SupabaseClient, bucket: string, userId: string) {
  const PAGE = 100;
  for (let folderOffset = 0; ; folderOffset += PAGE) {
    const { data: folders, error } = await admin.storage
      .from(bucket)
      .list(userId, { limit: PAGE, offset: folderOffset });
    if (error) throw new Error(`storage list ${bucket}: ${error.message}`);
    if (!folders?.length) break;

    for (const folder of folders) {
      for (let fileOffset = 0; ; fileOffset += PAGE) {
        const { data: files, error: listErr } = await admin.storage
          .from(bucket)
          .list(`${userId}/${folder.name}`, { limit: PAGE, offset: fileOffset });
        if (listErr) throw new Error(`storage list ${bucket}/${folder.name}: ${listErr.message}`);
        if (!files?.length) break;
        const { error: rmErr } = await admin.storage
          .from(bucket)
          .remove(files.map((f) => `${userId}/${folder.name}/${f.name}`));
        if (rmErr) throw new Error(`storage remove ${bucket}: ${rmErr.message}`);
        if (files.length < PAGE) break;
      }
    }
    if (folders.length < PAGE) break;
  }
}

// Blank the KeyCRM buyer record so the CRM stops holding name/phone/email of
// a deleted account. PUT is idempotent → safe to retry. Never throws.
async function anonymizeKeycrmBuyer(
  admin: SupabaseClient,
  buyerId: number,
  keycrmOrderIds: number[],
) {
  const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY");
  if (!KEYCRM_API_KEY) return;

  try {
    const res = await fetchWithRetry(`${KEYCRM_API_URL}/buyer/${buyerId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${KEYCRM_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      // Same field shape as the proven buyer-update call in sync-logic.ts.
      body: JSON.stringify({
        full_name: "Видалений акаунт",
        phone: "",
        email: "",
        note: `Акаунт видалено користувачем ${new Date().toISOString().slice(0, 10)} (запит на видалення даних)`,
      }),
    }, { timeoutMs: 8000, retries: 2, label: "keycrm:buyer-anonymize" });

    if (!res.ok) throw new Error(`KeyCRM ${res.status}`);
  } catch (e) {
    console.warn("[delete-account] buyer anonymize failed:", (e as Error).message);
    // Durable trail for manual erasure. No order_id FK — those rows are being
    // deleted; the KeyCRM ids in context are what the operator needs.
    const { error } = await admin.from("admin_alerts").insert({
      kind: "buyer_anonymize_failed",
      severity: "warn",
      message: `KeyCRM buyer ${buyerId} не анонімізовано при видаленні акаунта — потрібна ручна обробка`,
      context: { keycrm_buyer_id: buyerId, keycrm_order_ids: keycrmOrderIds },
    });
    if (error) console.error("[delete-account] admin_alert insert failed:", error.message);
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

    // Read the KeyCRM linkage BEFORE wiping profiles/orders — needed for the
    // third-party erasure step below.
    const { data: prof } = await adminClient
      .from("profiles")
      .select("keycrm_buyer_id")
      .eq("id", userId)
      .maybeSingle();

    // Delete user data in order (respecting foreign keys)
    // 1. Storage files — every private per-user bucket.
    await purgeUserBucket(adminClient, "cycle-photos", userId);
    await purgeUserBucket(adminClient, "solution-photos", userId);

    // 2. Order items (via orders)
    const { data: orders } = await adminClient
      .from("orders")
      .select("id, keycrm_order_id")
      .eq("user_id", userId);
    const keycrmOrderIds = (orders ?? [])
      .map((o: { keycrm_order_id: number | null }) => o.keycrm_order_id)
      .filter((id: number | null): id is number => id != null);
    if (orders?.length) {
      const orderIds = orders.map((o: { id: string }) => o.id);
      const { error } = await adminClient.from("order_items").delete().in("order_id", orderIds);
      if (error) throw new Error(`delete order_items: ${error.message}`);
    }

    // 3. Anonymize the KeyCRM buyer while profiles is still readable.
    //    Best-effort — never blocks the deletion (alerts on failure).
    if (prof?.keycrm_buyer_id) {
      await anonymizeKeycrmBuyer(adminClient, prof.keycrm_buyer_id, keycrmOrderIds);
    }

    // 4. All user-owned tables
    // Apple §5.1.1(v) and GDPR Art.17 require complete erasure of personal data.
    // Tables without ON DELETE CASCADE to auth.users must be deleted explicitly.
    // Every delete is checked: a silent partial wipe followed by auth-user
    // deletion would orphan the leftovers with no way for the user to retry.
    const deletions: Array<[string, string]> = [
      ["orders", "user_id"],
      ["sterilization_sessions", "user_id"],
      ["sterilizers", "user_id"],
      ["instruments", "user_id"],
      ["solutions", "user_id"],
      ["employees", "user_id"],
      ["ai_chat_usage", "user_id"],
      ["keycrm_lookup_usage", "user_id"],
      ["keycrm_history_usage", "user_id"],
      ["profiles", "id"],
    ];
    for (const [table, col] of deletions) {
      const { error } = await adminClient.from(table).delete().eq(col, userId);
      if (error) throw new Error(`delete ${table}: ${error.message}`);
    }

    // 5. Delete auth user — only after every data delete succeeded.
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
      JSON.stringify(safeError("delete-account", err, "Не вдалось видалити акаунт. Спробуйте ще раз.")),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
