ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS payment_method text NULL;