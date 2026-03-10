
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'income_tax_brackets'
      AND column_name = 'valid_from_date'
  ) THEN
    ALTER TABLE public.income_tax_brackets
      ADD COLUMN valid_from_date date NOT NULL DEFAULT '2000-01-01';
  END IF;
END;
$$;
