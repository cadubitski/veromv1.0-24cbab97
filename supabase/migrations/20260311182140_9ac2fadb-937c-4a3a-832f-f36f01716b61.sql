
-- ─── accounts_payable table ───────────────────────────────────────────────────
CREATE TABLE public.accounts_payable (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id          UUID NOT NULL REFERENCES public.companies(id),
  vendor_id           UUID NULL REFERENCES public.clients(id),
  contract_id         UUID NULL REFERENCES public.rental_contracts(id),
  installment_id      UUID NULL REFERENCES public.rental_installments(id),
  description         TEXT NOT NULL,
  issue_date          DATE NOT NULL,
  due_date            DATE NOT NULL,
  amount              NUMERIC NOT NULL,
  document_number     TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  source_type         TEXT NOT NULL DEFAULT 'manual',
  paid_at             DATE NULL,
  bank_account_id     UUID NULL REFERENCES public.bank_accounts(id),
  bank_transaction_id UUID NULL REFERENCES public.bank_transactions(id),
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique document_number per company
CREATE UNIQUE INDEX uq_accounts_payable_doc_number
  ON public.accounts_payable (company_id, document_number);

-- Unique installment_id per company (prevent duplicate repasse)
CREATE UNIQUE INDEX uq_accounts_payable_installment
  ON public.accounts_payable (company_id, installment_id)
  WHERE installment_id IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER update_accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view payables of their company"
  ON public.accounts_payable FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert payables for their company"
  ON public.accounts_payable FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update payables of their company"
  ON public.accounts_payable FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete payables of their company"
  ON public.accounts_payable FOR DELETE
  USING (
    company_id = get_user_company_id(auth.uid())
    AND has_role(auth.uid(), 'admin'::app_role)
  );
