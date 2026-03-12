import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Loader2, Plus, Search, Eye, Pencil, Trash2,
  ArrowDownCircle, RotateCcw, Filter, Receipt,
  TrendingDown, Clock, Ban, FileDown, ChevronUp, ChevronDown,
  ListChecks, Square, CheckSquare,
} from "lucide-react";
import { StatusDot, ActionGear } from "@/components/TableActions";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import {
  PAYMENT_METHODS, settlePayable, batchSettlePayables,
  type BaixaParams, type PayableItem,
} from "@/lib/settlement";

// ─── Column definitions ───────────────────────────────────────────────────────

const ALL_COLUMNS: ColumnDef[] = [
  { key: "document_number", label: "Nº Documento",   defaultVisible: true },
  { key: "vendor_name",     label: "Fornecedor",      defaultVisible: true },
  { key: "description",     label: "Descrição",       defaultVisible: true },
  { key: "issue_date",      label: "Emissão",         defaultVisible: true },
  { key: "due_date",        label: "Vencimento",      defaultVisible: true },
  { key: "amount",          label: "Valor",           defaultVisible: true },
  { key: "source_type",     label: "Origem",          defaultVisible: true },
  { key: "paid_at",         label: "Pago em",         defaultVisible: false },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Payable {
  id: string;
  company_id: string;
  vendor_id: string | null;
  contract_id: string | null;
  installment_id: string | null;
  document_number: string;
  description: string;
  issue_date: string;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  source_type: "manual" | "owner_transfer" | "expense";
  paid_at: string | null;
  bank_account_id: string | null;
  bank_transaction_id: string | null;
  created_at: string;
  vendor_name?: string;
}

interface Vendor { id: string; full_name: string; }
interface BankAccount { id: string; account_name: string; bank_name: string; current_balance: number; }

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const statusLabel = (s: string) => {
  if (s === "paid") return "Pago";
  if (s === "cancelled") return "Cancelado";
  return "Pendente";
};

const sourceLabel = (s: string) => {
  if (s === "owner_transfer") return "Repasse Proprietário";
  if (s === "expense") return "Despesa";
  return "Manual";
};

const emptyBaixaForm = () => ({
  bank_account_id: "",
  paid_at: format(new Date(), "yyyy-MM-dd"),
  payment_method: "" as string,
  observation: "",
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContasPagar() {
  const { company } = useAuth();

  const [items, setItems] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(ALL_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  type SortKey = "document_number" | "vendor_name" | "description" | "issue_date" | "due_date" | "amount" | "paid_at";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 opacity-80 inline ml-1" />
      : <ChevronDown className="h-3 w-3 opacity-80 inline ml-1" />;
  };

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [viewItem, setViewItem] = useState<Payable | null>(null);
  const [editItem, setEditItem] = useState<Payable | null>(null);
  const [baixaItem, setBaixaItem] = useState<Payable | null>(null);
  const [cancelBaixaItem, setCancelBaixaItem] = useState<Payable | null>(null);
  const [deleteItem, setDeleteItem] = useState<Payable | null>(null);

  // Batch
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBaixaOpen, setBatchBaixaOpen] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);

  // Batch filters
  const [batchSearch, setBatchSearch] = useState("");
  const [batchFilterStatus, setBatchFilterStatus] = useState("all");
  const [batchFilterDateFrom, setBatchFilterDateFrom] = useState("");
  const [batchFilterDateTo, setBatchFilterDateTo] = useState("");
  const [batchFilterAmountMin, setBatchFilterAmountMin] = useState("");
  const [batchFilterAmountMax, setBatchFilterAmountMax] = useState("");

  const emptyForm = {
    document_number: "",
    vendor_id: "",
    description: "",
    issue_date: format(new Date(), "yyyy-MM-dd"),
    due_date: "",
    amount: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [baixaForm, setBaixaForm] = useState(emptyBaixaForm());
  const [savingBaixa, setSavingBaixa] = useState(false);

  // ── Load Data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!company) return;
    setLoading(true);

    const [{ data: payables }, { data: vendorsData }, { data: bankData }] = await Promise.all([
      supabase
        .from("accounts_payable")
        .select("*, clients(full_name)")
        .eq("company_id", company.id)
        .order("due_date", { ascending: false }),
      supabase.from("clients").select("id, full_name").eq("company_id", company.id).eq("status", "ativo").order("full_name"),
      supabase.from("bank_accounts").select("id, account_name, bank_name, current_balance").eq("company_id", company.id).eq("active", true).order("account_name"),
    ]);

    if (payables) {
      setItems(payables.map((r: any) => ({
        ...r,
        vendor_name: r.clients?.full_name ?? null,
        clients: undefined,
      })));
    }
    setVendors(vendorsData ?? []);
    setBankAccounts(bankData ?? []);
    setLoading(false);
  }, [company]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Validate document_number ───────────────────────────────────────────────
  const validateDocNumber = async (docNumber: string, excludeId?: string): Promise<boolean> => {
    let query = supabase
      .from("accounts_payable")
      .select("id")
      .eq("company_id", company!.id)
      .eq("document_number", docNumber.trim());
    if (excludeId) query = query.neq("id", excludeId);
    const { data } = await query.maybeSingle();
    return !data;
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.document_number.trim() || !form.description || !form.issue_date || !form.due_date || !form.amount) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    const isUnique = await validateDocNumber(form.document_number);
    if (!isUnique) { toast.error("O número do documento já está sendo utilizado em outro título."); setSaving(false); return; }
    const { error } = await supabase.from("accounts_payable").insert({
      company_id: company!.id,
      document_number: form.document_number.trim(),
      vendor_id: form.vendor_id || null,
      description: form.description,
      issue_date: form.issue_date,
      due_date: form.due_date,
      amount: parseCurrency(form.amount) ?? 0,
      source_type: "manual",
      status: "pending",
    });
    setSaving(false);
    if (error) { toast.error("Erro ao criar título: " + error.message); return; }
    toast.success("Título criado com sucesso.");
    setCreateOpen(false);
    setForm(emptyForm);
    fetchData();
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!editItem) return;
    if (!form.document_number.trim()) { toast.error("O número do documento é obrigatório."); return; }
    setSaving(true);
    const isUnique = await validateDocNumber(form.document_number, editItem.id);
    if (!isUnique) { toast.error("O número do documento já está sendo utilizado em outro título."); setSaving(false); return; }
    const { error } = await supabase.from("accounts_payable").update({
      document_number: form.document_number.trim(),
      vendor_id: form.vendor_id || null,
      description: form.description,
      issue_date: form.issue_date,
      due_date: form.due_date,
      amount: parseCurrency(form.amount) ?? 0,
    }).eq("id", editItem.id);
    setSaving(false);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    toast.success("Título atualizado.");
    setEditItem(null);
    fetchData();
  };

  const openEdit = (item: Payable) => {
    if (item.source_type !== "manual" || item.status !== "pending") { toast.warning("Este título não pode ser editado."); return; }
    setForm({ document_number: item.document_number, vendor_id: item.vendor_id ?? "", description: item.description, issue_date: item.issue_date, due_date: item.due_date, amount: item.amount.toFixed(2).replace(".", ",") });
    setEditItem(item);
  };

  // ── Individual Baixa ────────────────────────────────────────────────────────
  const handleBaixa = async () => {
    if (!baixaItem) return;
    if (!baixaForm.bank_account_id || !baixaForm.paid_at || !baixaForm.payment_method) {
      toast.error("Preencha conta bancária, data e forma de pagamento.");
      return;
    }
    setSavingBaixa(true);
    const params: BaixaParams = {
      companyId: company!.id,
      bankAccountId: baixaForm.bank_account_id,
      paidAt: baixaForm.paid_at,
      paymentMethod: baixaForm.payment_method as any,
      observation: baixaForm.observation || undefined,
    };
    const payableItem: PayableItem = {
      id: baixaItem.id,
      document_number: baixaItem.document_number,
      description: baixaItem.description,
      amount: baixaItem.amount,
      status: baixaItem.status,
      installment_id: baixaItem.installment_id,
    };
    const result = await settlePayable(payableItem, params);
    setSavingBaixa(false);
    if (!result.success) { toast.error(result.error); return; }
    toast.success("Pagamento registrado com sucesso.");
    setBaixaItem(null);
    setBaixaForm(emptyBaixaForm());
    fetchData();
  };

  // ── Cancelar Baixa ──────────────────────────────────────────────────────────
  const handleCancelBaixa = async () => {
    if (!cancelBaixaItem) return;
    setSavingBaixa(true);
    try {
      const txId = cancelBaixaItem.bank_transaction_id;
      const { error: unlinkErr } = await supabase.from("accounts_payable").update({
        status: "pending", paid_at: null, bank_account_id: null, bank_transaction_id: null,
      }).eq("id", cancelBaixaItem.id);
      if (unlinkErr) throw new Error("Erro ao atualizar título: " + unlinkErr.message);
      if (txId) {
        const { error: delErr } = await supabase.from("bank_transactions").delete().eq("id", txId);
        if (delErr) throw new Error("Erro ao excluir movimentação bancária: " + delErr.message);
      }
      toast.success("Pagamento cancelado. Título voltou para pendente.");
      setCancelBaixaItem(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingBaixa(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteItem) return;
    const { error } = await supabase.from("accounts_payable").delete().eq("id", deleteItem.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Título excluído.");
    setDeleteItem(null);
    fetchData();
  };

  // ── Batch helpers ───────────────────────────────────────────────────────────
  const batchFiltered = useMemo(() => {
    return items.filter((i) => {
      const q = batchSearch.toLowerCase();
      const matchSearch =
        i.description.toLowerCase().includes(q) ||
        i.document_number.toLowerCase().includes(q) ||
        (i.vendor_name ?? "").toLowerCase().includes(q);
      const matchStatus = batchFilterStatus === "all" || i.status === batchFilterStatus;
      const matchFrom = !batchFilterDateFrom || i.due_date >= batchFilterDateFrom;
      const matchTo = !batchFilterDateTo || i.due_date <= batchFilterDateTo;
      const amt = i.amount;
      const matchMin = !batchFilterAmountMin || amt >= parseFloat(batchFilterAmountMin.replace(",", "."));
      const matchMax = !batchFilterAmountMax || amt <= parseFloat(batchFilterAmountMax.replace(",", "."));
      return matchSearch && matchStatus && matchFrom && matchTo && matchMin && matchMax;
    });
  }, [items, batchSearch, batchFilterStatus, batchFilterDateFrom, batchFilterDateTo, batchFilterAmountMin, batchFilterAmountMax]);

  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedIds(new Set(batchFiltered.map((i) => i.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const selectedItems = items.filter((i) => selectedIds.has(i.id));
  const selectedTotal = selectedItems.reduce((s, i) => s + i.amount, 0);
  const selectedPendingItems = selectedItems.filter((i) => i.status !== "paid");

  const handleBatchConfirm = async () => {
    if (!baixaForm.bank_account_id || !baixaForm.paid_at || !baixaForm.payment_method) {
      toast.error("Preencha conta bancária, data e forma de pagamento.");
      return;
    }
    setBatchConfirmOpen(false);
    setSavingBaixa(true);
    const params: BaixaParams = {
      companyId: company!.id,
      bankAccountId: baixaForm.bank_account_id,
      paidAt: baixaForm.paid_at,
      paymentMethod: baixaForm.payment_method as any,
      observation: baixaForm.observation || undefined,
    };
    const toSettle: PayableItem[] = selectedItems.map((i) => ({
      id: i.id, document_number: i.document_number, description: i.description, amount: i.amount, status: i.status, installment_id: i.installment_id,
    }));
    const result = await batchSettlePayables(toSettle, params);
    setSavingBaixa(false);
    if (result.succeeded > 0) toast.success(`${result.succeeded} título(s) pago(s) com sucesso.`);
    if (result.failed > 0) toast.warning(`${result.failed} título(s) ignorados (já pagos ou com erro).`);
    setBatchBaixaOpen(false);
    setSelectedIds(new Set());
    setBaixaForm(emptyBaixaForm());
    fetchData();
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const colMap: Record<string, (i: Payable) => any> = {
      document_number: (i) => i.document_number, vendor_name: (i) => i.vendor_name ?? "—", description: (i) => i.description,
      issue_date: (i) => fmtDate(i.issue_date), due_date: (i) => fmtDate(i.due_date), amount: (i) => i.amount,
      source_type: (i) => sourceLabel(i.source_type), paid_at: (i) => fmtDate(i.paid_at),
    };
    const labelMap: Record<string, string> = {
      document_number: "Nº Documento", vendor_name: "Fornecedor", description: "Descrição",
      issue_date: "Emissão", due_date: "Vencimento", amount: "Valor (R$)", source_type: "Origem", paid_at: "Pago em",
    };
    const rows = filtered.map((i) => {
      const row: Record<string, any> = {};
      ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).forEach((c) => { row[labelMap[c.key]] = colMap[c.key](i); });
      row["Status"] = statusLabel(i.status);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas_pagar_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalAll       = items.reduce((s, i) => s + i.amount, 0);
  const totalPending   = items.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalPaid      = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCancelled = items.filter((i) => i.status === "cancelled").reduce((s, i) => s + i.amount, 0);

  const filtered = useMemo(() => {
    const base = items.filter((i) => {
      const matchSearch =
        i.description.toLowerCase().includes(search.toLowerCase()) ||
        i.document_number.toLowerCase().includes(search.toLowerCase()) ||
        (i.vendor_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "all" || i.status === filterStatus;
      return matchSearch && matchStatus;
    });
    return [...base].sort((a, b) => {
      const va = sortKey === "amount" ? a.amount : ((a[sortKey as keyof typeof a] ?? "") as string);
      const vb = sortKey === "amount" ? b.amount : ((b[sortKey as keyof typeof b] ?? "") as string);
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [items, search, filterStatus, sortKey, sortDir]);

  const canEdit = (item: Payable) => item.source_type === "manual" && item.status === "pending";
  const canDelete = (item: Payable) => item.status === "pending" && item.source_type === "manual";

  // ── Shared baixa form fields ─────────────────────────────────────────────────
  const BaixaFormFields = () => (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>Conta bancária <span className="text-destructive">*</span></Label>
        <Select value={baixaForm.bank_account_id} onValueChange={(v) => setBaixaForm((f) => ({ ...f, bank_account_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
          <SelectContent>
            {bankAccounts.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.account_name} — {b.bank_name} ({fmt(b.current_balance)})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Data do pagamento <span className="text-destructive">*</span></Label>
          <Input type="date" value={baixaForm.paid_at} onChange={(e) => setBaixaForm((f) => ({ ...f, paid_at: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Forma de pagamento <span className="text-destructive">*</span></Label>
          <Select value={baixaForm.payment_method} onValueChange={(v) => setBaixaForm((f) => ({ ...f, payment_method: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Observação</Label>
        <Textarea value={baixaForm.observation} onChange={(e) => setBaixaForm((f) => ({ ...f, observation: e.target.value }))} placeholder="Observação opcional..." rows={2} />
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contas a Pagar</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie títulos a pagar e registre pagamentos</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={batchMode ? "default" : "outline"}
              onClick={() => { setBatchMode((v) => !v); setSelectedIds(new Set()); }}
              className="gap-2"
            >
              <ListChecks className="h-4 w-4" />
              {batchMode ? "Sair da Baixa em Lote" : "Baixa em Lote"}
            </Button>
            <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            <Button variant="outline" size="sm" className="gap-2 h-9" onClick={handleExport}>
              <FileDown className="h-4 w-4" /> Exportar
            </Button>
            <Button onClick={() => { setForm(emptyForm); setCreateOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Título
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground font-medium">Total Geral</p></CardHeader><CardContent className="px-4 pb-4"><p className="text-lg font-bold">{fmt(totalAll)}</p></CardContent></Card>
          <Card><CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-amber-500" /> Pendente</p></CardHeader><CardContent className="px-4 pb-4"><p className="text-lg font-bold text-amber-600">{fmt(totalPending)}</p></CardContent></Card>
          <Card><CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-emerald-500" /> Pago</p></CardHeader><CardContent className="px-4 pb-4"><p className="text-lg font-bold text-emerald-600">{fmt(totalPaid)}</p></CardContent></Card>
          <Card><CardHeader className="pb-1 pt-4 px-4"><p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5"><Ban className="h-3.5 w-3.5 text-destructive" /> Cancelado</p></CardHeader><CardContent className="px-4 pb-4"><p className="text-lg font-bold text-destructive">{fmt(totalCancelled)}</p></CardContent></Card>
        </div>

        {/* ── BATCH MODE ── */}
        {batchMode ? (
          <div className="space-y-4">
            <Card className="border-0 shadow-card">
              <CardHeader className="pb-3"><p className="font-semibold text-sm">Filtros — Baixa em Lote</p></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Busca</Label>
                    <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input className="pl-8 h-8 text-sm" value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={batchFilterStatus} onValueChange={setBatchFilterStatus}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                        <SelectItem value="paid">Pago</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimento de</Label>
                    <Input type="date" className="h-8 text-sm" value={batchFilterDateFrom} onChange={(e) => setBatchFilterDateFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimento até</Label>
                    <Input type="date" className="h-8 text-sm" value={batchFilterDateTo} onChange={(e) => setBatchFilterDateTo(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor mínimo</Label>
                    <Input className="h-8 text-sm" placeholder="0,00" value={batchFilterAmountMin} onChange={(e) => setBatchFilterAmountMin(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor máximo</Label>
                    <Input className="h-8 text-sm" placeholder="0,00" value={batchFilterAmountMax} onChange={(e) => setBatchFilterAmountMax(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="outline" size="sm" className="gap-2 h-8" onClick={selectAll}><CheckSquare className="h-3.5 w-3.5" /> Marcar todos</Button>
              <Button variant="outline" size="sm" className="gap-2 h-8" onClick={deselectAll}><Square className="h-3.5 w-3.5" /> Desmarcar todos</Button>
              <span className="text-sm text-muted-foreground">{selectedIds.size} selecionado(s) — {fmt(selectedTotal)}</span>
              {selectedIds.size > 0 && (
                <Button size="sm" className="gap-2 h-8 ml-auto" onClick={() => { setBaixaForm(emptyBaixaForm()); setBatchBaixaOpen(true); }} disabled={savingBaixa}>
                  <ArrowDownCircle className="h-3.5 w-3.5" /> Baixar selecionados ({selectedIds.size})
                </Button>
              )}
            </div>

            <Card className="border-0 shadow-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Nº Documento</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batchFiltered.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhum título encontrado.</TableCell></TableRow>
                      ) : batchFiltered.map((item) => (
                        <TableRow key={item.id} className={selectedIds.has(item.id) ? "bg-primary/5" : ""}>
                          <TableCell><Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>
                          <TableCell className="font-mono text-xs">{item.document_number}</TableCell>
                          <TableCell className="text-sm">{item.vendor_name ?? "—"}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">{item.description}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.due_date)}</TableCell>
                          <TableCell className="text-sm font-mono">{fmt(item.amount)}</TableCell>
                          <TableCell>
                            <Badge variant={item.status === "paid" ? "default" : item.status === "cancelled" ? "destructive" : "outline"} className="text-xs">
                              {statusLabel(item.status)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* ── NORMAL MODE ── */
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por documento, descrição, fornecedor..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2 text-muted-foreground" /><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Receipt className="h-10 w-10 mb-3 opacity-30" /><p className="text-sm">Nenhum título encontrado</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-px whitespace-nowrap">Status</TableHead>
                        {visibleCols.has("document_number") && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("document_number")}>Nº Documento <SortIcon col="document_number" /></TableHead>}
                        {visibleCols.has("vendor_name")     && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("vendor_name")}>Fornecedor <SortIcon col="vendor_name" /></TableHead>}
                        {visibleCols.has("description")     && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("description")}>Descrição <SortIcon col="description" /></TableHead>}
                        {visibleCols.has("issue_date")      && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("issue_date")}>Emissão <SortIcon col="issue_date" /></TableHead>}
                        {visibleCols.has("due_date")        && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("due_date")}>Vencimento <SortIcon col="due_date" /></TableHead>}
                        {visibleCols.has("amount")          && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("amount")}>Valor <SortIcon col="amount" /></TableHead>}
                        {visibleCols.has("source_type")     && <TableHead>Origem</TableHead>}
                        {visibleCols.has("paid_at")         && <TableHead className="cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("paid_at")}>Pago em <SortIcon col="paid_at" /></TableHead>}
                        <TableHead className="w-px whitespace-nowrap">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="w-px whitespace-nowrap"><StatusDot status={item.status} /></TableCell>
                          {visibleCols.has("document_number") && <TableCell className="font-mono text-xs">{item.document_number}</TableCell>}
                          {visibleCols.has("vendor_name")     && <TableCell className="text-sm">{item.vendor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>}
                          {visibleCols.has("description")     && <TableCell className="max-w-[200px] truncate text-sm">{item.description}</TableCell>}
                          {visibleCols.has("issue_date")      && <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.issue_date)}</TableCell>}
                          {visibleCols.has("due_date")        && <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.due_date)}</TableCell>}
                          {visibleCols.has("amount")          && <TableCell className="text-sm font-medium whitespace-nowrap">{fmt(item.amount)}</TableCell>}
                          {visibleCols.has("source_type")     && <TableCell><Badge variant="outline" className="text-xs">{sourceLabel(item.source_type)}</Badge></TableCell>}
                          {visibleCols.has("paid_at")         && <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.paid_at)}</TableCell>}
                          <TableCell className="w-px whitespace-nowrap">
                            <ActionGear
                              legendKeys={["paid", "pending", "cancelled"]}
                              actions={[
                                { label: "Visualizar", icon: <Eye className="h-4 w-4" />, onClick: () => setViewItem(item) },
                                ...(item.status === "pending" ? [{ label: "Registrar Pagamento", icon: <ArrowDownCircle className="h-4 w-4" />, onClick: () => { setBaixaForm(emptyBaixaForm()); setBaixaItem(item); } }] : []),
                                ...(item.status === "paid" ? [{ label: "Cancelar Pagamento", icon: <RotateCcw className="h-4 w-4" />, onClick: () => setCancelBaixaItem(item) }] : []),
                                ...(canEdit(item) ? [{ label: "Editar", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(item) }] : []),
                                ...(canDelete(item) ? [{ label: "Excluir", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteItem(item), variant: "destructive" as const }] : []),
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Create Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Título a Pagar</DialogTitle><DialogDescription>Preencha os dados do título manual</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nº Documento <span className="text-destructive">*</span></Label><Input placeholder="Ex: NF-2024-001" value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Emissão <span className="text-destructive">*</span></Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Fornecedor / Beneficiário</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descrição <span className="text-destructive">*</span></Label><Input placeholder="Descreva o título..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Vencimento <span className="text-destructive">*</span></Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Valor <span className="text-destructive">*</span></Label><Input placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: maskCurrency(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Título</DialogTitle><DialogDescription>Apenas títulos manuais pendentes podem ser editados</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Nº Documento <span className="text-destructive">*</span></Label><Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Emissão <span className="text-destructive">*</span></Label><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Fornecedor / Beneficiário</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descrição <span className="text-destructive">*</span></Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Vencimento <span className="text-destructive">*</span></Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Valor <span className="text-destructive">*</span></Label><Input value={form.amount} onChange={(e) => setForm({ ...form, amount: maskCurrency(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader><DialogTitle>Detalhes do Título</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Nº Documento</p><p className="font-mono font-medium">{viewItem.document_number}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{statusLabel(viewItem.status)}</p></div>
              </div>
              <Separator />
              <div><p className="text-xs text-muted-foreground">Descrição</p><p>{viewItem.description}</p></div>
              {viewItem.vendor_name && <div><p className="text-xs text-muted-foreground">Fornecedor / Beneficiário</p><p>{viewItem.vendor_name}</p></div>}
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-xs text-muted-foreground">Emissão</p><p>{fmtDate(viewItem.issue_date)}</p></div>
                <div><p className="text-xs text-muted-foreground">Vencimento</p><p>{fmtDate(viewItem.due_date)}</p></div>
                <div><p className="text-xs text-muted-foreground">Valor</p><p className="font-semibold">{fmt(viewItem.amount)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Origem</p><p>{sourceLabel(viewItem.source_type)}</p></div>
                {viewItem.paid_at && <div><p className="text-xs text-muted-foreground">Pago em</p><p>{fmtDate(viewItem.paid_at)}</p></div>}
              </div>
            </div>
          )}
          <DialogFooter className="pt-2 border-t border-border mt-2"><Button variant="outline" onClick={() => setViewItem(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Individual Baixa ────────────────────────────────────────────────── */}
      <Dialog open={!!baixaItem} onOpenChange={(o) => !o && setBaixaItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>{baixaItem && <><strong>{baixaItem.document_number}</strong> — {fmt(baixaItem.amount)}</>}</DialogDescription>
          </DialogHeader>
          <BaixaFormFields />
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setBaixaItem(null)}>Cancelar</Button>
            <Button onClick={handleBaixa} disabled={savingBaixa}>
              {savingBaixa && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Baixa — form ───────────────────────────────────────────────── */}
      <Dialog open={batchBaixaOpen} onOpenChange={(o) => !o && setBatchBaixaOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" /> Baixa em Lote</DialogTitle>
            <DialogDescription>{selectedIds.size} título(s) selecionado(s) — Total: <strong>{fmt(selectedTotal)}</strong></DialogDescription>
          </DialogHeader>
          <BaixaFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchBaixaOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (!baixaForm.bank_account_id || !baixaForm.paid_at || !baixaForm.payment_method) { toast.error("Preencha conta bancária, data e forma de pagamento."); return; }
              setBatchBaixaOpen(false); setBatchConfirmOpen(true);
            }}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Batch Baixa — confirm ────────────────────────────────────────────── */}
      <AlertDialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Baixa em Lote?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Você está prestes a realizar a baixa financeira dos títulos selecionados.</p>
                <p>Essa operação irá registrar movimentações bancárias e atualizar os títulos como pagos.</p>
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Títulos pendentes:</span><span className="font-semibold">{selectedPendingItems.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Valor total:</span><span className="font-semibold">{fmt(selectedPendingItems.reduce((s, i) => s + i.amount, 0))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Data da baixa:</span><span className="font-semibold">{fmtDate(baixaForm.paid_at)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Conta:</span><span className="font-semibold">{bankAccounts.find(b => b.id === baixaForm.bank_account_id)?.account_name ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Forma pagamento:</span><span className="font-semibold">{baixaForm.payment_method}</span></div>
                </div>
                <p className="text-muted-foreground text-sm">Deseja continuar?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setBatchConfirmOpen(false); setBatchBaixaOpen(true); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchConfirm} disabled={savingBaixa}>
              {savingBaixa && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar baixa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel Baixa ─────────────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelBaixaItem} onOpenChange={(o) => !o && setCancelBaixaItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Pagamento?</AlertDialogTitle>
            <AlertDialogDescription>A movimentação bancária vinculada será removida e o saldo da conta será recalculado automaticamente. O título voltará para <strong>Pendente</strong>.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBaixa} disabled={savingBaixa} className="bg-destructive hover:bg-destructive/90">
              {savingBaixa && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Título?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O título <strong>{deleteItem?.document_number}</strong> será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
