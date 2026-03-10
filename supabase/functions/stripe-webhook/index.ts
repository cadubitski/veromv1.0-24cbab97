import Stripe from "https://esm.sh/stripe@14.21.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const BILLING_URL = Deno.env.get("BILLING_CORE_URL") ?? "";
const BILLING_ANON = Deno.env.get("BILLING_CORE_ANON_KEY") ?? "";
const SAAS_KEY = "verom";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, stripe-signature" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("Missing stripe-signature header");
    return new Response(JSON.stringify({ error: "Missing stripe-signature" }), { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), { status: 400 });
  }

  console.log(`Received event: ${event.type}`);

  // Eventos que indicam mudança de status da assinatura
  const relevantEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ]);

  if (!relevantEvents.has(event.type)) {
    return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
  }

  try {
    // Notifica o billing-core sobre o evento para que ele atualize a assinatura
    const billingWebhookUrl = `${BILLING_URL}/webhook`;
    console.log(`Forwarding event ${event.type} to billing-core:`, billingWebhookUrl);

    const res = await fetch(billingWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: BILLING_ANON,
        Authorization: `Bearer ${BILLING_ANON}`,
        "x-saas-key": SAAS_KEY,
        "stripe-signature": signature,
      },
      body: body, // Repassa o corpo original para manter a assinatura válida
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`billing-core webhook failed: ${res.status} — ${errBody}`);
      // Retorna 200 mesmo assim para evitar que Stripe reenvie indefinidamente
      // O billing-core pode ter endpoint diferente (ver logs)
    } else {
      const data = await res.json();
      console.log("billing-core webhook response:", data);
    }
  } catch (err) {
    console.error("Error forwarding to billing-core:", err.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
