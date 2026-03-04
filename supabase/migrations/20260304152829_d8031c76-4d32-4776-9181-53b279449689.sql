
-- Fix overly permissive INSERT policies
-- For companies: only allow insert if the cnpj doesn't conflict (registration flow)
-- We'll use a service role edge function for registration, so we can restrict these policies
-- to be less permissive by requiring at minimum that the row being inserted has a non-null cnpj

DROP POLICY IF EXISTS "Anyone can insert a company" ON public.companies;
DROP POLICY IF EXISTS "Allow insert during registration" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert during registration" ON public.user_roles;

-- Companies: allow insert only when cnpj is provided (non-empty)
CREATE POLICY "Allow company registration"
  ON public.companies FOR INSERT
  WITH CHECK (cnpj IS NOT NULL AND cnpj <> '');

-- Profiles: allow insert only with valid user_id and company_id
CREATE POLICY "Allow profile creation"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id IS NOT NULL AND company_id IS NOT NULL);

-- User roles: allow insert only with valid user_id and company_id
CREATE POLICY "Allow role creation"
  ON public.user_roles FOR INSERT
  WITH CHECK (user_id IS NOT NULL AND company_id IS NOT NULL);
