const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BILLING_URL = Deno.env.get("BILLING_CORE_URL") ?? "";
const BILLING_ANON = Deno.env.get("BILLING_CORE_ANON_KEY") ?? "";
const SAAS_KEY = "verom";

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

    if (!BILLING_URL) {
      console.error("BILLING_CORE_URL secret not configured");
      return new Response(
        JSON.stringify({ status: null, error: "Billing service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // BILLING_CORE_URL já inclui o caminho base, ex: https://xxx.supabase.co/functions/v1/billing-core
    const url = `${BILLING_URL}/protected/data?saas_key=${encodeURIComponent(SAAS_KEY)}&customer_email=${encodeURIComponent(customer_email)}`;
    console.log("Calling billing-core:", url);

    const res = await fetch(url, {
      headers: {
        apikey: BILLING_ANON,
        Authorization: `Bearer ${BILLING_ANON}`,
        "Content-Type": "application/json",
      },
    });

    console.log("billing-core response status:", res.status);

    if (!res.ok) {
      const body = await res.text();
      console.error(`billing-core status query failed: ${res.status} — ${body}`);

      // 403 = assinatura inativa/cancelada → retorna "canceled" para bloquear acesso
      // Outros erros (5xx, rede) → retorna null para não bloquear por falha técnica
      const billingStatus = res.status === 403 ? "canceled" : null;

      return new Response(
        JSON.stringify({ status: billingStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
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
