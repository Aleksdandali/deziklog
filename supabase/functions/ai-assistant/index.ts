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

    // Parse request
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ reply: "Будь ласка, введіть повідомлення." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build messages array with conversation history
    const messages: Array<{ role: string; content: string }> = [];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: message });

    // Call Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ reply: "Забагато запитів. Зачекайте хвилину і спробуйте ще раз." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Claude API ${response.status}: ${responseText.slice(0, 300)}`);
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
    return new Response(
      JSON.stringify({ reply: `Помилка: ${(err as Error).message}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
