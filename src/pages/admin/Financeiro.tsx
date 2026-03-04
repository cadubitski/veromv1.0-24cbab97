import { useEffect, useState } from "react";
import { ExternalLink, Loader2, CheckCircle, AlertCircle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type BillingStatus = "active" | "past_due" | "canceled" | "trialing" | null;

interface BillingInfo {
  status: BillingStatus;
  customer_email: string;
  saas_key: string;
}

const statusConfig = {
  active: { label: "Ativo", icon: CheckCircle, className: "bg-success/10 text-success border-success/20" },
  trialing: { label: "Período de teste", icon: CheckCircle, className: "bg-primary/10 text-primary border-primary/20" },
  past_due: { label: "Pagamento pendente", icon: AlertCircle, className: "bg-warning/10 text-warning border-warning/20" },
  canceled: { label: "Cancelado", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function Financeiro() {
  const { user, company } = useAuth();
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [error, setError] = useState("");

  const fetchBilling = async () => {
    if (!user || !company) return;
    setLoadingBilling(true);
    setError("");
    try {
      // Query billing-core for this company's billing info
      // Using the external billing-core Supabase project
      const BILLING_URL = "https://idrjkzqgmvooqiegandx.supabase.co";
      const BILLING_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcmprenFnbXZvb3FpZWdhbmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgwMzI1ODAsImV4cCI6MjAyMzYwODU4MH0.kzrEyOz3JBrSzJHjSFDrN8cqMmjcxAl1MZnfTy2JL8s";

      const res = await fetch(`${BILLING_URL}/rest/v1/subscriptions?saas_key=eq.verom&customer_email=eq.${encodeURIComponent(user.email ?? "")}`, {
        headers: {
          apikey: BILLING_ANON,
          Authorization: `Bearer ${BILLING_ANON}`,
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setBilling({
            status: data[0].status,
            customer_email: user.email ?? "",
            saas_key: "verom",
          });
        } else {
          setBilling({
            status: null,
            customer_email: user.email ?? "",
            saas_key: "verom",
          });
        }
      } else {
        setBilling({
          status: null,
          customer_email: user.email ?? "",
          saas_key: "verom",
        });
      }
    } catch {
      setBilling({
        status: null,
        customer_email: user.email ?? "",
        saas_key: "verom",
      });
    } finally {
      setLoadingBilling(false);
    }
  };

  useEffect(() => {
    fetchBilling();
  }, [user, company]);

  const openCustomerPortal = async () => {
    if (!billing) return;
    setLoadingPortal(true);
    setError("");
    try {
      const res = await fetch(
        "https://idrjkzqgmvooqiegandx.supabase.co/functions/v1/billing-core/stripe/portal-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_email: billing.customer_email,
            saas_key: billing.saas_key,
          }),
        }
      );
      const data = await res.json();
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        setError("Não foi possível abrir o portal financeiro. Tente novamente.");
      }
    } catch {
      setError("Erro de conexão ao abrir o portal financeiro.");
    } finally {
      setLoadingPortal(false);
    }
  };

  const statusInfo = billing?.status ? statusConfig[billing.status] : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground mt-1">Gerencie sua assinatura e faturas</p>
        </div>

        {loadingBilling ? (
          <Card className="shadow-card border-0">
            <CardContent className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Status Card */}
            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-base">Status da Assinatura</CardTitle>
                <CardDescription>Plano Profissional — R$29,90/mês</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  {statusInfo ? (
                    <>
                      <statusInfo.icon className="h-5 w-5" style={{ color: "inherit" }} />
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">Sem assinatura ativa</span>
                  )}
                </div>
                {billing?.status === "past_due" && (
                  <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
                    ⚠️ Há um pagamento pendente. Acesse o portal para regularizar.
                  </div>
                )}
                {billing?.status === "canceled" && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    Sua assinatura foi cancelada. Renove para continuar usando o Verom.
                  </div>
                )}
                <button
                  onClick={fetchBilling}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Atualizar status
                </button>
              </CardContent>
            </Card>

            {/* Portal Card */}
            <Card className="shadow-card border-0">
              <CardHeader>
                <CardTitle className="text-base">Portal do Cliente</CardTitle>
                <CardDescription>Acesse faturas, histórico e dados de pagamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Visualize todas as suas faturas, altere o método de pagamento e gerencie os dados da assinatura
                  diretamente no portal seguro.
                </p>
                {error && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}
                <Button
                  onClick={openCustomerPortal}
                  disabled={loadingPortal}
                  className="gap-2"
                >
                  {loadingPortal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Ver faturas e gerenciar assinatura
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empresa info */}
        <Card className="shadow-card border-0">
          <CardHeader>
            <CardTitle className="text-base">Informações da Conta</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Empresa</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{company?.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">CNPJ</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">
                  {company?.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">E-mail de cobrança</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">Plano</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">Profissional — R$29,90/mês</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
