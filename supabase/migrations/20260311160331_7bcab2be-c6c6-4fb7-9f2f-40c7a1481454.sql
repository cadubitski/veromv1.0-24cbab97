
-- Tabela de movimentações bancárias
CREATE TABLE public.bank_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  transaction_date date NOT NULL,
  description text NOT NULL,
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  amount numeric NOT NULL CHECK (amount > 0),
  origin_type text NOT NULL DEFAULT 'manual',
  origin_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bank_transactions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

-- RLS
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view transactions of their company"
  ON public.bank_transactions FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert transactions for their company"
  ON public.bank_transactions FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update transactions of their company"
  ON public.bank_transactions FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete transactions of their company"
  ON public.bank_transactions FOR DELETE
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Trigger: atualiza current_balance ao INSERT
CREATE OR REPLACE FUNCTION public.update_balance_on_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'credit' THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance + NEW.amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
  ELSIF NEW.type = 'debit' THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance - NEW.amount,
        updated_at = now()
    WHERE id = NEW.bank_account_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger: reverte saldo ao DELETE
CREATE OR REPLACE FUNCTION public.revert_balance_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'credit' THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance - OLD.amount,
        updated_at = now()
    WHERE id = OLD.bank_account_id;
  ELSIF OLD.type = 'debit' THEN
    UPDATE public.bank_accounts
    SET current_balance = current_balance + OLD.amount,
        updated_at = now()
    WHERE id = OLD.bank_account_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_update_balance_on_insert
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_balance_on_transaction();

CREATE TRIGGER trg_revert_balance_on_delete
  AFTER DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.revert_balance_on_delete();

-- updated_at trigger
CREATE TRIGGER trg_bank_transactions_updated_at
  BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
