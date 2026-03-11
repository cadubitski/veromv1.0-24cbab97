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
      // 5xx / erros técnicos do servidor → retorna "active" para não penalizar o usuário por falha do servidor
      const billingStatus = res.status === 403 ? "canceled" : "active";

      return new Response(
        JSON.stringify({ status: billingStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    console.log("billing-core raw response:", JSON.stringify(data));

    // billing-core pode retornar objeto direto, array, ou wrapper com 'subscription'
    let subscription: Record<string, unknown> | null = null;
    if (Array.isArray(data)) {
      subscription = data.length > 0 ? data[0] : null;
    } else if (data && typeof data === "object") {
      // pode ser { subscription: {...} } ou o objeto direto com status
      if ("subscription" in data) {
        subscription = (data as Record<string, unknown>).subscription as Record<string, unknown>;
      } else if ("status" in data) {
        subscription = data as Record<string, unknown>;
      } else if ("data" in data && Array.isArray((data as Record<string, unknown>).data)) {
        const arr = (data as Record<string, unknown>).data as unknown[];
        subscription = arr.length > 0 ? arr[0] as Record<string, unknown> : null;
      }
    }

    console.log("resolved subscription:", JSON.stringify(subscription));

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
