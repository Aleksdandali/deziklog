// Best-effort buyer lookup in KeyCRM by the authenticated user's phone.
// Used at onboarding to pre-fill name/email if the user is already a KeyCRM buyer.
// Never blocks onboarding: any failure returns { found: false }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/fetch-retry.ts";
import { redact } from "../_shared/redact.ts";
import { buyerPhones, phonesMatchE164 } from "../_shared/phone.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const TIMEOUT_MS = 5000;
/** Onboarding lookups are usually 1-2 per user. Anything above is abuse/loops. */
const DAILY_LOOKUP_LIMIT = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ found: false });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.phone) return jsonRes({ found: false });

    const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY");
    if (!KEYCRM_API_KEY) return jsonRes({ found: false });

    // Per-user daily lookup cap (protects KeyCRM API quota).
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: usageCount } = await adminClient
      .rpc("increment_keycrm_lookup_usage", { p_user_id: user.id });
    if (typeof usageCount === "number" && usageCount > DAILY_LOOKUP_LIMIT) {
      return jsonRes({ found: false });
    }

    // KeyCRM may store phones as E.164 or 380… — both normalize to the same
    // E.164 for verification. The bare-national 0XXXXXXXXX variant is DROPPED
    // (H5): filter[phone] is loose, so a national query could match a different
    // buyer and leak their name/email/address.
    const phoneE164 = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    const digits = phoneE164.replace(/\D/g, "");
    const variants = Array.from(new Set([phoneE164, digits]));

    let buyer: { id?: number; full_name?: string; email?: string; address?: string } | null = null;
    try {
      for (const v of variants) {
        if (!v) continue;
        const res = await fetchWithRetry(
          `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(v)}&limit=1&include=addresses`,
          {
            headers: {
              Authorization: `Bearer ${KEYCRM_API_KEY}`,
              Accept: "application/json",
            },
          },
          { timeoutMs: TIMEOUT_MS, retries: 2, label: "keycrm:buyer-lookup" },
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.data?.length > 0) {
          const b = data.data[0];
          // H5: only trust a buyer whose own phone equals the user's (E.164).
          if (!buyerPhones(b).some((p) => phonesMatchE164(p, phoneE164))) continue;
          // Prefer the explicit `city` field — full `address` may be the entire
          // delivery line ("Київ, вул. Лесі Українки, 23, кв. 5") and would look
          // wrong inside the form's "Місто" input.
          const addr0 = b.addresses?.[0];
          buyer = {
            id: b.id,
            full_name: b.full_name || undefined,
            email: b.email || undefined,
            address: addr0?.city || addr0?.address || undefined,
          };
          break;
        }
      }
    } catch (e) {
      console.warn("[lookup-keycrm-buyer] KeyCRM error:", redact((e as Error).message));
    }

    if (!buyer) return jsonRes({ found: false });

    // Cache buyer_id on profile so the first order skips the phone search entirely.
    if (buyer.id) {
      await adminClient.from("profiles")
        .update({ keycrm_buyer_id: buyer.id })
        .eq("id", user.id);
    }

    return jsonRes({
      found: true,
      full_name: buyer.full_name,
      email: buyer.email,
      address: buyer.address,
    });
  } catch (err) {
    console.warn("[lookup-keycrm-buyer] error:", redact((err as Error).message));
    return jsonRes({ found: false });
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
