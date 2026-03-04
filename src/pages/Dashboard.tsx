import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Building2, Users, CreditCard, Calendar } from "lucide-react";

const statCards = [
  {
    key: "empresa",
    label: "Empresa",
    icon: Building2,
  },
  {
    key: "perfil",
    label: "Seu perfil",
    icon: Users,
  },
  {
    key: "cnpj",
    label: "CNPJ",
    icon: CreditCard,
  },
];

export default function Dashboard() {
  const { profile, company, role } = useAuth();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  const statValues: Record<string, string> = {
    empresa: company?.name ?? "—",
    perfil: role ? role.charAt(0).toUpperCase() + role.slice(1) : "—",
    cnpj: company?.cnpj
      ? company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : "—",
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="border-b border-border/40 pb-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {greeting()}, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bem-vindo ao painel administrativo da{" "}
            <span className="text-foreground font-medium">{company?.name}</span>
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="card-premium rounded-xl border border-border/60 bg-card p-5"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="text-lg font-semibold text-foreground leading-tight">
                    {statValues[card.key]}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
                  <card.icon className="h-4.5 w-4.5 text-primary" style={{height: '1.1rem', width: '1.1rem'}} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Coming soon */}
        <div className="rounded-xl border border-border/40 border-dashed bg-card/40 p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-card">
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground">Funcionalidades em desenvolvimento</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
            Novos módulos de gestão imobiliária serão adicionados em breve.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
