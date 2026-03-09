const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BILLING_URL = "https://idrjkzqgmvooqiegandx.supabase.co";
const BILLING_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcmprenFnbXZvb3FpZWdhbmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgwMzI1ODAsImV4cCI6MjAyMzYwODU4MH0.kzrEyOz3JBrSzJHjSFDrN8cqMmjcxAl1MZnfTy2JL8s";
const SAAS_KEY = "verom"; // Identificador deste produto no billing-core

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer_email } = await req.json();

    if (!customer_email) {
      return new Response(
        JSON.stringify({ error: "customer_email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(
      `${BILLING_URL}/functions/v1/billing-core/protected/data?saas_key=${encodeURIComponent(SAAS_KEY)}&customer_email=${encodeURIComponent(customer_email)}`,
      {
        headers: {
          apikey: BILLING_ANON,
          Authorization: `Bearer ${BILLING_ANON}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`billing-core status query failed: ${res.status}`);
      return new Response(
        JSON.stringify({ status: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    // /protected/data retorna array ou objeto com a subscription
    const subscription = Array.isArray(data) && data.length > 0 ? data[0] : (data ?? null);

    return new Response(
      JSON.stringify({
        status: subscription?.status ?? null,
        customer_email,
        saas_key: SAAS_KEY,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-billing-status error:", err);
    return new Response(
      JSON.stringify({ status: null, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
