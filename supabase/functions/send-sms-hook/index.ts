// Supabase Auth → Send SMS Hook.
// Routes OTP messages through SMSFly (sms-fly.ua) v2 JSON API.
//
// Required env:
//   SMSFLY_API_KEY        - SMSFly API key
//   SMSFLY_SOURCE         - alpha-name / sender (e.g. "InfoCenter")
//   SEND_SMS_HOOK_SECRET  - "v1,whsec_<base64>" from Supabase Dashboard

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const SMSFLY_ENDPOINT = "https://sms-fly.ua/api/v2/api.php";

interface SmsHookPayload {
  user: { phone?: string };
  sms: { otp: string; phone?: string };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Deno.env.get("SMSFLY_API_KEY");
  const source = Deno.env.get("SMSFLY_SOURCE") || "InfoCenter";
  const hookSecretRaw = Deno.env.get("SEND_SMS_HOOK_SECRET");

  if (!apiKey || !hookSecretRaw) {
    console.error("send-sms-hook: missing SMSFLY_API_KEY or SEND_SMS_HOOK_SECRET");
    return new Response(JSON.stringify({ error: { message: "Server misconfigured" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Standard Webhooks signature verification
  const body = await req.text();
  const headers = Object.fromEntries(req.headers);
  const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");

  let payload: SmsHookPayload;
  try {
    const wh = new Webhook(hookSecret);
    payload = wh.verify(body, headers) as SmsHookPayload;
  } catch (err) {
    console.error("send-sms-hook: signature verification failed", (err as Error).message);
    return new Response(JSON.stringify({ error: { message: "Invalid signature" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const phone = (payload.sms?.phone || payload.user?.phone || "").replace(/^\+/, "");
  const otp = payload.sms?.otp;

  if (!phone || !otp) {
    return new Response(JSON.stringify({ error: { message: "phone/otp missing" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const smsBody = {
    auth: { key: apiKey },
    action: "SENDMESSAGE",
    data: {
      recipient: phone,
      channels: ["sms"],
      sms: {
        source,
        ttl: 300,
        text: `Dezik: код ${otp}. Не передавайте його нікому.`,
      },
    },
  };

  try {
    const resp = await fetch(SMSFLY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(smsBody),
    });
    const respJson = await resp.json().catch(() => ({}));

    // SMSFly responds with { success: 1, ... } or { success: 0, error: {...} }
    if (!resp.ok || respJson?.success !== 1) {
      // GoTrue surfaces this hook's error message to the end client — keep it
      // generic; the provider's internal description stays in the logs above.
      console.error("send-sms-hook: SMSFly failure", resp.status, JSON.stringify(respJson).slice(0, 500));
      return new Response(
        JSON.stringify({ error: { message: "SMS send failed" } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-sms-hook: fetch error", (err as Error).message);
    return new Response(
      JSON.stringify({ error: { message: "SMS send failed" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
