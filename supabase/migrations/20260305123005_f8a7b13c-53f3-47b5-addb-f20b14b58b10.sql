
-- Add management fee fields to rental_contracts
ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS management_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_value numeric GENERATED ALWAYS AS (rent_value * management_fee_percent / 100) STORED,
  ADD COLUMN IF NOT EXISTS repasse_value numeric GENERATED ALWAYS AS (rent_value - (rent_value * management_fee_percent / 100)) STORED;

-- Add management fee fields to rental_installments
ALTER TABLE public.rental_installments
  ADD COLUMN IF NOT EXISTS management_fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS management_fee_value numeric GENERATED ALWAYS AS (value * management_fee_percent / 100) STORED,
  ADD COLUMN IF NOT EXISTS repasse_value numeric GENERATED ALWAYS AS (value - (value * management_fee_percent / 100)) STORED;
