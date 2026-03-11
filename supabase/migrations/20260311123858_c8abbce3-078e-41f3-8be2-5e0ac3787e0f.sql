
-- ============================================================
-- FIX: Convert GENERATED ALWAYS columns to regular nullable columns
-- Reason: GENERATED ALWAYS columns cannot receive explicit values
-- on INSERT/UPDATE, causing "cannot insert a non-DEFAULT value" errors.
-- We convert them to regular nullable columns. The values are
-- calculated by the application layer (frontend) and stored explicitly.
-- ============================================================

-- 1. rental_contracts: drop generated columns and recreate as regular nullable
ALTER TABLE public.rental_contracts
  DROP COLUMN management_fee_value,
  DROP COLUMN repasse_value;

ALTER TABLE public.rental_contracts
  ADD COLUMN management_fee_value numeric,
  ADD COLUMN repasse_value numeric;

-- 2. rental_installments: drop generated columns and recreate as regular nullable
ALTER TABLE public.rental_installments
  DROP COLUMN management_fee_value,
  DROP COLUMN repasse_value;

ALTER TABLE public.rental_installments
  ADD COLUMN management_fee_value numeric,
  ADD COLUMN repasse_value numeric;

-- 3. Backfill existing records with calculated values for rental_contracts
UPDATE public.rental_contracts
SET
  management_fee_value = rent_value * management_fee_percent / 100,
  repasse_value = rent_value - (rent_value * management_fee_percent / 100)
WHERE management_fee_value IS NULL;

-- 4. Backfill existing records with calculated values for rental_installments
UPDATE public.rental_installments
SET
  management_fee_value = value * management_fee_percent / 100,
  repasse_value = value - (value * management_fee_percent / 100)
WHERE management_fee_value IS NULL;
