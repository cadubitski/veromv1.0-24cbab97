import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Building2, LayoutDashboard, Users, CreditCard,
  LogOut, Menu, X, ChevronDown, ChevronRight,
  Shield
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ElementType;
  href?: string;
  children?: { label: string; href: string }[];
}

const userNav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
];

const adminNav: NavItem[] = [
  {
    label: "Administração",
    icon: Shield,
    children: [
      { label: "Financeiro", href: "/admin/financeiro" },
      { label: "Usuários", href: "/admin/usuarios" },
    ],
  },
];

function NavItem({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const [open, setOpen] = useState(() =>
    item.children?.some((c) => location.pathname.startsWith(c.href)) ?? false
  );

  if (item.href) {
    const active = location.pathname === item.href;
    return (
      <Link
        to={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
    active
            ? "bg-sidebar-primary/20 text-sidebar-primary"
            : "hover:bg-sidebar-accent"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          "hover:bg-sidebar-accent"
        )}
        style={{color: 'hsl(var(--sidebar-foreground))'}}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-8 mt-1 space-y-1">
          {item.children?.map((child) => {
            const active = location.pathname === child.href;
            return (
              <Link
                key={child.href}
                to={child.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary/20 font-medium"
                    : "hover:bg-sidebar-accent"
                )}
                style={{color: active ? 'hsl(var(--sidebar-primary))' : 'hsl(var(--sidebar-foreground))'}}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile, company, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const navItems = role === "admin" ? [...userNav, ...adminNav] : userNav;

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col" style={{backgroundColor: 'hsl(var(--sidebar-background))', color: 'hsl(var(--sidebar-foreground))'}}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5" style={{borderBottom: '1px solid hsl(var(--sidebar-border))'}}>
        <Building2 className="h-7 w-7 shrink-0" style={{color: 'hsl(var(--sidebar-primary))'}} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold" style={{color: 'hsl(var(--sidebar-primary-foreground))'}}>Verom</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{company?.name ?? "..."}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => (
          <NavItem key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3 rounded-lg p-2", !collapsed && "mb-2")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary">
            {profile?.full_name?.charAt(0).toUpperCase() ?? "U"}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-accent-foreground">{profile?.full_name}</p>
              <p className="truncate text-xs text-sidebar-foreground/70 capitalize">{role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent transition-colors"
          style={{color: 'hsl(var(--sidebar-foreground))'}}
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
          "hidden md:flex flex-col border-r border-border transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-20 left-0 z-10 hidden md:flex items-center justify-center h-6 w-6 -ml-3 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground shadow-sm"
          style={{ left: collapsed ? "52px" : "252px" }}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 -rotate-90" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex items-center gap-4 border-b bg-card px-4 py-3 md:hidden shadow-nav">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span className="font-bold">Verom</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
