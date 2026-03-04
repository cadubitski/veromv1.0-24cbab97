import { Link } from "react-router-dom";
import { Building2, CheckCircle, ArrowRight, Shield, Users, BarChart3, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  { icon: Users, title: "Gestão de Usuários", description: "Cadastre e gerencie sua equipe com controle de perfis e permissões." },
  { icon: Shield, title: "Multiempresa Seguro", description: "Cada imobiliária tem seus dados isolados. Segurança e privacidade garantidas." },
  { icon: BarChart3, title: "Dashboard Administrativo", description: "Visão geral do status da assinatura e indicadores da sua empresa." },
  { icon: FileText, title: "Gestão Financeira", description: "Acompanhe faturas e gerencie sua assinatura direto no portal de pagamento." },
];

const plans = [
  { check: "Usuários ilimitados" },
  { check: "Dashboard administrativo" },
  { check: "Gestão multiempresa" },
  { check: "Controle de permissões" },
  { check: "Suporte por e-mail" },
  { check: "Acesso de qualquer dispositivo" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur-sm shadow-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">Verom</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button>Começar grátis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="gradient-hero py-24 text-white">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
            <Shield className="h-4 w-4" />
            Plataforma segura e multiempresa
          </div>
          <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Administração imobiliária
            <span className="block opacity-90">simples e eficiente</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-white/80">
            O Verom centraliza a gestão administrativa da sua imobiliária — controle de usuários,
            assinatura e permissões em um só lugar, seguro e acessível de qualquer dispositivo.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link to="/register">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 gap-2 px-8 text-base font-semibold">
                Criar conta gratuita <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="border-white/40 text-white hover:bg-white/10 px-8 text-base">
                Já tenho conta
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground">Tudo que sua imobiliária precisa</h2>
            <p className="mt-3 text-muted-foreground">Foco em administração, não em publicação de imóveis.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title} className="shadow-card border-0 hover:scale-[1.02] transition-transform duration-200">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <f.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="bg-secondary/40 py-20" id="preco">
        <div className="mx-auto max-w-md px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-foreground">Plano único e acessível</h2>
            <p className="mt-3 text-muted-foreground">Sem surpresas, sem taxas ocultas.</p>
          </div>
          <Card className="shadow-card border-0 overflow-hidden">
            <div className="gradient-hero p-8 text-center text-white">
              <p className="text-sm font-medium uppercase tracking-widest opacity-80">Plano Profissional</p>
              <div className="mt-4 flex items-end justify-center gap-1">
                <span className="text-2xl font-medium">R$</span>
                <span className="text-6xl font-extrabold leading-none">29</span>
                <span className="text-2xl font-medium">,90</span>
              </div>
              <p className="mt-2 opacity-80">por mês</p>
            </div>
            <CardContent className="p-8">
              <ul className="space-y-3">
                {plans.map((p) => (
                  <li key={p.check} className="flex items-center gap-3 text-sm text-foreground">
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-success" />
                    {p.check}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="mt-8 block">
                <Button className="w-full" size="lg">
                  Assinar agora — R$29,90/mês
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">Verom</span>
          </div>
          <p>© {new Date().getFullYear()} Verom. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
