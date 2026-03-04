import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, CreditCard, Home, UserCheck, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { profile, company, role } = useAuth();
  const navigate = useNavigate();
  const [activeClients, setActiveClients] = useState<number | null>(null);
  const [totalProperties, setTotalProperties] = useState<number | null>(null);
  const [availableProperties, setAvailableProperties] = useState<number | null>(null);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  useEffect(() => {
    if (!company?.id) return;
    // Active clients
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "ativo")
      .then(({ count }) => setActiveClients(count ?? 0));

    // Total properties
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .then(({ count }) => setTotalProperties(count ?? 0));

    // Available properties
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("status", "disponivel")
      .then(({ count }) => setAvailableProperties(count ?? 0));
  }, [company?.id]);

  const kpis = [
    {
      label: "Clientes ativos",
      value: activeClients,
      icon: UserCheck,
      href: "/cadastros/clientes",
      description: "Clique para ver os clientes",
    },
    {
      label: "Imóveis cadastrados",
      value: totalProperties,
      icon: Home,
      href: "/cadastros/imoveis",
      description: "Total de imóveis no portfólio",
    },
    {
      label: "Imóveis disponíveis",
      value: availableProperties,
      icon: Building2,
      href: "/cadastros/imoveis",
      description: "Prontos para locação ou venda",
    },
    {
      label: "Empresa",
      value: company?.name ?? "—",
      icon: CreditCard,
      href: null,
      description: company?.cnpj
        ? company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
        : "CNPJ não informado",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="border-b border-border/40 pb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {greeting()}, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bem-vindo ao painel da{" "}
            <span className="text-foreground font-medium">{company?.name}</span>
          </p>
        </div>

        {/* KPI Cards */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Visão geral</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => {
              const isClickable = !!kpi.href;
              const Tag = isClickable ? "button" : "div";
              return (
                <Tag
                  key={kpi.label}
                  onClick={isClickable ? () => navigate(kpi.href!) : undefined}
                  className={[
                    "card-premium rounded-xl border border-border/60 bg-card p-5 text-left w-full",
                    isClickable ? "cursor-pointer hover:border-primary/40 group transition-colors" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="text-2xl font-bold text-foreground leading-tight">
                        {kpi.value === null ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          kpi.value
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {isClickable ? (
                          <span className="group-hover:text-primary transition-colors">{kpi.description}</span>
                        ) : kpi.description}
                      </p>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15 ml-3">
                      <kpi.icon className="text-primary" style={{ height: '1.1rem', width: '1.1rem' }} />
                    </div>
                  </div>
                </Tag>
              );
            })}
          </div>
        </div>

        {/* Role info */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Perfil: <span className="capitalize">{role}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {role === "admin" ? "Você tem acesso completo ao sistema." : "Acesso padrão de usuário."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
