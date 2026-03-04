const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BILLING_URL = "https://idrjkzqgmvooqiegandx.supabase.co";
const BILLING_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcmprenFnbXZvb3FpZWdhbmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgwMzI1ODAsImV4cCI6MjAyMzYwODU4MH0.kzrEyOz3JBrSzJHjSFDrN8cqMmjcxAl1MZnfTy2JL8s";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_email, saas_key, success_url, cancel_url } = await req.json();

    if (!customer_email || !saas_key || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = JSON.stringify({ customer_email, saas_key, success_url, cancel_url });
    const headers = {
      "Content-Type": "application/json",
      apikey: BILLING_ANON,
      Authorization: `Bearer ${BILLING_ANON}`,
    };

    // Try multiple possible endpoint names
    const endpoints = [
      "/functions/v1/billing-core/stripe/checkout-link",
      "/functions/v1/billing-core/stripe/create-checkout",
      "/functions/v1/billing-core/stripe/checkout",
      "/functions/v1/billing-core/stripe/checkout-session",
      "/functions/v1/billing-core/checkout",
    ];

    let lastError = "";
    let lastBody = "";
    for (const endpoint of endpoints) {
      const res = await fetch(`${BILLING_URL}${endpoint}`, {
        method: "POST",
        headers,
        body,
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      // If it's not a "route not found" error, this is the right endpoint
      if (res.ok || !data?.error?.startsWith("Route not found")) {
        if (data?.url || data?.checkout_url || data?.sessionUrl || data?.session_url) {
          const url = data.url || data.checkout_url || data.sessionUrl || data.session_url;
          return new Response(
            JSON.stringify({ url }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Return whatever the billing-core returned so we can debug
        return new Response(
          JSON.stringify({ debug_endpoint: endpoint, status: res.status, data }),
          { status: res.ok ? 200 : res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      lastError = data?.error || text;
      lastBody = text;
    }

    return new Response(
      JSON.stringify({ error: "Endpoint de checkout não encontrado no billing-core", lastError, lastBody }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
