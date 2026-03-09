import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

const ACTIVE_STATUSES = ["active", "trialing"];

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, role, loading, billingStatus, billingLoading } = useAuth();
  const location = useLocation();

  if (loading || billingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && role !== "admin") return <Navigate to="/dashboard" replace />;

  // Bloqueia acesso se assinatura não estiver ativa, exceto na própria tela financeiro
  const isFinanceiroRoute = location.pathname === "/admin/financeiro";
  if (!isFinanceiroRoute && billingStatus !== null && !ACTIVE_STATUSES.includes(billingStatus)) {
    return <Navigate to="/admin/financeiro" replace />;
  }

  return <>{children}</>;
}
