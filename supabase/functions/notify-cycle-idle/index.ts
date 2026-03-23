/**
 * Cron job: smart push notifications for sterilization & solutions.
 * Should be called once per day (e.g. at 19:00) via pg_cron or external scheduler.
 *
 * 1. No sterilization today — evening reminder
 * 2. Solution expires in 3 days — warning
 * 3. Solution expired — alert to prepare new one
 *
 * Invoke via: POST /functions/v1/notify-cycle-idle
 * Auth: requires CRON_SECRET header or service role key
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sendExpoPush, buildPushMessage } from "../_shared/expo-push.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
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

    // Get all users with push tokens
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, expo_push_token, name, notification_cycle_idle")
      .not("expo_push_token", "is", null);

    if (profilesError || !profiles?.length) {
      return new Response(
        JSON.stringify({ ok: true, notified: 0, reason: "No eligible users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const messages: ReturnType<typeof buildPushMessage>[] = [];
    let cycleReminders = 0;
    let solutionWarnings = 0;
    let solutionExpired = 0;

    for (const profile of profiles) {
      // ── 1. No sterilization today ──────────────────
      if (profile.notification_cycle_idle) {
        const { data: todaySessions } = await supabase
          .from("sterilization_sessions")
          .select("id")
          .eq("user_id", profile.id)
          .gte("created_at", todayStart)
          .limit(1);

        if (!todaySessions?.length) {
          messages.push(
            buildPushMessage(
              profile.expo_push_token,
              "Нагадування про стерилізацію",
              "Ви сьогодні не проводили стерилізацію. Не забувайте про безпеку інструментів!",
              { screen: "journal" },
            ),
          );
          cycleReminders++;
        }
      }

      // ── 2 & 3. Solution expiring / expired ─────────
      const { data: solutions } = await supabase
        .from("solutions")
        .select("id, name, expires_at")
        .eq("user_id", profile.id);

      if (solutions?.length) {
        for (const sol of solutions) {
          const expiresAt = new Date(sol.expires_at);
          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

          if (daysLeft <= 0) {
            // ── 3. Expired ──
            messages.push(
              buildPushMessage(
                profile.expo_push_token,
                "Розчин протермінований",
                `${sol.name} — термін дії закінчився. Приготуйте новий розчин.`,
                { screen: "journal" },
              ),
            );
            solutionExpired++;
          } else if (daysLeft <= 3) {
            // ── 2. Expiring soon ──
            messages.push(
              buildPushMessage(
                profile.expo_push_token,
                "Розчин закінчується",
                `${sol.name} — залишилось ${daysLeft} ${daysLeft === 1 ? 'день' : daysLeft <= 4 ? 'дні' : 'днів'}. Перевірте стан розчину.`,
                { screen: "journal" },
              ),
            );
            solutionWarnings++;
          }
        }
      }
    }

    // Send in batches of 100
    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      await sendExpoPush(batch);
      sent += batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent,
        checked: profiles.length,
        cycleReminders,
        solutionWarnings,
        solutionExpired,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
