const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "Stripe não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Busca o customer pelo email no Stripe
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=email:'${encodeURIComponent(customer_email)}'&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    const searchData = await searchRes.json();
    console.log("Stripe customer search:", searchRes.status, searchData);

    if (!searchRes.ok) {
      return new Response(
        JSON.stringify({ error: searchData?.error?.message ?? "Erro ao buscar cliente no Stripe" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customer = searchData?.data?.[0];
    if (!customer) {
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado no Stripe para este e-mail" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Cria a sessão do Customer Portal
    const origin = req.headers.get("origin") || "https://verom.lovable.app";
    const returnUrl = `${origin}/admin/financeiro`;

    const portalBody = new URLSearchParams({
      customer: customer.id,
      return_url: returnUrl,
    });

    const portalRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: portalBody.toString(),
    });

    const portalData = await portalRes.json();
    console.log("Stripe portal session:", portalRes.status, portalData);

    if (!portalRes.ok) {
      return new Response(
        JSON.stringify({ error: portalData?.error?.message ?? "Erro ao criar portal Stripe" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ url: portalData.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-portal-link error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
