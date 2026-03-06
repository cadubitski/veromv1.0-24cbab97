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

    const res = await fetch(`${BILLING_URL}/functions/v1/billing-core/stripe/portal-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: BILLING_ANON,
        Authorization: `Bearer ${BILLING_ANON}`,
      },
      body: JSON.stringify({ customer_email, saas_key }),
    });

    const data = await res.json();
    console.log(`portal-link status: ${res.status}`, data);

    if (res.ok) {
      const url = data?.url || data?.portal_url || data?.portalUrl;
      if (url) {
        return new Response(
          JSON.stringify({ url }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Return the actual error from billing-core for better debugging
    const errorMsg = data?.error || data?.message || `Erro ${res.status} no billing-core`;
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: res.status >= 400 ? res.status : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-portal-link error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
