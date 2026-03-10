import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ACTIVE_STATUSES = ["active", "trialing"];

function BillingBlockedScreen() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Acesso bloqueado</h2>
        <p className="text-sm text-muted-foreground">
          O acesso ao sistema está temporariamente suspenso. Por favor, entre em contato com o
          <strong className="text-foreground"> administrador da sua empresa</strong> para regularizar
          a assinatura e reativar o acesso.
        </p>
        <button
          onClick={signOut}
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, role, loading, billingStatus } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && role !== "admin") return <Navigate to="/dashboard" replace />;

  // Bloqueia acesso se assinatura não estiver ativa
  const isFinanceiroRoute = location.pathname === "/admin/financeiro";
  const billingBlocked = billingStatus !== null && !ACTIVE_STATUSES.includes(billingStatus);

  if (billingBlocked) {
    // Admin vai para a tela financeiro; usuário comum vê tela de bloqueio
    if (role === "admin") {
      if (!isFinanceiroRoute) return <Navigate to="/admin/financeiro" replace />;
    } else {
      return <BillingBlockedScreen />;
    }
  }

  return <>{children}</>;
}
