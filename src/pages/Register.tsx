import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Eye, EyeOff, Loader2, CheckCircle, CreditCard, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatCNPJ, validateCNPJ } from "@/lib/cnpj";

// ─── Constants ────────────────────────────────────────────────────────────────
const PRICE_ID = "price_1T6XRS8rgGCdKgUCkAbD6Bav";
const REGISTER_PENDING_KEY = "verom_register_pending";

// Hardcoded: a Edge Function 'register' sempre vive neste projeto Supabase (verom).
// NÃO usar env var aqui pois no Vercel VITE_SUPABASE_URL pode apontar para outro projeto.
const SUPABASE_URL = "https://xdwtgwmkigffzmuwknqm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd3Rnd21raWdmZnptdXdrbnFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzE4NzYsImV4cCI6MjA4ODIwNzg3Nn0.f4h_lTilh8WCG9PEMVVDR93gubca_LRUokVlKaa5RAo";

// Billing-core microservice
const BILLING_URL = "https://rdkrgtkuevzlvxzsyzrb.supabase.co/functions/v1/billing-core";
const BILLING_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJka3JndGt1ZXZ6bHZ4enN5enJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQwMTEsImV4cCI6MjA4ODMwMDAxMX0.idbJkgu8ZLJhRzJUyfczfrSKgjTEksR_DMB-0IGaav4";

// Dynamic origin: works on Vercel, Lovable preview, and local dev
const APP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://verom-eight.vercel.app";

// ─── Types ───────────────────────────────────────────────────────────────────
interface PendingData {
  cnpj: string;
  companyName: string;
  email: string;
  password: string;
  fullName: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function Register() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

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
  const [canceled, setCanceled] = useState(false);

  // Step: "form" | "completing" | "done"
  const [step, setStep] = useState<"form" | "completing" | "done">("form");

  // ── Complete registration (called after Stripe success) ──────────────────
  const completeRegistration = useCallback(
    async (pendingData: PendingData) => {
      setError("");
      try {
        console.log("[Register] completeRegistration →", { ...pendingData, password: "***" });

      const functionUrl = `${SUPABASE_URL}/functions/v1/register`;
        console.log("[Register] SUPABASE_URL =", SUPABASE_URL);
        console.log("[Register] POST", functionUrl);
        console.log("[Register] ANON_KEY prefix =", SUPABASE_ANON_KEY?.substring(0, 20));

        const res = await fetch(functionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(pendingData),
        });

        const data = await res.json();
        console.log("[Register] response", res.status, data);

        if (!res.ok || data?.error) {
          setError(data?.error ?? `Erro ao criar conta (HTTP ${res.status})`);
          setStep("form");
          return;
        }

        localStorage.removeItem(REGISTER_PENDING_KEY);
        setStep("done");

        // Auto-login after registration
        const { error: loginError } = await signIn(pendingData.email, pendingData.password);
        if (!loginError) {
          navigate("/dashboard");
        } else {
          console.warn("[Register] auto-login failed:", loginError);
          navigate("/login");
        }
      } catch (err: any) {
        console.error("[Register] completeRegistration error:", err);
        const msg = err.message ?? "Erro inesperado ao finalizar cadastro.";
        // "Failed to fetch" usually means network/CORS issue – give a clearer hint
        if (msg.toLowerCase().includes("failed to fetch")) {
          setError(
            `Erro de rede ao criar conta (Failed to fetch). URL tentada: ${SUPABASE_URL}/functions/v1/register — Tente recarregar a página.`
          );
        } else {
          setError(msg);
        }
        setStep("form");
      }
    },
    [signIn, navigate],
  );

  // ── On mount: check for Stripe redirect ─────────────────────────────────
  useEffect(() => {
    // Use window.location directly to avoid React Router timing issues
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    const wasCanceled = urlParams.get("canceled") === "true";

    if (wasCanceled) setCanceled(true);

    const raw = localStorage.getItem(REGISTER_PENDING_KEY);
    console.log("[Register] mount → sessionId:", sessionId, "| hasPending:", !!raw, "| canceled:", wasCanceled);

    if (!raw) {
      if (sessionId) {
        // Payment done but localStorage cleared (e.g., different browser/device)
        setError("Dados de cadastro não encontrados. Por favor, preencha o formulário novamente.");
      }
      return;
    }

    try {
      const pendingData: PendingData = JSON.parse(raw);

      // Always restore form so user sees their data
      setForm((f) => ({
        ...f,
        cnpj: pendingData.cnpj ?? "",
        companyName: pendingData.companyName ?? "",
        fullName: pendingData.fullName ?? "",
        email: pendingData.email ?? "",
        password: pendingData.password ?? "",
        confirmPassword: pendingData.password ?? "",
      }));

      if (sessionId) {
        setStep("completing");
        completeRegistration(pendingData);
      }
    } catch {
      localStorage.removeItem(REGISTER_PENDING_KEY);
    }
  }, [completeRegistration]);

  // ── CNPJ mask ────────────────────────────────────────────────────────────
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

  // ── Submit → go to Stripe ────────────────────────────────────────────────
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
      const pendingData: PendingData = {
        cnpj: cleanCnpj,
        companyName: form.companyName,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
      };

      // Persist before redirect so it survives browser navigation
      localStorage.setItem(REGISTER_PENDING_KEY, JSON.stringify(pendingData));

      const successUrl = `${APP_ORIGIN}/register?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${APP_ORIGIN}/register?canceled=true`;

      const res = await fetch(`${BILLING_URL}/stripe/create-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: BILLING_ANON,
          Authorization: `Bearer ${BILLING_ANON}`,
        },
        body: JSON.stringify({
          customer_email: form.email,
          price_id: PRICE_ID,
          success_url: successUrl,
          cancel_url: cancelUrl,
          saas_key: "verom",
        }),
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        localStorage.removeItem(REGISTER_PENDING_KEY);
        setError(data?.error ?? "Erro ao iniciar checkout.");
        setLoading(false);
        return;
      }

      const checkoutUrl =
        data?.url ?? data?.checkout_url ?? data?.sessionUrl ?? data?.session_url ?? data?.checkoutUrl;

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        localStorage.removeItem(REGISTER_PENDING_KEY);
        setError("URL de checkout não retornada. Tente novamente.");
        setLoading(false);
      }
    } catch (err: any) {
      localStorage.removeItem(REGISTER_PENDING_KEY);
      setError(err.message ?? "Erro inesperado.");
      setLoading(false);
    }
  };

  // ── Completing screen ─────────────────────────────────────────────────────
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

  // ── Form ──────────────────────────────────────────────────────────────────
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
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
              1
            </div>
            Seus dados
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-bold">
              2
            </div>
            Pagamento
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/30 text-xs font-bold">
              3
            </div>
            Acesso
          </div>
        </div>

        {canceled && (
          <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
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
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
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
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}

              <Button
                type="submit"
                className="w-full mt-2 gap-2"
                size="lg"
                disabled={loading || !!cnpjError}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
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
