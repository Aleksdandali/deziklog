/**
 * Cron job: notify users who haven't run a sterilization cycle in 2+ days.
 * Should be called once per day (e.g. at 10:00 AM) via pg_cron or external scheduler.
 *
 * Invoke via: POST /functions/v1/notify-cycle-idle
 * Auth: requires CRON_SECRET header or service role key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const IDLE_DAYS = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check — accept cron secret or service role key
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = req.headers.get("x-cron-secret") || "";

    if (CRON_SECRET && cronSecret !== CRON_SECRET && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "___")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all users with push tokens and idle notification enabled
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, expo_push_token, name")
      .eq("notification_cycle_idle", true)
      .not("expo_push_token", "is", null);

    if (profilesError || !profiles?.length) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, reason: "No eligible users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - IDLE_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    const messages = [];

    for (const profile of profiles) {
      // Check if user has any session in the last IDLE_DAYS
      const { data: recentSessions } = await supabase
        .from("sterilization_sessions")
        .select("id")
        .eq("user_id", profile.id)
        .gte("created_at", cutoffISO)
        .limit(1);

      // If no recent sessions — user is idle, send reminder
      if (!recentSessions?.length) {
        messages.push(
          buildPushMessage(
            profile.expo_push_token,
            "Час для стерилізації",
            `Ви не проводили стерилізацію вже ${IDLE_DAYS} дні. Не забувайте про безпеку!`,
            { screen: "journal" },
          ),
        );
      }
    }

    // Send in batches of 100 (Expo limit)
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await sendExpoPush(batch);
      sent += batch.length;
    }

    return new Response(
      JSON.stringify({ ok: true, notified: sent, checked: profiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
