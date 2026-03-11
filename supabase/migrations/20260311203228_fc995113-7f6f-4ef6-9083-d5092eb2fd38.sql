
-- Add financial_status and accounts_receivable_id to rental_installments
ALTER TABLE public.rental_installments
  ADD COLUMN IF NOT EXISTS financial_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS accounts_receivable_id UUID NULL;

-- Update existing rows: if paid_at is set, mark as paid; otherwise pending
UPDATE public.rental_installments
SET financial_status = 'paid'
WHERE paid_at IS NOT NULL;
