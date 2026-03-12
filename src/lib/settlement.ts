/**
 * Shared baixa (settlement) logic for Contas a Receber and Contas a Pagar.
 * Both individual and batch baixa use this service.
 */
import { supabase } from "@/integrations/supabase/client";

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
}

export interface BaixaResult {
  success: boolean;
  error?: string;
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
