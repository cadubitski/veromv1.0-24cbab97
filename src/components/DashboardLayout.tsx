import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2, LayoutDashboard, Users, CreditCard,
  LogOut, Menu, ChevronDown, ChevronRight,
  Shield, BookUser, Home, Sun, Moon, TrendingUp, BarChart2, FileEdit, Landmark
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NavChild {
  label: string;
  href: string;
  /** Chave de permissão para este item de submenu. Omitir = sempre visível (somente admins) */
  permKey?: string;
}

export interface NavSubGroup {
  groupLabel: string;
  children: NavChild[];
}

export interface NavItem {
  label: string;
  icon: React.ElementType;
  href?: string;
  /** Chave de permissão para item direto */
  permKey?: string;
  children?: NavChild[];
  subGroups?: NavSubGroup[];
}

// ─── Mapa completo do menu ────────────────────────────────────────────────────
export const userNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", permKey: "dashboard" },
  {
    label: "Financeiro",
    icon: Landmark,
    children: [
      { label: "Contas Bancárias",      href: "/financeiro/contas-bancarias",      permKey: "financeiro.contas-bancarias" },
      { label: "Movimentação Bancária",  href: "/financeiro/movimentacao-bancaria",  permKey: "financeiro.movimentacao-bancaria" },
      { label: "Contas a Receber",       href: "/financeiro/contas-receber",          permKey: "financeiro.contas-receber" },
      { label: "Contas a Pagar",         href: "/financeiro/contas-pagar",            permKey: "financeiro.contas-pagar" },
    ],
  },
  {
    label: "Cadastros",
    icon: BookUser,
    children: [
      { label: "Locadores",    href: "/cadastros/clientes",    permKey: "cadastros.clientes" },
      { label: "Imóveis",      href: "/cadastros/imoveis",     permKey: "cadastros.imoveis" },
      { label: "Locatários",   href: "/cadastros/inquilinos",  permKey: "cadastros.inquilinos" },
      { label: "Tabela de IR", href: "/cadastros/tabela-ir",   permKey: "cadastros.tabela-ir" },
    ],
  },
  {
    label: "Movimentos",
    icon: TrendingUp,
    children: [
      { label: "Gestão de Contratos", href: "/movimentos/gestao-aluguel", permKey: "movimentos.gestao-aluguel" },
    ],
  },
  {
    label: "Relatórios",
    icon: BarChart2,
    subGroups: [
      {
        groupLabel: "Contratos",
        children: [
          { label: "Repasse",                href: "/relatorios/repasse",             permKey: "relatorios.repasse" },
          { label: "DIMOB Anual",            href: "/relatorios/dimob",               permKey: "relatorios.dimob" },
          { label: "Informe de Rendimentos", href: "/relatorios/informe-rendimentos", permKey: "relatorios.informe-rendimentos" },
        ],
      },
      {
        groupLabel: "Financeiro",
        children: [
          { label: "Movimentação Bancária",  href: "/relatorios/financeiro/movimentacao",   permKey: "relatorios.financeiro.movimentacao" },
          { label: "Contas a Receber",       href: "/relatorios/financeiro/contas-receber", permKey: "relatorios.financeiro.contas-receber" },
          { label: "Baixas C. a Receber",    href: "/relatorios/financeiro/baixas-receber", permKey: "relatorios.financeiro.baixas-receber" },
          { label: "Contas a Pagar",         href: "/relatorios/financeiro/contas-pagar",   permKey: "relatorios.financeiro.contas-pagar" },
          { label: "Baixas C. a Pagar",      href: "/relatorios/financeiro/baixas-pagar",   permKey: "relatorios.financeiro.baixas-pagar" },
        ],
      },
    ],
  },
  {
    label: "Configurações",
    icon: FileEdit,
    children: [
      { label: "Modelos de Documentos", href: "/documentos/modelos", permKey: "configuracoes.modelos" },
    ],
  },
];

export const adminNav: NavItem[] = [
  {
    label: "Administração",
    icon: Shield,
    children: [
      { label: "Financeiro", href: "/admin/financeiro" },
      { label: "Usuários",   href: "/admin/usuarios" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allChildren(item: NavItem): NavChild[] {
  if (item.children) return item.children;
  if (item.subGroups) return item.subGroups.flatMap((g) => g.children);
  return [];
}

/** Verifica se um item (ou qualquer filho) está liberado para o conjunto de permissões */
function isItemVisible(item: NavItem, permissions: Set<string>): boolean {
  if (permissions.has("*")) return true; // admin
  if (item.href) {
    return item.permKey ? permissions.has(item.permKey) : false;
  }
  return allChildren(item).some((c) => !c.permKey || permissions.has(c.permKey));
}

function visibleChildren(item: NavItem, permissions: Set<string>): NavChild[] {
  if (permissions.has("*")) return allChildren(item);
  return allChildren(item).filter((c) => !c.permKey || permissions.has(c.permKey));
}

function visibleSubGroups(item: NavItem, permissions: Set<string>): NavSubGroup[] {
  if (!item.subGroups) return [];
  const isAdmin = permissions.has("*");
  return item.subGroups
    .map((g) => ({
      ...g,
      children: isAdmin ? g.children : g.children.filter((c) => !c.permKey || permissions.has(c.permKey)),
    }))
    .filter((g) => g.children.length > 0);
}

// ─── NavLink inside sidebar ──────────────────────────────────────────────────
function SidebarLink({ child, onNavigate }: { child: NavChild; onNavigate?: () => void }) {
  const location = useLocation();
  const active = location.pathname === child.href || location.pathname.startsWith(child.href + "/");
  return (
    <Link
      to={child.href}
      onClick={onNavigate}
      className={cn(
        "block rounded-md px-3 py-2 text-sm transition-all duration-150",
        active
          ? "text-primary font-medium"
          : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
      )}
    >
      {child.label}
    </Link>
  );
}

// ─── NavItem Component ────────────────────────────────────────────────────────

function NavItemComp({
  item,
  collapsed,
  permissions,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  permissions: Set<string>;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const flatChildren = visibleChildren(item, permissions);

  const [open, setOpen] = useState(() =>
    flatChildren.some((c) => location.pathname.startsWith(c.href)) ?? false
  );

  if (item.href) {
    const active = location.pathname === item.href;
    return (
      <Link
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
          active
            ? "bg-primary/10 text-primary shadow-sm"
            : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  const hasSubGroups = !!item.subGroups && item.subGroups.length > 0;
  const subGroups = visibleSubGroups(item, permissions);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]"
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {open ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-7 mt-1 space-y-0.5 border-l border-[hsl(var(--sidebar-border))] pl-3">
          {hasSubGroups ? (
            subGroups.map((group) => (
              <SubGroupComp key={group.groupLabel} group={group} onNavigate={onNavigate} />
            ))
          ) : (
            flatChildren.map((child) => (
              <SidebarLink key={child.href} child={child} onNavigate={onNavigate} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── SubGroup Component ───────────────────────────────────────────────────────

function SubGroupComp({ group, onNavigate }: { group: NavSubGroup; onNavigate?: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    group.children.some((c) => location.pathname.startsWith(c.href))
  );

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--sidebar-foreground)/0.5)] hover:text-[hsl(var(--sidebar-accent-foreground))] transition-colors"
      >
        <span className="flex-1 text-left">{group.groupLabel}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {group.children.map((child) => (
            <SidebarLink key={child.href} child={child} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ThemeToggle ──────────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("verom-theme");
    if (stored) return stored === "dark";
    return true;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("verom-theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("verom-theme", "light");
    }
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      title={dark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      className="flex items-center justify-center h-8 w-8 rounded-lg text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))] transition-colors"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

// Apply saved theme on load
if (typeof window !== "undefined") {
  const stored = localStorage.getItem("verom-theme");
  if (stored === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}

// ─── DashboardLayout ──────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, company, role, signOut, permissions } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Monta a lista de itens visíveis para o usuário
  const baseNav = role === "admin"
    ? [...userNav, ...adminNav]
    : userNav.filter((item) => isItemVisible(item, permissions));

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col bg-[hsl(var(--sidebar-background))]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
          <Building2 className="h-4.5 w-4.5 text-primary" style={{height: '1.125rem', width: '1.125rem'}} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[hsl(var(--sidebar-accent-foreground))] tracking-tight">Verom</p>
            <p className="truncate text-xs text-[hsl(var(--sidebar-foreground))]">{company?.name ?? "..."}</p>
          </div>
        )}
        {!collapsed && <ThemeToggle />}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {!collapsed && (
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[hsl(var(--sidebar-foreground)/0.5)]">
            Menu
          </p>
        )}
        {collapsed && (
          <div className="flex justify-center py-1">
            <ThemeToggle />
          </div>
        )}
        {baseNav.map((item) => (
          <NavItemComp
            key={item.label}
            item={item}
            collapsed={collapsed}
            permissions={permissions}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-2.5 space-y-1">
        <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2")}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/25">
            {profile?.full_name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[hsl(var(--sidebar-accent-foreground))]">{profile?.full_name}</p>
              <p className="truncate text-xs text-[hsl(var(--sidebar-foreground))] capitalize opacity-60">{role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-destructive transition-all duration-150"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "relative hidden md:flex flex-col border-r border-border/60 transition-all duration-200",
          collapsed ? "w-[60px]" : "w-60"
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-[72px] z-10 hidden md:flex items-center justify-center h-6 w-6 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground shadow-sm transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 rotate-180" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex items-center gap-4 border-b border-border/60 bg-card px-4 py-3 md:hidden shadow-nav">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-bold text-foreground">Verom</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
