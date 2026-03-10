import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  company_id: string;
  full_name: string;
  email: string;
  address?: string;
  birth_date?: string;
  must_change_password: boolean;
}

interface Company {
  id: string;
  cnpj: string;
  name: string;
  email?: string;
}

export type BillingStatus = "active" | "trialing" | "past_due" | "canceled" | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  company: Company | null;
  role: "admin" | "user" | null;
  billingStatus: BillingStatus;
  billingLoading: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBilling: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const fetchUserData = async (userId: string) => {
    const [profileRes, roleRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    let companyEmail: string | null = null;

    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
      const companyRes = await supabase
        .from("companies")
        .select("*")
        .eq("id", profileRes.data.company_id)
        .maybeSingle();
      if (companyRes.data) {
        setCompany(companyRes.data as Company);
        // Usa o email da empresa (do admin que registrou e pagou) para checar billing
        companyEmail = companyRes.data.email ?? null;
      }
    }

    if (roleRes.data) {
      setRole(roleRes.data.role as "admin" | "user");
    }

    return companyEmail;
  };

  const fetchBillingStatus = async (email: string) => {
    // Não usa billingLoading para não causar re-render/spinner em toda navegação
    try {
      const { data, error } = await supabase.functions.invoke("get-billing-status", {
        body: { customer_email: email },
      });
      if (!error && data?.status !== undefined) {
        setBillingStatus(data.status as BillingStatus);
      }
    } catch {
      // mantém null, não bloqueia login
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchUserData(user.id);
  };

  const refreshBilling = async () => {
    // Sempre usa o email da empresa (quem pagou a assinatura), não o email do usuário logado
    if (company?.email) await fetchBillingStatus(company.email);
  };

  useEffect(() => {
    // Carrega a sessão inicial sem depender do onAuthStateChange
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        fetchUserData(sess.user.id).then(async (companyEmail) => {
          if (companyEmail) await fetchBillingStatus(companyEmail);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Só reage a eventos relevantes: login e logout
    // TOKEN_REFRESHED (disparado ao voltar à aba) é ignorado intencionalmente
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, sess) => {
      if (event === "TOKEN_REFRESHED") return; // evita reload ao voltar à aba

      setSession(sess);
      setUser(sess?.user ?? null);

      if (event === "SIGNED_IN" && sess?.user) {
        setTimeout(async () => {
          const companyEmail = await fetchUserData(sess.user.id);
          if (companyEmail) await fetchBillingStatus(companyEmail);
          setLoading(false);
        }, 0);
      } else if (event === "SIGNED_OUT") {
        setProfile(null);
        setCompany(null);
        setRole(null);
        setBillingStatus(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session, user, profile, company, role,
      billingStatus, billingLoading,
      loading, signIn, signOut, refreshProfile, refreshBilling,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
