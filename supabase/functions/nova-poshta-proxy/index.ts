import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const NP_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NP_API_KEY = Deno.env.get("NOVA_POSHTA_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, query, cityRef } = await req.json();

    if (action === "searchCities") {
      const npRes = await fetch(NP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: NP_API_KEY,
          modelName: "Address",
          calledMethod: "searchSettlements",
          methodProperties: {
            CityName: query || "",
            Limit: "20",
            Page: "1",
          },
        }),
      });

      const npData = await npRes.json();
      const addresses = npData.data?.[0]?.Addresses || [];
      const cities = addresses.map((a: any) => ({
        ref: a.DeliveryCity,
        name: a.Present,
        region: a.Region,
      }));

      return new Response(JSON.stringify({ cities }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "getWarehouses") {
      if (!cityRef) {
        return new Response(JSON.stringify({ error: "cityRef required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const npRes = await fetch(NP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: NP_API_KEY,
          modelName: "Address",
          calledMethod: "getWarehouses",
          methodProperties: {
            CityRef: cityRef,
            Limit: "500",
            Page: "1",
          },
        }),
      });

      const npData = await npRes.json();
      const warehouses = (npData.data || []).map((w: any) => ({
        ref: w.Ref,
        description: w.Description,
        number: w.Number,
      }));

      return new Response(JSON.stringify({ warehouses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("NP proxy error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
