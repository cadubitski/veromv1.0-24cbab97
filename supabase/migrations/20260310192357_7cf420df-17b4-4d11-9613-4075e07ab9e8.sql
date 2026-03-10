
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_installments' AND column_name='ir_rate') THEN
    ALTER TABLE public.rental_installments ADD COLUMN ir_rate numeric NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_installments' AND column_name='ir_deduction') THEN
    ALTER TABLE public.rental_installments ADD COLUMN ir_deduction numeric NULL;
  END IF;
END;
$$;
