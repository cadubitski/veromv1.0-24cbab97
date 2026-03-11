
-- Tabela de Contas a Receber
CREATE TABLE public.accounts_receivable (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id           uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  contract_id         uuid REFERENCES public.rental_contracts(id) ON DELETE SET NULL,
  installment_id      uuid REFERENCES public.rental_installments(id) ON DELETE SET NULL,
  description         text NOT NULL,
  issue_date          date NOT NULL,
  due_date            date NOT NULL,
  amount              numeric NOT NULL,
  status              text NOT NULL DEFAULT 'pending',
  source_type         text NOT NULL DEFAULT 'manual',
  paid_at             date,
  bank_account_id     uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view receivables of their company"
  ON public.accounts_receivable FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert receivables for their company"
  ON public.accounts_receivable FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update receivables of their company"
  ON public.accounts_receivable FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete receivables of their company"
  ON public.accounts_receivable FOR DELETE
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Auto-updated_at trigger
CREATE TRIGGER trg_accounts_receivable_updated_at
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
