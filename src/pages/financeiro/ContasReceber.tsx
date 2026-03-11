import { useEffect, useState, useCallback } from "react";
import {
  Loader2, Plus, Search, CheckCircle2, XCircle, Eye,
  Pencil, Trash2, ArrowDownCircle, RotateCcw, Filter,
  Receipt, TrendingUp, Clock, Ban
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Receivable {
  id: string;
  company_id: string;
  client_id: string | null;
  contract_id: string | null;
  installment_id: string | null;
  description: string;
  issue_date: string;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  source_type: "manual" | "contract_installment";
  paid_at: string | null;
  bank_account_id: string | null;
  bank_transaction_id: string | null;
  created_at: string;
  // joined
  tenant_name?: string;
}

interface InstallmentDetail {
  management_fee_percent: number;
  management_fee_value: number | null;
  tax_base_value: number | null;
  ir_rate: number | null;
  ir_deduction: number | null;
  irrf_value: number | null;
  owner_net_value: number | null;
}

interface Tenant {
  id: string;
  full_name: string;
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  current_balance: number;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string | null) =>
  d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "—";

const statusBadge = (s: string) => {
  if (s === "paid") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20">Recebido</Badge>;
  if (s === "cancelled") return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">Cancelado</Badge>;
  return <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">Pendente</Badge>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContasReceber() {
  const { company } = useAuth();

  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Tenants & bank accounts
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [viewItem, setViewItem] = useState<Receivable | null>(null);
  const [editItem, setEditItem] = useState<Receivable | null>(null);
  const [baixaItem, setBaixaItem] = useState<Receivable | null>(null);
  const [cancelBaixaItem, setCancelBaixaItem] = useState<Receivable | null>(null);
  const [deleteItem, setDeleteItem] = useState<Receivable | null>(null);

  // Installment detail for view
  const [installDetail, setInstallDetail] = useState<InstallmentDetail | null>(null);

  // Forms
  const emptyForm = {
    client_id: "",
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

    const [{ data: receivables }, { data: tenantsData }, { data: bankData }] = await Promise.all([
      supabase
        .from("accounts_receivable")
        .select("*, tenants(full_name)")
        .eq("company_id", company.id)
        .order("due_date", { ascending: false }),
      supabase.from("tenants").select("id, full_name").eq("company_id", company.id).eq("status", "ativo").order("full_name"),
      supabase.from("bank_accounts").select("id, account_name, bank_name, current_balance").eq("company_id", company.id).eq("active", true).order("account_name"),
    ]);

    if (receivables) {
      setItems(
        receivables.map((r: any) => ({
          ...r,
          tenant_name: r.tenants?.full_name ?? null,
          tenants: undefined,
        }))
      );
    }
    setTenants(tenantsData ?? []);
    setBankAccounts(bankData ?? []);
    setLoading(false);
  }, [company]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Load installment detail ─────────────────────────────────────────────────
  const loadInstallDetail = async (installmentId: string) => {
    const { data } = await supabase
      .from("rental_installments")
      .select("management_fee_percent, management_fee_value, tax_base_value, ir_rate, ir_deduction, irrf_value, owner_net_value")
      .eq("id", installmentId)
      .single();
    setInstallDetail(data ?? null);
  };

  const openView = async (item: Receivable) => {
    setViewItem(item);
    if (item.installment_id) await loadInstallDetail(item.installment_id);
    else setInstallDetail(null);
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.client_id || !form.description || !form.issue_date || !form.due_date || !form.amount) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("accounts_receivable").insert({
      company_id: company!.id,
      client_id: form.client_id,
      description: form.description,
      issue_date: form.issue_date,
      due_date: form.due_date,
      amount: parseFloat(form.amount.replace(/\./g, "").replace(",", ".")),
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
    setSaving(true);
    const { error } = await supabase
      .from("accounts_receivable")
      .update({
        client_id: form.client_id || null,
        description: form.description,
        issue_date: form.issue_date,
        due_date: form.due_date,
        amount: parseFloat(form.amount.replace(/\./g, "").replace(",", ".")),
      })
      .eq("id", editItem.id);
    setSaving(false);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    toast.success("Título atualizado.");
    setEditItem(null);
    fetchData();
  };

  const openEdit = (item: Receivable) => {
    if (item.source_type !== "manual" || item.status !== "pending") {
      toast.warning("Este título não pode ser editado.");
      return;
    }
    setForm({
      client_id: item.client_id ?? "",
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
      // 1. Create bank transaction
      const { data: txData, error: txErr } = await supabase
        .from("bank_transactions")
        .insert({
          company_id: company!.id,
          bank_account_id: baixaForm.bank_account_id,
          transaction_date: baixaForm.paid_at,
          type: "credit",
          amount: baixaItem.amount,
          description: `Recebimento de título: ${baixaItem.description}`,
          origin_type: "accounts_receivable",
          origin_id: baixaItem.id,
        })
        .select("id")
        .single();

      if (txErr || !txData) throw new Error(txErr?.message ?? "Erro ao criar movimentação");

      // 2. Update receivable
      const { error: updErr } = await supabase
        .from("accounts_receivable")
        .update({
          status: "paid",
          paid_at: baixaForm.paid_at,
          bank_account_id: baixaForm.bank_account_id,
          bank_transaction_id: txData.id,
        })
        .eq("id", baixaItem.id);

      if (updErr) throw new Error(updErr.message);

      toast.success("Baixa registrada com sucesso.");
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
      // 1. Delete bank transaction (trigger reverts balance)
      if (cancelBaixaItem.bank_transaction_id) {
        const { error: delErr } = await supabase
          .from("bank_transactions")
          .delete()
          .eq("id", cancelBaixaItem.bank_transaction_id);
        if (delErr) throw new Error(delErr.message);
      }

      // 2. Revert receivable
      const { error: updErr } = await supabase
        .from("accounts_receivable")
        .update({
          status: "pending",
          paid_at: null,
          bank_account_id: null,
          bank_transaction_id: null,
        })
        .eq("id", cancelBaixaItem.id);

      if (updErr) throw new Error(updErr.message);

      toast.success("Baixa cancelada. Título voltou para pendente.");
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
    const { error } = await supabase.from("accounts_receivable").delete().eq("id", deleteItem.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Título excluído.");
    setDeleteItem(null);
    fetchData();
  };

  // ── Summary Cards ──────────────────────────────────────────────────────────
  const total = items.reduce((s, i) => s + i.amount, 0);
  const totalPending = items.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalPaid = items.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const totalCancelled = items.filter((i) => i.status === "cancelled").reduce((s, i) => s + i.amount, 0);

  // ── Filtered ───────────────────────────────────────────────────────────────
  const filtered = items.filter((i) => {
    const matchSearch =
      i.description.toLowerCase().includes(search.toLowerCase()) ||
      (i.tenant_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const canEdit = (i: Receivable) => i.source_type === "manual" && i.status === "pending";
  const canBaixa = (i: Receivable) => i.status === "pending";
  const canCancelBaixa = (i: Receivable) => i.status === "paid";

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contas a Receber</h1>
            <p className="text-muted-foreground mt-1">Gerencie os títulos a receber e registre pagamentos</p>
          </div>
          <Button onClick={() => { setForm(emptyForm); setCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo título
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-base font-bold text-foreground">{fmt(total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pendente</p>
                  <p className="text-base font-bold text-amber-600">{fmt(totalPending)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recebido</p>
                  <p className="text-base font-bold text-emerald-600">{fmt(totalPaid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
                  <Ban className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cancelado</p>
                  <p className="text-base font-bold text-destructive">{fmt(totalCancelled)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters + Table */}
        <Card className="border-0 shadow-card">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição ou locatário..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Recebido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Receipt className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p>Nenhum título encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Locatário</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.tenant_name ?? "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">{item.description}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(item.due_date)}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono">{fmt(item.amount)}</TableCell>
                        <TableCell>{statusBadge(item.status)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.source_type === "manual" ? "Manual" : "Contrato"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Visualizar" onClick={() => openView(item)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {canEdit(item) && (
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canBaixa(item) && (
                              <Button variant="ghost" size="icon" title="Registrar recebimento" className="text-emerald-600 hover:text-emerald-700" onClick={() => { setBaixaItem(item); setBaixaForm(emptyBaixa); }}>
                                <ArrowDownCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {canCancelBaixa(item) && (
                              <Button variant="ghost" size="icon" title="Cancelar baixa" className="text-amber-600 hover:text-amber-700" onClick={() => setCancelBaixaItem(item)}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            {item.status !== "paid" && (
                              <Button variant="ghost" size="icon" title="Excluir" className="text-destructive hover:text-destructive" onClick={() => setDeleteItem(item)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Create Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo título a receber</DialogTitle>
            <DialogDescription>Inclua um lançamento manual de contas a receber.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Locatário *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o locatário" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Ex: Aluguel referente a..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data emissão *</Label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data vencimento *</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar título</DialogTitle>
            <DialogDescription>Apenas títulos manuais pendentes podem ser editados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Locatário</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o locatário" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data emissão</Label>
                <Input type="date" value={form.issue_date} onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Data vencimento</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ────────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={(o) => !o && setViewItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do título</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Locatário</p>
                  <p className="font-medium">{viewItem.tenant_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-0.5">{statusBadge(viewItem.status)}</div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="font-medium">{viewItem.description}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Emissão</p>
                  <p className="font-medium">{fmtDate(viewItem.issue_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencimento</p>
                  <p className="font-medium">{fmtDate(viewItem.due_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor bruto</p>
                  <p className="font-bold text-foreground">{fmt(viewItem.amount)}</p>
                </div>
                {viewItem.paid_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Recebido em</p>
                    <p className="font-medium text-emerald-600">{fmtDate(viewItem.paid_at)}</p>
                  </div>
                )}
              </div>

              {/* Composição financeira da parcela */}
              {viewItem.installment_id && installDetail && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Composição financeira da parcela
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm rounded-lg bg-muted/40 p-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Taxa Admin (%)</p>
                        <p className="font-medium">{installDetail.management_fee_percent}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Taxa Admin (R$)</p>
                        <p className="font-medium">{installDetail.management_fee_value != null ? fmt(installDetail.management_fee_value) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Base de cálculo IR</p>
                        <p className="font-medium">{installDetail.tax_base_value != null ? fmt(installDetail.tax_base_value) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Alíquota IR</p>
                        <p className="font-medium">{installDetail.ir_rate != null ? `${installDetail.ir_rate}%` : "Isento"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Dedução IR</p>
                        <p className="font-medium">{installDetail.ir_deduction != null ? fmt(installDetail.ir_deduction) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">IRRF Retido</p>
                        <p className="font-medium text-destructive">{installDetail.irrf_value != null ? fmt(installDetail.irrf_value) : "—"}</p>
                      </div>
                      <div className="col-span-2 border-t border-border pt-2 mt-1">
                        <p className="text-xs text-muted-foreground">Valor líquido ao proprietário</p>
                        <p className="font-bold text-primary">{installDetail.owner_net_value != null ? fmt(installDetail.owner_net_value) : "—"}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewItem(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Baixa Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={!!baixaItem} onOpenChange={(o) => !o && setBaixaItem(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-emerald-600" />
              Registrar recebimento
            </DialogTitle>
            <DialogDescription>
              {baixaItem && <>Título: <strong>{baixaItem.description}</strong> — <strong>{baixaItem && fmt(baixaItem.amount)}</strong></>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Conta bancária *</Label>
              <Select value={baixaForm.bank_account_id} onValueChange={(v) => setBaixaForm((f) => ({ ...f, bank_account_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.account_name} — {b.bank_name} ({fmt(b.current_balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data do recebimento *</Label>
              <Input type="date" value={baixaForm.paid_at} onChange={(e) => setBaixaForm((f) => ({ ...f, paid_at: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBaixaItem(null)}>Cancelar</Button>
            <Button onClick={handleBaixa} disabled={savingBaixa} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {savingBaixa ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Baixa Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!cancelBaixaItem} onOpenChange={(o) => !o && setCancelBaixaItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600" /> Cancelar recebimento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A movimentação bancária vinculada será removida e o saldo da conta será revertido. O título voltará para <strong>Pendente</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBaixa} className="bg-amber-600 hover:bg-amber-700 text-white">
              {savingBaixa ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir título?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O título <strong>{deleteItem?.description}</strong> será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
