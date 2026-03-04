
-- TENANTS TABLE
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  person_type TEXT NOT NULL DEFAULT 'fisica',
  full_name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view tenants of their company" ON public.tenants
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert tenants for their company" ON public.tenants
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update tenants of their company" ON public.tenants
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete tenants of their company" ON public.tenants
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RENTAL CONTRACTS TABLE
CREATE TABLE public.rental_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  property_id UUID NOT NULL REFERENCES public.properties(id),
  rent_value NUMERIC NOT NULL,
  start_date DATE NOT NULL,
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  duration_months INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view rental contracts of their company" ON public.rental_contracts
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert rental contracts for their company" ON public.rental_contracts
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update rental contracts of their company" ON public.rental_contracts
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete rental contracts of their company" ON public.rental_contracts
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_rental_contracts_updated_at
  BEFORE UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RENTAL INSTALLMENTS TABLE
CREATE TABLE public.rental_installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  competence TEXT NOT NULL,
  due_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'em_aberto',
  paid_at DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view installments of their company" ON public.rental_installments
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert installments for their company" ON public.rental_installments
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update installments of their company" ON public.rental_installments
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete installments of their company" ON public.rental_installments
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_rental_installments_updated_at
  BEFORE UPDATE ON public.rental_installments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
