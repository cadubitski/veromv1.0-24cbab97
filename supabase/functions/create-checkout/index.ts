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
    const { email, price_id, success_url, cancel_url } = await req.json();

    if (!email || !price_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes: email, price_id, success_url, cancel_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${BILLING_URL}/functions/v1/billing-core/stripe/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: BILLING_ANON,
        Authorization: `Bearer ${BILLING_ANON}`,
      },
      body: JSON.stringify({ email, priceId: price_id, successUrl: success_url, cancelUrl: cancel_url }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data?.error || "Erro ao criar sessão de checkout" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // billing-core may return url, checkout_url, sessionUrl, etc.
    const url = data?.url || data?.checkout_url || data?.sessionUrl || data?.session_url || data?.checkoutUrl;
    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL de checkout não retornada", debug: data }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
