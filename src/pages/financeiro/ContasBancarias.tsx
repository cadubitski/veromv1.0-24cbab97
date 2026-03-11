import { useState, useEffect, useMemo } from "react";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/InfoTooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Search, Eye, Pencil, Trash2, ChevronUp, ChevronDown, FileDown, List } from "lucide-react";
import { StatusDot, ActionGear } from "@/components/TableActions";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import BankAccountStatement from "@/components/BankAccountStatement";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  company_id: string;
  bank_code: string;
  bank_name: string;
  agency_number: string;
  agency_digit: string | null;
  account_number: string;
  account_digit: string | null;
  account_name: string;
  initial_balance: number;
  current_balance: number;
  active: boolean;
  external_provider: string | null;
  external_account_id: string | null;
  created_at: string;
  updated_at: string;
}

type SortKey = "account_name" | "bank_name" | "bank_code" | "current_balance";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  bank_code: "",
  bank_name: "",
  agency_number: "",
  agency_digit: "",
  account_number: "",
  account_digit: "",
  account_name: "",
  initial_balance: "",
  active: true,
  external_provider: "",
  external_account_id: "",
};

// ─── Popular Brazilian banks ───────────────────────────────────────────────────
const BANKS = [
  { code: "001", name: "Banco do Brasil" },
  { code: "033", name: "Santander" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú" },
  { code: "422", name: "Safra" },
  { code: "745", name: "Citibank" },
  { code: "756", name: "Sicoob" },
  { code: "748", name: "Sicredi" },
  { code: "260", name: "Nubank" },
  { code: "336", name: "C6 Bank" },
  { code: "077", name: "Banco Inter" },
  { code: "290", name: "PagBank" },
  { code: "197", name: "Stone" },
  { code: "323", name: "Mercado Pago" },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContasBancarias() {
  const { company } = useAuth();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"todos" | "true" | "false">("todos");
  const [sortKey, setSortKey] = useState<SortKey>("account_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [editAccount, setEditAccount] = useState<BankAccount | null>(null);
  const [viewAccount, setViewAccount] = useState<BankAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [viewTab, setViewTab] = useState<"details" | "statement">("details");

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("account_name");
    setAccounts((data as BankAccount[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Sort / filter ─────────────────────────────────────────────────────────
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

  const filtered = useMemo(() => {
    let arr = accounts.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch =
        a.account_name.toLowerCase().includes(q) ||
        a.bank_name.toLowerCase().includes(q) ||
        a.bank_code.includes(q) ||
        a.account_number.includes(q);
      const matchActive =
        activeFilter === "todos" ||
        (activeFilter === "true" ? a.active : !a.active);
      return matchSearch && matchActive;
    });
    arr = [...arr].sort((a, b) => {
      if (sortKey === "current_balance") {
        const diff = (a[sortKey] as number) - (b[sortKey] as number);
        return sortDir === "asc" ? diff : -diff;
      }
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [accounts, search, activeFilter, sortKey, sortDir]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditAccount(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (a: BankAccount) => {
    setEditAccount(a);
    setForm({
      bank_code: a.bank_code,
      bank_name: a.bank_name,
      agency_number: a.agency_number,
      agency_digit: a.agency_digit ?? "",
      account_number: a.account_number,
      account_digit: a.account_digit ?? "",
      account_name: a.account_name,
      initial_balance: String(a.initial_balance),
      active: a.active,
      external_provider: a.external_provider ?? "",
      external_account_id: a.external_account_id ?? "",
    });
    setError(null);
    setDialogOpen(true);
  };

  const openView = (a: BankAccount) => { setViewAccount(a); setViewTab("details"); setViewDialogOpen(true); };
  const openDelete = (a: BankAccount) => { setDeleteTarget(a); setDeleteDialogOpen(true); };

  const f = (key: keyof typeof form, value: string | boolean) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleBankSelect = (code: string) => {
    const bank = BANKS.find((b) => b.code === code);
    if (bank) {
      f("bank_code", bank.code);
      f("bank_name", bank.name);
    } else {
      f("bank_code", code);
    }
  };

  const handleSave = async () => {
    if (!form.bank_code.trim()) { setError("Código do banco é obrigatório."); return; }
    if (!form.bank_name.trim()) { setError("Nome do banco é obrigatório."); return; }
    if (!form.agency_number.trim()) { setError("Agência é obrigatória."); return; }
    if (!form.account_number.trim()) { setError("Número da conta é obrigatório."); return; }
    if (!form.account_name.trim()) { setError("Nome da conta é obrigatório."); return; }
    if (!company?.id) return;

    setSaving(true);
    setError(null);

    const initial = parseCurrency(form.initial_balance) ?? 0;

    try {
      if (editAccount) {
        const { error: err } = await supabase
          .from("bank_accounts")
          .update({
            bank_code: form.bank_code,
            bank_name: form.bank_name,
            agency_number: form.agency_number,
            agency_digit: form.agency_digit || null,
            account_number: form.account_number,
            account_digit: form.account_digit || null,
            account_name: form.account_name,
            initial_balance: initial,
            active: form.active,
            external_provider: form.external_provider || null,
            external_account_id: form.external_account_id || null,
          })
          .eq("id", editAccount.id);
        if (err) throw err;
        toast.success("Conta bancária atualizada com sucesso.");
      } else {
        const { error: err } = await supabase
          .from("bank_accounts")
          .insert({
            company_id: company.id,
            bank_code: form.bank_code,
            bank_name: form.bank_name,
            agency_number: form.agency_number,
            agency_digit: form.agency_digit || null,
            account_number: form.account_number,
            account_digit: form.account_digit || null,
            account_name: form.account_name,
            initial_balance: initial,
            current_balance: initial,
            active: form.active,
            external_provider: form.external_provider || null,
            external_account_id: form.external_account_id || null,
          });
        if (err) throw err;
        toast.success("Conta bancária criada com sucesso.");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (a: BankAccount) => {
    const { error: err } = await supabase
      .from("bank_accounts")
      .update({ active: !a.active })
      .eq("id", a.id);
    if (err) { toast.error(err.message); return; }
    toast.success(a.active ? "Conta desativada." : "Conta ativada.");
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from("bank_accounts")
        .delete()
        .eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Conta excluída com sucesso.");
      setDeleteDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Excel export ──────────────────────────────────────────────────────────
  const handleExcel = () => {
    const rows = filtered.map((a) => ({
      "Nome da Conta": a.account_name,
      "Banco": `${a.bank_code} - ${a.bank_name}`,
      "Agência": a.agency_digit ? `${a.agency_number}-${a.agency_digit}` : a.agency_number,
      "Conta": a.account_digit ? `${a.account_number}-${a.account_digit}` : a.account_number,
      "Saldo Inicial": a.initial_balance,
      "Saldo Atual": a.current_balance,
      "Status": a.active ? "Ativa" : "Inativa",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas Bancárias");
    XLSX.writeFile(wb, "contas-bancarias.xlsx");
  };

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contas Bancárias</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie as contas bancárias da empresa.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, banco ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as any)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-full sm:w-44"
          >
            <option value="todos">Todos os status</option>
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
          <Button variant="outline" onClick={handleExcel} className="gap-2 shrink-0">
            <FileDown className="h-4 w-4" /> Excel
          </Button>
        </div>

        {/* Table */}
        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead className={thClass} onClick={() => handleSort("account_name")}>
                  Nome da Conta <SortIcon col="account_name" />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("bank_code")}>
                  Banco <SortIcon col="bank_code" />
                </TableHead>
                <TableHead>Agência</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className={`${thClass} text-right`} onClick={() => handleSort("current_balance")}>
                  Saldo Atual <SortIcon col="current_balance" />
                </TableHead>
                <TableHead className="w-px whitespace-nowrap">Status</TableHead>
                <TableHead className="text-right w-px whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    {search || activeFilter !== "todos"
                      ? "Nenhuma conta encontrada com os filtros aplicados."
                      : "Nenhuma conta bancária cadastrada ainda."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{a.account_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <span className="font-mono">{a.bank_code}</span> — {a.bank_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {a.agency_digit ? `${a.agency_number}-${a.agency_digit}` : a.agency_number}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm font-mono">
                      {a.account_digit ? `${a.account_number}-${a.account_digit}` : a.account_number}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmt(a.current_balance)}
                    </TableCell>
                    <TableCell className="w-px whitespace-nowrap">
                      <StatusDot status={a.active ? "ativo" : "inativo"} />
                    </TableCell>
                    <TableCell className="text-right w-px whitespace-nowrap">
                      <ActionGear
                        legendKeys={["ativo", "inativo"]}
                        actions={[
                          { label: "Visualizar", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openView(a) },
                          { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(a) },
                          {
                            label: a.active ? "Desativar" : "Ativar",
                            icon: <span className="h-3.5 w-3.5 flex items-center justify-center text-xs">{a.active ? "●" : "○"}</span>,
                            onClick: () => handleToggleActive(a),
                          },
                          {
                            label: "Excluir",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            onClick: () => openDelete(a),
                            variant: "destructive" as const,
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Create / Edit Dialog ───────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editAccount ? "Editar conta bancária" : "Nova conta bancária"}</DialogTitle>
            <DialogDescription>
              {editAccount ? "Atualize os dados da conta." : "Preencha os dados para cadastrar uma nova conta bancária."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {/* Bank selection */}
            <div className="space-y-2">
              <FieldLabel label="Banco" tooltip="Selecione o banco ou informe manualmente o código e nome." required />
              <select
                value={form.bank_code}
                onChange={(e) => handleBankSelect(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecione um banco...</option>
                {BANKS.map((b) => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
                <option value="outro">Outro</option>
              </select>
            </div>

            {/* Manual bank code + name */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Código do banco" tooltip="Código COMPE do banco (ex: 001, 237, 341)." required />
                <Input
                  value={form.bank_code}
                  onChange={(e) => f("bank_code", e.target.value)}
                  placeholder="Ex: 237"
                  maxLength={10}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Nome do banco" tooltip="Nome completo do banco." required />
                <Input
                  value={form.bank_name}
                  onChange={(e) => f("bank_name", e.target.value)}
                  placeholder="Ex: Bradesco"
                />
              </div>
            </div>

            {/* Agency */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <FieldLabel label="Agência" tooltip="Número da agência bancária." required />
                <Input
                  value={form.agency_number}
                  onChange={(e) => f("agency_number", e.target.value)}
                  placeholder="Ex: 1234"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Dígito" tooltip="Dígito verificador da agência (se houver)." />
                <Input
                  value={form.agency_digit}
                  onChange={(e) => f("agency_digit", e.target.value)}
                  placeholder="Ex: 0"
                  maxLength={2}
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Account */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <FieldLabel label="Conta" tooltip="Número da conta bancária." required />
                <Input
                  value={form.account_number}
                  onChange={(e) => f("account_number", e.target.value)}
                  placeholder="Ex: 12345-6"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Dígito" tooltip="Dígito verificador da conta." />
                <Input
                  value={form.account_digit}
                  onChange={(e) => f("account_digit", e.target.value)}
                  placeholder="Ex: 7"
                  maxLength={2}
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Account name */}
            <div className="space-y-2">
              <FieldLabel label="Nome amigável da conta" tooltip="Nome para identificar facilmente esta conta (ex: Conta Corrente Principal)." required />
              <Input
                value={form.account_name}
                onChange={(e) => f("account_name", e.target.value)}
                placeholder="Ex: Conta Corrente Principal"
              />
            </div>

            {/* Initial balance */}
            <div className="space-y-2">
              <FieldLabel
                label="Saldo inicial"
                tooltip="Saldo da conta no momento do cadastro. O saldo atual será iniciado com este valor."
              />
              <Input
                value={form.initial_balance}
                onChange={(e) => f("initial_balance", maskCurrency(e.target.value))}
                placeholder="0,00"
                inputMode="numeric"
                disabled={!!editAccount}
              />
              {editAccount && (
                <p className="text-xs text-muted-foreground">O saldo inicial não pode ser alterado após o cadastro.</p>
              )}
            </div>

            {/* Status */}
            <div className="space-y-2">
              <FieldLabel label="Status" tooltip="Define se esta conta está ativa no sistema." required />
              <select
                value={String(form.active)}
                onChange={(e) => f("active", e.target.value === "true")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </select>
            </div>

            {/* External integration (optional) */}
            <div className="border-t border-border/40 pt-4">
              <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Integração externa (opcional)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FieldLabel label="Provedor" tooltip="Nome do gateway de pagamento (ex: Asaas, Pagar.me)." />
                  <Input
                    value={form.external_provider}
                    onChange={(e) => f("external_provider", e.target.value)}
                    placeholder="Ex: Asaas"
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel label="ID externo" tooltip="Identificador desta conta no sistema externo." />
                  <Input
                    value={form.external_account_id}
                    onChange={(e) => f("external_account_id", e.target.value)}
                    placeholder="ID da conta"
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive px-1 shrink-0">{error}</p>}

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editAccount ? "Salvar alterações" : "Criar conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {viewAccount?.account_name ?? "Detalhes da conta"}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {viewAccount && `${viewAccount.bank_code} — ${viewAccount.bank_name}`}
            </p>
          </DialogHeader>

          {viewAccount && (
            <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as any)} className="flex-1 flex flex-col min-h-0">
              <TabsList className="shrink-0 w-full justify-start">
                <TabsTrigger value="details">Detalhes</TabsTrigger>
                <TabsTrigger value="statement" className="gap-1.5">
                  <List className="h-3.5 w-3.5" /> Extrato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-4 space-y-3 text-sm">
                <Row label="Nome" value={viewAccount.account_name} />
                <Row label="Banco" value={`${viewAccount.bank_code} — ${viewAccount.bank_name}`} />
                <Row
                  label="Agência"
                  value={viewAccount.agency_digit
                    ? `${viewAccount.agency_number}-${viewAccount.agency_digit}`
                    : viewAccount.agency_number}
                />
                <Row
                  label="Conta"
                  value={viewAccount.account_digit
                    ? `${viewAccount.account_number}-${viewAccount.account_digit}`
                    : viewAccount.account_number}
                />
                <Row label="Saldo inicial" value={fmt(viewAccount.initial_balance)} />
                <Row label="Saldo atual" value={fmt(viewAccount.current_balance)} />
                <Row label="Status" value={viewAccount.active ? "Ativa" : "Inativa"} />
                {viewAccount.external_provider && (
                  <Row label="Provedor externo" value={viewAccount.external_provider} />
                )}
                {viewAccount.external_account_id && (
                  <Row label="ID externo" value={viewAccount.external_account_id} />
                )}
              </TabsContent>

              <TabsContent value="statement" className="mt-4 flex-1 overflow-y-auto">
                <BankAccountStatement
                  bankAccountId={viewAccount.id}
                  onBalanceChanged={load}
                />
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="shrink-0 mt-4">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta bancária?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta <strong>{deleteTarget?.account_name}</strong> será excluída permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
