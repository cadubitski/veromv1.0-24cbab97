import { Link } from "react-router-dom";
import { Building2, CheckCircle, ArrowRight, Shield, Users, BarChart3, FileText, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: Users, title: "Gestão de Usuários", description: "Cadastre e gerencie sua equipe com controle de perfis e permissões avançadas." },
  { icon: Shield, title: "Multiempresa Seguro", description: "Cada imobiliária tem seus dados isolados. Segurança e privacidade garantidas." },
  { icon: BarChart3, title: "Dashboard Administrativo", description: "Visão geral em tempo real do status da assinatura e indicadores da empresa." },
  { icon: FileText, title: "Gestão Financeira", description: "Acompanhe faturas e gerencie sua assinatura direto no portal de pagamento." },
];

const plans = [
  "Usuários ilimitados",
  "Dashboard administrativo",
  "Gestão multiempresa",
  "Controle de permissões",
  "Suporte por e-mail",
  "Acesso de qualquer dispositivo",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-md shadow-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">Verom</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Entrar
              </Button>
            </Link>
            <Link to="/register">
              <Button className="shadow-button font-semibold">
                Começar agora
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden py-28 md:py-36">
        {/* Subtle grid background */}
        <div className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 50% 0%, hsl(213 94% 58% / 0.08) 0%, transparent 60%),
              linear-gradient(to bottom, transparent 70%, hsl(var(--background)) 100%)`,
          }}
        />
        {/* Glow accent */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(213 94% 58% / 0.5), transparent)' }}
        />

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Plataforma imobiliária de próxima geração
          </div>

          <h1 className="mb-6 text-5xl font-black leading-[1.05] tracking-tight text-foreground md:text-7xl text-balance">
            Administração
            <br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'var(--gradient-primary)' }}>
              imobiliária
            </span>
            {" "}simples.
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
            O Verom centraliza a gestão da sua imobiliária — controle de usuários,
            assinatura e permissões em um só lugar. Seguro, rápido e acessível em qualquer dispositivo.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/register">
              <Button size="lg" className="shadow-button shadow-glow gap-2 px-8 text-base font-bold h-12">
                Assinar agora — R$29,90/mês <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="gap-2 px-8 text-base h-12 border-border/60 text-muted-foreground hover:text-foreground">
                Já tenho conta
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-xs text-muted-foreground/60 flex items-center justify-center gap-1.5">
            <Lock className="h-3 w-3" />
            Pagamento seguro · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-border/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Tudo que sua imobiliária precisa
            </h2>
            <p className="mt-3 text-muted-foreground">Foco em administração, não em publicação de imóveis.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="card-premium group rounded-xl border border-border/60 bg-card p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 border-t border-border/40" id="preco">
        <div className="mx-auto max-w-md px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Plano único, sem surpresas</h2>
            <p className="mt-3 text-muted-foreground">Sem taxas ocultas. Sem surpresas.</p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-card">
            {/* Price header */}
            <div className="relative p-8 text-center border-b border-border/60"
              style={{ background: 'linear-gradient(135deg, hsl(213 94% 58% / 0.12), hsl(200 94% 44% / 0.06))' }}
            >
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, hsl(213 94% 58% / 0.5), transparent)' }}
              />
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary mb-4">Plano Profissional</p>
              <div className="flex items-end justify-center gap-1">
                <span className="text-xl font-semibold text-muted-foreground self-start mt-2">R$</span>
                <span className="text-7xl font-black leading-none tracking-tight text-foreground">29</span>
                <span className="text-2xl font-semibold text-muted-foreground self-end mb-1">,90/mês</span>
              </div>
            </div>

            <div className="p-8">
              <ul className="space-y-3 mb-8">
                {plans.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-sm text-foreground">
                    <CheckCircle className="h-4 w-4 flex-shrink-0 text-success" />
                    {p}
                  </li>
                ))}
              </ul>
              <Link to="/register" className="block">
                <Button className="w-full shadow-button shadow-glow font-bold text-base h-12" size="lg">
                  Assinar agora <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login" className="mt-3 block">
                <Button className="w-full" size="lg" variant="outline">
                  Já tenho uma conta
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
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
