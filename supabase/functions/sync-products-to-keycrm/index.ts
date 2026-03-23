import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const KEYCRM_API_URL = "https://openapi.keycrm.app/v1";
const KEYCRM_API_KEY = Deno.env.get("KEYCRM_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: ONLY cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");

    if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to bypass RLS
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch all products with categories
    const { data: products, error } = await adminClient
      .from("products")
      .select("*, category:product_categories(name)")
      .eq("in_stock", true)
      .order("sort_order");

    if (error) {
      console.error("Failed to fetch products:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ synced: 0, message: "No products" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch import to KeyCRM (max 100 per request)
    let synced = 0;
    const batchSize = 100;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);

      const keycrmProducts = batch.map((p: any) => ({
        sku: p.id,
        name: p.name,
        price: p.price,
        description: p.description || "",
        category: p.category?.name || "",
        currency_code: "UAH",
        weight: 0.5,
        unit_type: "pc",
      }));

      const res = await fetch(`${KEYCRM_API_URL}/products/import`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEYCRM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(keycrmProducts),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("KeyCRM product import error:", data);
      } else {
        synced += batch.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced, total: products.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Product sync error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
