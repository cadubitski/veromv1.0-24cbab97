const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BILLING_URL = "https://rdkrgtkuevzlvxzsyzrb.supabase.co/functions/v1/billing-core";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const billingServiceKey = Deno.env.get("BILLING_SUPABASE_SERVICE_ROLE_KEY");
    if (!billingServiceKey) {
      return new Response(
        JSON.stringify({ error: "BILLING_SUPABASE_SERVICE_ROLE_KEY não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, price_id, success_url, cancel_url } = await req.json();

    if (!email || !price_id || !success_url || !cancel_url) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes: email, price_id, success_url, cancel_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${BILLING_URL}/stripe/create-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": billingServiceKey,
        "Authorization": `Bearer ${billingServiceKey}`,
      },
      body: JSON.stringify({ email, priceId: price_id, successUrl: success_url, cancelUrl: cancel_url, saasKey: "verom" }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data?.error || "Erro ao criar sessão de checkout" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
