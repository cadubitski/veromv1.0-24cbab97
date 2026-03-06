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
    const { customer_email, saas_key } = await req.json();

    if (!customer_email || !saas_key) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes: customer_email, saas_key" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try multiple possible endpoint paths for the billing-core portal link
    const endpoints = [
      `${BILLING_URL}/functions/v1/billing-core/stripe/portal-link`,
      `${BILLING_URL}/functions/v1/stripe-portal-link`,
      `${BILLING_URL}/functions/v1/portal-link`,
    ];

    let lastError = "";
    let lastStatus = 500;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: BILLING_ANON,
            Authorization: `Bearer ${BILLING_ANON}`,
          },
          body: JSON.stringify({ customer_email, saas_key }),
        });

        const data = await res.json();
        console.log(`Endpoint ${endpoint} status: ${res.status}`, data);

        if (res.ok) {
          const url = data?.url || data?.portal_url || data?.portalUrl;
          if (url) {
            return new Response(
              JSON.stringify({ url }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        lastError = data?.error || `Status ${res.status}`;
        lastStatus = res.status;
      } catch (e) {
        lastError = e.message;
      }
    }

    return new Response(
      JSON.stringify({ error: lastError || "Não foi possível obter o link do portal" }),
      { status: lastStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-portal-link error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
