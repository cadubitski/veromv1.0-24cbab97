
-- 1. Create income_tax_brackets table
CREATE TABLE public.income_tax_brackets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  range_start NUMERIC NOT NULL DEFAULT 0,
  range_end NUMERIC NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  deduction NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.income_tax_brackets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view tax brackets of their company"
  ON public.income_tax_brackets FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert tax brackets for their company"
  ON public.income_tax_brackets FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update tax brackets of their company"
  ON public.income_tax_brackets FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete tax brackets of their company"
  ON public.income_tax_brackets FOR DELETE
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_income_tax_brackets_updated_at
  BEFORE UPDATE ON public.income_tax_brackets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add IR fields to rental_installments
ALTER TABLE public.rental_installments
  ADD COLUMN IF NOT EXISTS tax_base_value NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS irrf_value NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS owner_net_value NUMERIC NULL;
