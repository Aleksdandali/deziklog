/**
 * AI Assistant for disinfection solution preparation.
 * Uses Claude API with official product instructions as context.
 *
 * Auth: requires valid user JWT (Bearer token).
 * Secrets: ANTHROPIC_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { SYSTEM_PROMPT } from "../_shared/system-prompt.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

/** Daily per-user cap. Counter resets at UTC midnight via DATE column. */
const DAILY_LIMIT = 30;

// Per-field input caps. The daily limit bounds CALL COUNT but not per-call
// size, so without these one allowed call can still carry near-max input
// tokens (cost amplification). Cap the message and each history item, and
// keep only the last N turns of context.
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_ITEM_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY не налаштовано в Supabase Secrets");
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ reply: "Помилка авторизації. Увійдіть в акаунт та спробуйте знову." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ reply: "Сесія закінчилась. Увійдіть в акаунт та спробуйте знову." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Per-user daily rate limit (caps Claude API spend per account).
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: usageCount, error: usageErr } = await adminClient
      .rpc("increment_ai_chat_usage", { p_user_id: user.id });
    if (!usageErr && typeof usageCount === "number" && usageCount > DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ reply: `Ви вичерпали денний ліміт запитів до ШІ-асистента (${DAILY_LIMIT}). Спробуйте завтра.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse request
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ reply: "Будь ласка, введіть повідомлення." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return new Response(
        JSON.stringify({ reply: `Повідомлення задовге (максимум ${MAX_MESSAGE_CHARS} символів). Будь ласка, скоротіть запит.` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build messages array with conversation history
    const messages: Array<{ role: string; content: string }> = [];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-MAX_HISTORY_ITEMS)) {
        // Whitelist role (Anthropic only accepts user/assistant) and cap each
        // item's length so echoed history can't inflate input-token cost.
        const role = msg?.role === "user" || msg?.role === "assistant" ? msg.role : null;
        if (role && typeof msg.content === "string" && msg.content) {
          messages.push({ role, content: msg.content.slice(0, MAX_HISTORY_ITEM_CHARS) });
        }
      }
    }

    messages.push({ role: "user", content: message });

    // Call Claude API with retry on 429
    const apiBody = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    });
    const apiHeaders = {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    };

    let response: Response | null = null;
    let responseText = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: apiHeaders,
        body: apiBody,
      });
      responseText = await response.text();

      if (response.status !== 429) break;
      // Wait before retry: 2s, 4s
      if (attempt < 2) await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
    }

    if (!response!.ok) {
      if (response!.status === 429) {
        return new Response(
          JSON.stringify({ reply: "Забагато запитів. Зачекайте хвилину і спробуйте ще раз." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Claude API ${response!.status}: ${responseText.slice(0, 300)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Невалідна відповідь від Claude API");
    }

    const reply = data.content?.[0]?.text;
    if (!reply) {
      throw new Error("Порожня відповідь від Claude API");
    }

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    // Log full detail server-side only; never leak internal/upstream error text
    // (env var names, raw Claude API body) to the client.
    console.error("[ai-assistant]", err);
    return new Response(
      JSON.stringify({ reply: "Сталася помилка. Спробуйте пізніше." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
