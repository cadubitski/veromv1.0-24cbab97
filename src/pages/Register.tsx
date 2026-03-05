import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2, CheckCircle, CreditCard, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatCNPJ, validateCNPJ } from "@/lib/cnpj";
import { supabase } from "@/integrations/supabase/client";

const PRICE_ID = "price_1T6XRS8rgGCdKgUCkAbD6Bav";
const REGISTER_PENDING_KEY = "verom_register_pending";

export default function Register() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({
    cnpj: "",
    companyName: "",
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cnpjError, setCnpjError] = useState("");

  // Step: "form" | "completing" | "done"
  const [step, setStep] = useState<"form" | "completing" | "done">("form");

  // On mount, restore form data or complete registration
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const rawPending = localStorage.getItem(REGISTER_PENDING_KEY);

    if (rawPending) {
      try {
        const pendingData = JSON.parse(rawPending);
        // Restore form fields so user can see their data
        setForm((f) => ({
          ...f,
          cnpj: pendingData.cnpj || "",
          companyName: pendingData.companyName || "",
          fullName: pendingData.fullName || "",
          email: pendingData.email || "",
          password: pendingData.password || "",
          confirmPassword: pendingData.password || "",
        }));

        if (sessionId) {
          setStep("completing");
          completeRegistration(pendingData);
        }
      } catch {
        localStorage.removeItem(REGISTER_PENDING_KEY);
      }
    }
  }, []);

  const handleCnpjChange = (value: string) => {
    const formatted = formatCNPJ(value);
    setForm((f) => ({ ...f, cnpj: formatted }));
    const cleaned = value.replace(/[^\d]/g, "");
    if (cleaned.length === 14) {
      setCnpjError(validateCNPJ(cleaned) ? "" : "CNPJ inválido");
    } else {
      setCnpjError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanCnpj = form.cnpj.replace(/[^\d]/g, "");
    if (!validateCNPJ(cleanCnpj)) {
      setError("CNPJ inválido. Verifique e tente novamente.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (form.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      // Save form data to localStorage before redirecting to Stripe
      localStorage.setItem(
        REGISTER_PENDING_KEY,
        JSON.stringify({
          cnpj: cleanCnpj,
          companyName: form.companyName,
          email: form.email,
          password: form.password,
          fullName: form.fullName,
        })
      );

      const origin = window.location.origin;
      const successUrl = `${origin}/register?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/register?canceled=true`;

      const BILLING_URL = "https://rdkrgtkuevzlvxzsyzrb.supabase.co/functions/v1/billing-core";
      const BILLING_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJka3JndGt1ZXZ6bHZ4enN5enJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQwMTEsImV4cCI6MjA4ODMwMDAxMX0.idbJkgu8ZLJhRzJUyfczfrSKgjTEksR_DMB-0IGaav4";

      const res = await fetch(`${BILLING_URL}/stripe/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: BILLING_ANON,
          Authorization: `Bearer ${BILLING_ANON}`,
        },
        body: JSON.stringify({
          email: form.email,
          priceId: PRICE_ID,
          successUrl,
          cancelUrl,
          saasKey: "verom",
        }),
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        localStorage.removeItem(REGISTER_PENDING_KEY);
        setError(data?.error || "Erro ao iniciar checkout.");
        setLoading(false);
        return;
      }

      const checkoutUrl = data?.url || data?.checkout_url || data?.sessionUrl || data?.session_url || data?.checkoutUrl;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        localStorage.removeItem(REGISTER_PENDING_KEY);
        setError("URL de checkout não retornada. Tente novamente.");
        setLoading(false);
      }
    } catch (err: any) {
      localStorage.removeItem(REGISTER_PENDING_KEY);
      setError(err.message || "Erro inesperado.");
      setLoading(false);
    }
  };

  const completeRegistration = async (pendingData: {
    cnpj: string;
    companyName: string;
    email: string;
    password: string;
    fullName: string;
  }) => {
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("register", {
        body: pendingData,
      });

      if (fnError || data?.error) {
        setError(data?.error || fnError?.message || "Erro ao criar conta.");
        setStep("form");
        return;
      }

      localStorage.removeItem(REGISTER_PENDING_KEY);
      setStep("done");

      // Auto login
      const { error: loginError } = await signIn(pendingData.email, pendingData.password);
      if (!loginError) {
        navigate("/dashboard");
      } else {
        navigate("/login");
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado ao finalizar cadastro.");
      setStep("form");
    }
  };

  // Show canceled message
  const canceled = searchParams.get("canceled");

  if (step === "completing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Finalizando seu cadastro...</h2>
          <p className="text-muted-foreground">Pagamento confirmado! Criando sua conta no Verom.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">Verom</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Cadastrar sua empresa</h1>
          <p className="mt-1 text-muted-foreground">O primeiro usuário será o administrador</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</div>
            Seus dados
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-bold">2</div>
            Pagamento
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-bold">3</div>
            Acesso
          </div>
        </div>

        {canceled && (
          <div className="mb-4 rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
            ⚠️ Pagamento cancelado. Preencha o formulário e tente novamente.
          </div>
        )}

        <Card className="shadow-card border-0">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ da Empresa *</Label>
                <div className="relative">
                  <Input
                    id="cnpj"
                    placeholder="00.000.000/0000-00"
                    value={form.cnpj}
                    onChange={(e) => handleCnpjChange(e.target.value)}
                    maxLength={18}
                    required
                  />
                  {!cnpjError && form.cnpj.replace(/[^\d]/g, "").length === 14 && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
                  )}
                </div>
                {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Nome da Empresa *</Label>
                <Input
                  id="companyName"
                  placeholder="Imobiliária Exemplo Ltda"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Seu nome completo *</Label>
                <Input
                  id="fullName"
                  placeholder="João da Silva"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repita a senha"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full mt-2 gap-2"
                size="lg"
                disabled={loading || !!cnpjError}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {loading ? "Redirecionando para pagamento..." : "Continuar para pagamento — R$29,90/mês"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          🔒 Pagamento processado com segurança pelo Stripe
        </p>
      </div>
    </div>
  );
}
