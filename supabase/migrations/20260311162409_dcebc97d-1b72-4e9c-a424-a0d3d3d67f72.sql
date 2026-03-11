
-- Tabela de permissões de menu por usuário
CREATE TABLE public.user_permissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, permission_key)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Admins gerenciam todas as permissões da empresa
CREATE POLICY "Admins manage permissions of their company"
  ON public.user_permissions FOR ALL
  USING (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- Usuários leem apenas as próprias permissões
CREATE POLICY "Users view own permissions"
  ON public.user_permissions FOR SELECT
  USING (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
  );
