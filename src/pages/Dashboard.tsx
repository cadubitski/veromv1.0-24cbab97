import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, CreditCard, Calendar } from "lucide-react";

export default function Dashboard() {
  const { profile, company, role } = useAuth();

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting()}, {profile?.full_name?.split(" ")[0]} 👋
          </h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo ao painel administrativo da {company?.name}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-card border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Empresa</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{company?.name ?? "—"}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Seu perfil</p>
                  <p className="mt-1 text-lg font-semibold text-foreground capitalize">{role ?? "—"}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">CNPJ</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {company?.cnpj
                      ? company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                      : "—"}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card border-0">
          <CardContent className="p-8 text-center">
            <Calendar className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="font-semibold text-foreground">Funcionalidades em desenvolvimento</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Novos módulos de gestão imobiliária serão adicionados em breve.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
