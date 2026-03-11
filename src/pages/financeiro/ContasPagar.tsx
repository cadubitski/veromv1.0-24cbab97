import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Search, Eye, Pencil, Trash2,
  ArrowDownCircle, RotateCcw, Filter, Receipt,
  TrendingDown, Clock, Ban, FileDown
} from "lucide-react";
import { StatusDot, ActionGear } from "@/components/TableActions";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

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
  // joined
  vendor_name?: string;
}

interface Vendor {
  id: string;
  full_name: string;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  current_balance: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const statusColor = (s: string): "green" | "red" | "yellow" => {
  if (s === "paid") return "green";
  if (s === "cancelled") return "red";
  return "yellow";
};

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

  // Vendors & bank accounts
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [viewItem, setViewItem] = useState<Payable | null>(null);
  const [editItem, setEditItem] = useState<Payable | null>(null);
  const [baixaItem, setBaixaItem] = useState<Payable | null>(null);
  const [cancelBaixaItem, setCancelBaixaItem] = useState<Payable | null>(null);
  const [deleteItem, setDeleteItem] = useState<Payable | null>(null);

  // Forms
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

  const emptyBaixa = { bank_account_id: "", paid_at: format(new Date(), "yyyy-MM-dd") };
  const [baixaForm, setBaixaForm] = useState(emptyBaixa);
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
      setItems(
        payables.map((r: any) => ({
          ...r,
          vendor_name: r.clients?.full_name ?? null,
          clients: undefined,
        }))
      );
    }
    setVendors(vendorsData ?? []);
    setBankAccounts(bankData ?? []);
    setLoading(false);
  }, [company]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Validate document_number uniqueness ────────────────────────────────────
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
    if (!isUnique) {
      toast.error("O número do documento já está sendo utilizado em outro título.");
      setSaving(false);
      return;
    }
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
    if (!form.document_number.trim()) {
      toast.error("O número do documento é obrigatório.");
      return;
    }
    setSaving(true);
    const isUnique = await validateDocNumber(form.document_number, editItem.id);
    if (!isUnique) {
      toast.error("O número do documento já está sendo utilizado em outro título.");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("accounts_payable")
      .update({
        document_number: form.document_number.trim(),
        vendor_id: form.vendor_id || null,
        description: form.description,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount: parseCurrency(form.amount) ?? 0,
      })
      .eq("id", editItem.id);
    setSaving(false);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    toast.success("Título atualizado.");
    setEditItem(null);
    fetchData();
  };

  const openEdit = (item: Payable) => {
    if (item.source_type !== "manual" || item.status !== "pending") {
      toast.warning("Este título não pode ser editado.");
      return;
    }
    setForm({
      document_number: item.document_number,
      vendor_id: item.vendor_id ?? "",
      description: item.description,
      issue_date: item.issue_date,
      due_date: item.due_date,
      amount: item.amount.toFixed(2).replace(".", ","),
    });
    setEditItem(item);
  };

  // ── Baixa (Mark as Paid) ────────────────────────────────────────────────────
  const handleBaixa = async () => {
    if (!baixaItem || !baixaForm.bank_account_id || !baixaForm.paid_at) {
      toast.error("Selecione a conta bancária e a data de pagamento.");
      return;
    }
    setSavingBaixa(true);
    try {
      const { data: txData, error: txErr } = await supabase
        .from("bank_transactions")
        .insert({
          company_id: company!.id,
          bank_account_id: baixaForm.bank_account_id,
          transaction_date: baixaForm.paid_at,
          document_number: `${baixaItem.document_number}-P`,
          type: "debit",
          amount: baixaItem.amount,
          description: `Pagamento de título: ${baixaItem.description}`,
          origin_type: "contas_pagar",
          origin_id: baixaItem.id,
        })
        .select("id")
        .single();

      if (txErr || !txData) throw new Error(txErr?.message ?? "Erro ao criar movimentação");

      const { error: updErr } = await supabase
        .from("accounts_payable")
        .update({
          status: "paid",
          paid_at: baixaForm.paid_at,
          bank_account_id: baixaForm.bank_account_id,
          bank_transaction_id: txData.id,
        })
        .eq("id", baixaItem.id);

      if (updErr) throw new Error(updErr.message);

      toast.success("Pagamento registrado com sucesso.");
      setBaixaItem(null);
      setBaixaForm(emptyBaixa);
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingBaixa(false);
    }
  };

  // ── Cancelar Baixa ──────────────────────────────────────────────────────────
  const handleCancelBaixa = async () => {
    if (!cancelBaixaItem) return;
    setSavingBaixa(true);
    try {
      if (cancelBaixaItem.bank_transaction_id) {
        const { error: delErr } = await supabase
          .from("bank_transactions")
          .delete()
          .eq("id", cancelBaixaItem.bank_transaction_id);
        if (delErr) throw new Error(delErr.message);
      }

      const { error: updErr } = await supabase
        .from("accounts_payable")
        .update({
          status: "pending",
          paid_at: null,
          bank_account_id: null,
          bank_transaction_id: null,
        })
        .eq("id", cancelBaixaItem.id);

      if (updErr) throw new Error(updErr.message);

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

  // ── Export to Excel ─────────────────────────────────────────────────────────
  const handleExport = () => {
    const colMap: Record<string, (i: Payable) => any> = {
      document_number: (i) => i.document_number,
      vendor_name:     (i) => i.vendor_name ?? "—",
      description:     (i) => i.description,
      issue_date:      (i) => fmtDate(i.issue_date),
      due_date:        (i) => fmtDate(i.due_date),
      amount:          (i) => i.amount,
      source_type:     (i) => sourceLabel(i.source_type),
      paid_at:         (i) => fmtDate(i.paid_at),
    };
    const labelMap: Record<string, string> = {
      document_number: "Nº Documento",
      vendor_name:     "Fornecedor",
      description:     "Descrição",
      issue_date:      "Emissão",
      due_date:        "Vencimento",
      amount:          "Valor (R$)",
      source_type:     "Origem",
      paid_at:         "Pago em",
    };
    const rows = filtered.map((i) => {
      const row: Record<string, any> = {};
      ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).forEach((c) => {
        row[labelMap[c.key]] = colMap[c.key](i);
      });
      row["Status"] = statusLabel(i.status);
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas_pagar_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // ── Summary Cards ──────────────────────────────────────────────────────────
  const totalPending   = items.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalPaid      = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCancelled = items.filter((i) => i.status === "cancelled").reduce((s, i) => s + i.amount, 0);
  const totalAll       = items.reduce((s, i) => s + i.amount, 0);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = items.filter((i) => {
    const matchSearch =
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      i.document_number.toLowerCase().includes(search.toLowerCase()) ||
      (i.vendor_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  const canEdit = (item: Payable) => item.source_type === "manual" && item.status === "pending";
  const canDelete = (item: Payable) => item.status === "pending" && item.source_type === "manual";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contas a Pagar</h1>
            <p className="text-sm text-muted-foreground mt-1">Gerencie títulos a pagar e registre pagamentos</p>
          </div>
          <Button onClick={() => { setForm(emptyForm); setCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Título
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground font-medium">Total Geral</p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold text-foreground">{fmt(totalAll)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" /> Pendente
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold text-amber-600">{fmt(totalPending)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-emerald-500" /> Pago
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold text-emerald-600">{fmt(totalPaid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <Ban className="h-3.5 w-3.5 text-destructive" /> Cancelado
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-bold text-destructive">{fmt(totalCancelled)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por documento, descrição, fornecedor..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={handleExport}>
            <FileDown className="h-4 w-4" /> Exportar
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhum título encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-px whitespace-nowrap">Status</TableHead>
                    {visibleCols.has("document_number") && <TableHead>Nº Documento</TableHead>}
                    {visibleCols.has("vendor_name")     && <TableHead>Fornecedor</TableHead>}
                    {visibleCols.has("description")     && <TableHead>Descrição</TableHead>}
                    {visibleCols.has("issue_date")      && <TableHead>Emissão</TableHead>}
                    {visibleCols.has("due_date")        && <TableHead>Vencimento</TableHead>}
                    {visibleCols.has("amount")          && <TableHead>Valor</TableHead>}
                    {visibleCols.has("source_type")     && <TableHead>Origem</TableHead>}
                    {visibleCols.has("paid_at")         && <TableHead>Pago em</TableHead>}
                    <TableHead className="w-px whitespace-nowrap">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="w-px whitespace-nowrap">
                        <StatusDot status={item.status} />
                      </TableCell>
                      {visibleCols.has("document_number") && (
                        <TableCell className="font-mono text-xs">{item.document_number}</TableCell>
                      )}
                      {visibleCols.has("vendor_name") && (
                        <TableCell className="text-sm">{item.vendor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      )}
                      {visibleCols.has("description") && (
                        <TableCell className="max-w-[200px] truncate text-sm">{item.description}</TableCell>
                      )}
                      {visibleCols.has("issue_date") && (
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.issue_date)}</TableCell>
                      )}
                      {visibleCols.has("due_date") && (
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.due_date)}</TableCell>
                      )}
                      {visibleCols.has("amount") && (
                        <TableCell className="text-sm font-medium whitespace-nowrap">{fmt(item.amount)}</TableCell>
                      )}
                      {visibleCols.has("source_type") && (
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{sourceLabel(item.source_type)}</Badge>
                        </TableCell>
                      )}
                      {visibleCols.has("paid_at") && (
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(item.paid_at)}</TableCell>
                      )}
                      <TableCell className="w-px whitespace-nowrap">
                        <ActionGear
                          legendKeys={["paid", "pending", "cancelled"]}
                          actions={[
                            {
                              label: "Visualizar",
                              icon: <Eye className="h-4 w-4" />,
                              onClick: () => setViewItem(item),
                            },
                            ...(item.status === "pending" ? [{
                              label: "Registrar Pagamento",
                              icon: <ArrowDownCircle className="h-4 w-4" />,
                              onClick: () => { setBaixaForm(emptyBaixa); setBaixaItem(item); },
                            }] : []),
                            ...(item.status === "paid" ? [{
                              label: "Cancelar Pagamento",
                              icon: <RotateCcw className="h-4 w-4" />,
                              onClick: () => setCancelBaixaItem(item),
                            }] : []),
                            ...(canEdit(item) ? [{
                              label: "Editar",
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => openEdit(item),
                            }] : []),
                            ...(canDelete(item) ? [{
                              label: "Excluir",
                              icon: <Trash2 className="h-4 w-4" />,
                              onClick: () => setDeleteItem(item),
                              variant: "destructive" as const,
                            }] : []),
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
      </div>

      {/* ── Create Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Título a Pagar</DialogTitle>
            <DialogDescription>Preencha os dados do título manual</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nº Documento <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ex: NF-2024-001"
                value={form.document_number}
                onChange={(e) => setForm({ ...form, document_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emissão <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.issue_date}
                onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor / Beneficiário</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Descreva o título..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vencimento <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="0,00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: maskCurrency(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Título</DialogTitle>
            <DialogDescription>Apenas títulos manuais pendentes podem ser editados</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nº Documento <span className="text-destructive">*</span></Label>
              <Input
                value={form.document_number}
                onChange={(e) => setForm({ ...form, document_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emissão <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.issue_date}
                onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor / Beneficiário</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição <span className="text-destructive">*</span></Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vencimento <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Valor <span className="text-destructive">*</span></Label>
                <Input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: maskCurrency(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Título</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Nº Documento</p>
                  <p className="font-mono font-medium">{viewItem.document_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{statusLabel(viewItem.status)}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Descrição</p>
                <p>{viewItem.description}</p>
              </div>
              {viewItem.vendor_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Fornecedor / Beneficiário</p>
                  <p>{viewItem.vendor_name}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Emissão</p>
                  <p>{fmtDate(viewItem.issue_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p>{fmtDate(viewItem.due_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-semibold">{fmt(viewItem.amount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Origem</p>
                  <p>{sourceLabel(viewItem.source_type)}</p>
                </div>
                {viewItem.paid_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Pago em</p>
                    <p>{fmtDate(viewItem.paid_at)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewItem(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Baixa Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!baixaItem} onOpenChange={(o) => !o && setBaixaItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
            <DialogDescription>
              {baixaItem && <><strong>{baixaItem.document_number}</strong> — {fmt(baixaItem.amount)}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Conta Bancária <span className="text-destructive">*</span></Label>
              <Select value={baixaForm.bank_account_id} onValueChange={(v) => setBaixaForm({ ...baixaForm, bank_account_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.account_name} — {b.bank_name} ({fmt(b.current_balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do Pagamento <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={baixaForm.paid_at}
                onChange={(e) => setBaixaForm({ ...baixaForm, paid_at: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setBaixaItem(null)}>Cancelar</Button>
            <Button onClick={handleBaixa} disabled={savingBaixa}>
              {savingBaixa && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Baixa Confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelBaixaItem} onOpenChange={(o) => !o && setCancelBaixaItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A movimentação bancária vinculada será removida e o saldo da conta será recalculado automaticamente. O título voltará para <strong>Pendente</strong>.
            </AlertDialogDescription>
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
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O título <strong>{deleteItem?.document_number}</strong> será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
