
-- ======================================
-- PROPERTY TYPES TABLE
-- ======================================
CREATE TABLE public.property_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.property_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view property types of their company" ON public.property_types
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert property types for their company" ON public.property_types
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete property types of their company" ON public.property_types
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- ======================================
-- CLIENTS TABLE
-- ======================================
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  person_type TEXT NOT NULL DEFAULT 'fisica' CHECK (person_type IN ('fisica','juridica')),
  full_name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view clients of their company" ON public.clients
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert clients for their company" ON public.clients
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update clients of their company" ON public.clients
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete clients of their company" ON public.clients
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ======================================
-- PROPERTIES (IMOVEIS) TABLE
-- ======================================
CREATE TABLE public.properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  property_type_id UUID REFERENCES public.property_types(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'aluguel' CHECK (purpose IN ('aluguel','venda','ambos')),
  rent_value NUMERIC(15,2),
  sale_value NUMERIC(15,2),
  negotiation_percent NUMERIC(5,2),
  area_m2 NUMERIC(10,2),
  registry_number TEXT,
  municipal_registration TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','alugado','vendido','inativo')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view properties of their company" ON public.properties
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert properties for their company" ON public.properties
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update properties of their company" ON public.properties
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete properties of their company" ON public.properties
  FOR DELETE USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
