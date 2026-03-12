/**
 * Shared baixa (settlement) logic for Contas a Receber and Contas a Pagar.
 * Both individual and batch baixa use this service.
 */
import { supabase } from "@/integrations/supabase/client";
import { addDays, format, parseISO } from "date-fns";

export const PAYMENT_METHODS = [
  { value: "PIX",           label: "PIX" },
  { value: "Boleto",        label: "Boleto" },
  { value: "Transferência", label: "Transferência" },
  { value: "TED",           label: "TED" },
  { value: "DOC",           label: "DOC" },
  { value: "Dinheiro",      label: "Dinheiro" },
  { value: "Cartão",        label: "Cartão" },
  { value: "Outro",         label: "Outro" },
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number]["value"];

export interface BaixaParams {
  companyId: string;
  bankAccountId: string;
  paidAt: string;          // yyyy-MM-dd
  paymentMethod: PaymentMethod;
  observation?: string;
}

export interface ReceivableItem {
  id: string;
  document_number: string;
  description: string;
  amount: number;
  status: string;
  installment_id?: string | null;
}

export interface PayableItem {
  id: string;
  document_number: string;
  description: string;
  amount: number;
  status: string;
  installment_id?: string | null;
}

export interface BaixaResult {
  success: boolean;
  error?: string;
}

/**
 * After a rent receivable is paid, automatically generate an accounts_payable
 * repasse (transfer) to the property owner.
 *
 * This function is idempotent: if the installment already has a
 * repasse_accounts_payable_id it does nothing.
 *
 * Called by: settleReceivable, future webhooks, etc.
 */
export async function processRentReceipt(receivableId: string): Promise<void> {
  try {
    // 1. Find the installment linked to this receivable
    const { data: installment, error: instErr } = await supabase
      .from("rental_installments")
      .select("id, company_id, contract_id, owner_net_value, repasse_accounts_payable_id, financial_status, competence")
      .eq("accounts_receivable_id", receivableId)
      .maybeSingle();

    if (instErr || !installment) return; // not a contract installment — skip

    // 2. Idempotency: skip if repasse already generated
    if (installment.repasse_accounts_payable_id) return;

    const ownerNet = installment.owner_net_value;
    if (!ownerNet || ownerNet <= 0) return; // nothing to repasse

    // 3. Load contract to get repasse_days_after_receipt and owner info
    const { data: contract, error: contractErr } = await supabase
      .from("rental_contracts")
      .select("id, code, repasse_days_after_receipt, property_id")
      .eq("id", installment.contract_id)
      .maybeSingle();

    if (contractErr || !contract) return;

    // 4. Get the paid_at date from the receivable (used for due date calc)
    const { data: receivable } = await supabase
      .from("accounts_receivable")
      .select("paid_at")
      .eq("id", receivableId)
      .maybeSingle();

    if (!receivable?.paid_at) return;

    // 5. Calculate due date: paid_at + repasse_days_after_receipt
    const daysAfter = contract.repasse_days_after_receipt ?? 5;
    const dueDate = format(
      addDays(parseISO(receivable.paid_at), daysAfter),
      "yyyy-MM-dd"
    );

    // 6. Get owner (client_id) from property
    const { data: property } = await supabase
      .from("properties")
      .select("client_id")
      .eq("id", contract.property_id)
      .maybeSingle();

    const ownerId = property?.client_id ?? null;

    // 7. Build document number: REPR-{contractRef}-{YYYYMM from competence}
    const [month, year] = installment.competence.split("/");
    const compYYYYMM = `${year}${month}`;
    const contractRef = contract.code ?? contract.id.slice(0, 8);
    let docNumber = `REPR-${contractRef}-${compYYYYMM}`;

    // Ensure uniqueness (add suffix if collision)
    const { data: existing } = await supabase
      .from("accounts_payable")
      .select("id")
      .eq("company_id", installment.company_id)
      .eq("document_number", docNumber)
      .maybeSingle();

    if (existing) {
      docNumber = `${docNumber}-${installment.id.slice(0, 4)}`;
    }

    // 8. Create the accounts_payable record
    const { data: apData, error: apErr } = await supabase
      .from("accounts_payable")
      .insert({
        company_id: installment.company_id,
        vendor_id: ownerId,
        contract_id: installment.contract_id,
        installment_id: installment.id,
        document_number: docNumber,
        description: `Repasse proprietário - Contrato ${contractRef} - ${installment.competence}`,
        issue_date: receivable.paid_at,
        due_date: dueDate,
        amount: ownerNet,
        source_type: "owner_transfer",
        status: "pending",
      })
      .select("id")
      .single();

    if (apErr || !apData) {
      console.error("[processRentReceipt] Erro ao criar CP de repasse:", apErr?.message);
      return;
    }

    // 9. Update installment: link repasse and set financial_status = repasse_generated
    await supabase
      .from("rental_installments")
      .update({
        repasse_accounts_payable_id: apData.id,
        financial_status: "repasse_generated",
        updated_at: new Date().toISOString(),
      })
      .eq("id", installment.id);
  } catch (err: any) {
    console.error("[processRentReceipt] Erro inesperado:", err.message);
  }
}

/** Settle a single accounts_receivable record */
export async function settleReceivable(
  item: ReceivableItem,
  params: BaixaParams
): Promise<BaixaResult> {
  if (item.status === "paid") {
    return { success: false, error: `Título ${item.document_number} já está pago.` };
  }
  try {
    const docNumber = `${item.document_number}-R`;
    const description = params.observation
      ? `Recebimento: ${item.description} — ${params.observation}`
      : `Recebimento de título: ${item.description}`;

    const { data: txData, error: txErr } = await supabase
      .from("bank_transactions")
      .insert({
        company_id: params.companyId,
        bank_account_id: params.bankAccountId,
        transaction_date: params.paidAt,
        document_number: docNumber,
        type: "credit",
        amount: item.amount,
        description,
        origin_type: "contas_receber",
        origin_id: item.id,
        payment_method: params.paymentMethod,
      })
      .select("id")
      .single();

    if (txErr || !txData) throw new Error(txErr?.message ?? "Erro ao criar movimentação");

    const { error: updErr } = await supabase
      .from("accounts_receivable")
      .update({
        status: "paid",
        paid_at: params.paidAt,
        bank_account_id: params.bankAccountId,
        bank_transaction_id: txData.id,
      })
      .eq("id", item.id);

    if (updErr) throw new Error(updErr.message);

    // Auto-update linked rental installment
    if (item.installment_id) {
      await supabase
        .from("rental_installments")
        .update({
          status: "pago",
          paid_at: params.paidAt,
          financial_status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.installment_id);

      // Generate repasse accounts_payable automatically
      await processRentReceipt(item.id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Settle a single accounts_payable record */
export async function settlePayable(
  item: PayableItem,
  params: BaixaParams
): Promise<BaixaResult> {
  if (item.status === "paid") {
    return { success: false, error: `Título ${item.document_number} já está pago.` };
  }
  try {
    const docNumber = `${item.document_number}-P`;
    const description = params.observation
      ? `Pagamento: ${item.description} — ${params.observation}`
      : `Pagamento de título: ${item.description}`;

    const { data: txData, error: txErr } = await supabase
      .from("bank_transactions")
      .insert({
        company_id: params.companyId,
        bank_account_id: params.bankAccountId,
        transaction_date: params.paidAt,
        document_number: docNumber,
        type: "debit",
        amount: item.amount,
        description,
        origin_type: "contas_pagar",
        origin_id: item.id,
        payment_method: params.paymentMethod,
      })
      .select("id")
      .single();

    if (txErr || !txData) throw new Error(txErr?.message ?? "Erro ao criar movimentação");

    const { error: updErr } = await supabase
      .from("accounts_payable")
      .update({
        status: "paid",
        paid_at: params.paidAt,
        bank_account_id: params.bankAccountId,
        bank_transaction_id: txData.id,
      })
      .eq("id", item.id);

    if (updErr) throw new Error(updErr.message);

    // If this payable is linked to an installment as the repasse, update financial_status
    if (item.installment_id) {
      // Check if this payable is actually the repasse payable for the installment
      const { data: inst } = await supabase
        .from("rental_installments")
        .select("repasse_accounts_payable_id")
        .eq("id", item.installment_id)
        .maybeSingle();

      if (inst?.repasse_accounts_payable_id === item.id) {
        await supabase
          .from("rental_installments")
          .update({
            financial_status: "repasse_paid",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.installment_id);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Batch settle multiple receivables. Returns counts of success/fail. */
export async function batchSettleReceivables(
  items: ReceivableItem[],
  params: BaixaParams
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const pending = items.filter((i) => i.status !== "paid").slice(0, 500);
  let succeeded = 0;
  const errors: string[] = [];

  for (const item of pending) {
    const result = await settleReceivable(item, params);
    if (result.success) succeeded++;
    else if (result.error) errors.push(result.error);
  }

  return { succeeded, failed: errors.length, errors };
}

/** Batch settle multiple payables. Returns counts of success/fail. */
export async function batchSettlePayables(
  items: PayableItem[],
  params: BaixaParams
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const pending = items.filter((i) => i.status !== "paid").slice(0, 500);
  let succeeded = 0;
  const errors: string[] = [];

  for (const item of pending) {
    const result = await settlePayable(item, params);
    if (result.success) succeeded++;
    else if (result.error) errors.push(result.error);
  }

  return { succeeded, failed: errors.length, errors };
}
