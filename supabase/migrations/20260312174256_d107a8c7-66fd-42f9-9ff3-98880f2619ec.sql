
-- 1. Adicionar campo ir_table_effective_date na tabela rental_installments
ALTER TABLE public.rental_installments
  ADD COLUMN IF NOT EXISTS ir_table_effective_date date;

-- 2. Criar VIEW vw_owner_statement consolidando eventos financeiros do proprietário
CREATE OR REPLACE VIEW public.vw_owner_statement AS

-- EVENTO 1: Aluguel recebido (parcela paga)
SELECT
  rc.id::text               AS contract_id,
  c.client_id               AS owner_id,
  ri.id::text               AS installment_id,
  ar.paid_at                AS event_date,
  'Aluguel recebido'        AS description,
  COALESCE(ri.owner_net_value, ri.value) AS entrada,
  0::numeric                AS saida,
  rc.company_id             AS company_id,
  'rent_received'           AS event_type
FROM public.rental_installments ri
JOIN public.rental_contracts rc    ON rc.id = ri.contract_id
JOIN public.properties c           ON c.id = rc.property_id
JOIN public.accounts_receivable ar ON ar.id = ri.accounts_receivable_id
WHERE ri.financial_status IN ('paid', 'repasse_generated', 'repasse_paid')
  AND ar.paid_at IS NOT NULL

UNION ALL

-- EVENTO 2: Repasse ao proprietário (contas a pagar de repasse pago)
SELECT
  rc.id::text               AS contract_id,
  c.client_id               AS owner_id,
  ri.id::text               AS installment_id,
  ap.paid_at                AS event_date,
  'Repasse ao proprietário' AS description,
  0::numeric                AS entrada,
  COALESCE(ri.repasse_value, 0) AS saida,
  rc.company_id             AS company_id,
  'transfer_paid'           AS event_type
FROM public.rental_installments ri
JOIN public.rental_contracts rc ON rc.id = ri.contract_id
JOIN public.properties c        ON c.id = rc.property_id
JOIN public.accounts_payable ap ON ap.id = ri.repasse_accounts_payable_id
WHERE ri.financial_status = 'repasse_paid'
  AND ap.paid_at IS NOT NULL;
