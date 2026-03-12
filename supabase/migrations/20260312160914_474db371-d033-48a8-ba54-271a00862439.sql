
-- Add repasse_days_after_receipt to rental_contracts
ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS repasse_days_after_receipt integer NOT NULL DEFAULT 5;

-- Add repasse_accounts_payable_id to rental_installments
ALTER TABLE public.rental_installments
  ADD COLUMN IF NOT EXISTS repasse_accounts_payable_id uuid REFERENCES public.accounts_payable(id) ON DELETE SET NULL;
