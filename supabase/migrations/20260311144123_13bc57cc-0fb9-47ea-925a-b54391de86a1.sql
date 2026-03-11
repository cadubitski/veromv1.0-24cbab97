
-- Create bank_accounts table
CREATE TABLE public.bank_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),

  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,

  agency_number TEXT NOT NULL,
  agency_digit TEXT,

  account_number TEXT NOT NULL,
  account_digit TEXT,

  account_name TEXT NOT NULL,

  initial_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,

  active BOOLEAN NOT NULL DEFAULT true,

  external_provider TEXT,
  external_account_id TEXT,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view bank accounts of their company"
  ON public.bank_accounts FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert bank accounts for their company"
  ON public.bank_accounts FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update bank accounts of their company"
  ON public.bank_accounts FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete bank accounts of their company"
  ON public.bank_accounts FOR DELETE
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
