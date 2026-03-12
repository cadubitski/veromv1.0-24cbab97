
-- ============================================================
-- ÍNDICES DE PERFORMANCE - Verom
-- Objetivo: otimizar queries de listagem, filtros, joins e
--           relatórios fiscais (DIMOB, Informe, Conta Corrente)
-- Nenhuma lógica de negócio alterada.
-- ============================================================

-- -------------------------------------------------------
-- accounts_receivable
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ar_company_status_paid_at
  ON public.accounts_receivable (company_id, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_ar_installment_id
  ON public.accounts_receivable (installment_id)
  WHERE installment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_contract_id
  ON public.accounts_receivable (contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_client_id
  ON public.accounts_receivable (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ar_company_due_date
  ON public.accounts_receivable (company_id, due_date);

-- -------------------------------------------------------
-- accounts_payable
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ap_company_status_paid_at
  ON public.accounts_payable (company_id, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_ap_installment_id
  ON public.accounts_payable (installment_id)
  WHERE installment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ap_contract_id
  ON public.accounts_payable (contract_id)
  WHERE contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ap_vendor_id
  ON public.accounts_payable (vendor_id)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ap_company_due_date
  ON public.accounts_payable (company_id, due_date);

-- -------------------------------------------------------
-- rental_installments
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ri_contract_id
  ON public.rental_installments (contract_id);

CREATE INDEX IF NOT EXISTS idx_ri_company_financial_status
  ON public.rental_installments (company_id, financial_status);

CREATE INDEX IF NOT EXISTS idx_ri_accounts_receivable_id
  ON public.rental_installments (accounts_receivable_id)
  WHERE accounts_receivable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ri_repasse_ap_id
  ON public.rental_installments (repasse_accounts_payable_id)
  WHERE repasse_accounts_payable_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ri_company_due_date
  ON public.rental_installments (company_id, due_date);

-- -------------------------------------------------------
-- rental_contracts
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rc_property_id
  ON public.rental_contracts (property_id);

CREATE INDEX IF NOT EXISTS idx_rc_tenant_id
  ON public.rental_contracts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_rc_company_status
  ON public.rental_contracts (company_id, status);

-- -------------------------------------------------------
-- properties
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_prop_client_id
  ON public.properties (client_id);

CREATE INDEX IF NOT EXISTS idx_prop_company_status
  ON public.properties (company_id, status);

-- -------------------------------------------------------
-- clients
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_company_status
  ON public.clients (company_id, status);

-- -------------------------------------------------------
-- tenants
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tenants_company_status
  ON public.tenants (company_id, status);

-- -------------------------------------------------------
-- bank_transactions
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bt_account_date
  ON public.bank_transactions (bank_account_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_bt_origin_id
  ON public.bank_transactions (origin_id)
  WHERE origin_id IS NOT NULL;

-- -------------------------------------------------------
-- bank_accounts
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ba_company_active
  ON public.bank_accounts (company_id, active);
