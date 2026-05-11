// Best-effort buyer lookup in KeyCRM by the authenticated user's phone.
// Used at onboarding to pre-fill name/email if the user is already a KeyCRM buyer.
// Never blocks onboarding: any failure returns { found: false }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const TIMEOUT_MS = 5000;

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

    // KeyCRM may store phones in mixed formats; try E.164, 380…, 0… variants.
    const phoneE164 = user.phone.startsWith("+") ? user.phone : `+${user.phone}`;
    const digits = phoneE164.replace(/\D/g, "");
    const variants = Array.from(new Set([phoneE164, digits, digits.slice(2)]));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let buyer: { id?: number; full_name?: string; email?: string; address?: string } | null = null;
    try {
      for (const v of variants) {
        if (!v) continue;
        const res = await fetch(
          `${KEYCRM_API_URL}/buyer?filter[phone]=${encodeURIComponent(v)}&limit=1&include=addresses`,
          {
            headers: {
              Authorization: `Bearer ${KEYCRM_API_KEY}`,
              Accept: "application/json",
            },
            signal: ctrl.signal,
          },
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.data?.length > 0) {
          const b = data.data[0];
          buyer = {
            id: b.id,
            full_name: b.full_name || undefined,
            email: b.email || undefined,
            address: b.addresses?.[0]?.address || b.addresses?.[0]?.city || undefined,
          };
          break;
        }
      }
    } catch (e) {
      console.warn("[lookup-keycrm-buyer] KeyCRM error:", (e as Error).message);
    } finally {
      clearTimeout(timer);
    }

    if (!buyer) return jsonRes({ found: false });

    // Cache buyer_id on profile so the first order skips the phone search entirely.
    if (buyer.id) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
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
    console.warn("[lookup-keycrm-buyer] error:", (err as Error).message);
    return jsonRes({ found: false });
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
