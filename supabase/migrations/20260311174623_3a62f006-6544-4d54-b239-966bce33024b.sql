
-- Step 1: Add column with a temporary unique default using sequence trick
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS document_number text;

-- Step 2: Populate unique values for all existing rows
UPDATE public.bank_transactions
SET document_number = 'MIGR-' || UPPER(SUBSTRING(id::text, 1, 8))
WHERE document_number IS NULL OR document_number = '';

-- Step 3: Set NOT NULL constraint
ALTER TABLE public.bank_transactions
  ALTER COLUMN document_number SET NOT NULL;

-- Step 4: Create unique index per company
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_document_number_company_uniq
  ON public.bank_transactions (company_id, document_number);
