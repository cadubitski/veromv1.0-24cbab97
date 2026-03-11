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
import {
  Loader2, Plus, Search, Trash2, ChevronUp, ChevronDown, FileDown, TrendingUp, TrendingDown,
} from "lucide-react";
import { ActionGear } from "@/components/TableActions";
import { toast } from "sonner";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  bank_code: string;
  current_balance: number;
  active: boolean;
}

interface BankTransaction {
  id: string;
  company_id: string;
  bank_account_id: string;
  transaction_date: string;
  document_number: string;
  description: string;
  type: "credit" | "debit";
  amount: number;
  origin_type: string;
  origin_id: string | null;
  created_at: string;
  updated_at: string;
  bank_accounts?: { account_name: string; bank_name: string; bank_code: string };
}

type SortKey = "transaction_date" | "description" | "amount" | "type" | "document_number";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  bank_account_id: "",
  transaction_date: new Date().toISOString().slice(0, 10),
  type: "credit" as "credit" | "debit",
  amount: "",
  document_number: "",
  description: "",
  origin_type: "manual",
};

const ORIGIN_TYPES = [
  { value: "manual", label: "Manual" },
  { value: "aluguel", label: "Aluguel" },
  { value: "contas_receber", label: "Contas a Receber" },
  { value: "contas_pagar", label: "Contas a Pagar" },
  { value: "integracao_externa", label: "Integração Externa" },
];

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MovimentacaoBancaria() {
  const { company } = useAuth();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterType, setFilterType] = useState<"" | "credit" | "debit">("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("transaction_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAccounts = async () => {
    const { data } = await supabase
      .from("bank_accounts")
      .select("id, account_name, bank_name, bank_code, current_balance, active")
      .eq("active", true)
      .order("account_name");
    setAccounts((data as BankAccount[]) ?? []);
  };

  const loadTransactions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bank_transactions")
      .select("*, bank_accounts(account_name, bank_name, bank_code)")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    setTransactions((data as BankTransaction[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAccounts();
    loadTransactions();
  }, []);

  // ── Sort / filter ────────────────────────────────────────────────────────────
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
    let arr = transactions.filter((t) => {
      const q = search.toLowerCase();
      const matchSearch =
        t.description.toLowerCase().includes(q) ||
        (t.bank_accounts?.account_name ?? "").toLowerCase().includes(q);
      const matchAccount = !filterAccount || t.bank_account_id === filterAccount;
      const matchType = !filterType || t.type === filterType;
      const matchFrom = !filterDateFrom || t.transaction_date >= filterDateFrom;
      const matchTo = !filterDateTo || t.transaction_date <= filterDateTo;
      return matchSearch && matchAccount && matchType && matchFrom && matchTo;
    });

    arr = [...arr].sort((a, b) => {
      if (sortKey === "amount") {
        const diff = a.amount - b.amount;
        return sortDir === "asc" ? diff : -diff;
      }
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [transactions, search, filterAccount, filterType, filterDateFrom, filterDateTo, sortKey, sortDir]);

  // Totals
  const totals = useMemo(() => {
    const credits = filtered.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
    const debits = filtered.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);
    return { credits, debits, balance: credits - debits };
  }, [filtered]);

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setError(null);
    setDialogOpen(true);
  };

  const f = (key: keyof typeof form, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const validateDocNumber = async (docNumber: string): Promise<boolean> => {
    const { data } = await supabase
      .from("bank_transactions")
      .select("id")
      .eq("company_id", company!.id)
      .eq("document_number", docNumber.trim())
      .maybeSingle();
    return !data;
  };

  const handleSave = async () => {
    if (!form.bank_account_id) { setError("Selecione a conta bancária."); return; }
    if (!form.transaction_date) { setError("Data é obrigatória."); return; }
    if (!form.document_number.trim()) { setError("Número do Documento é obrigatório."); return; }
    if (!form.description.trim()) { setError("Descrição é obrigatória."); return; }
    const amount = parseCurrency(form.amount);
    if (!amount || amount <= 0) { setError("Informe um valor válido."); return; }
    if (!company?.id) return;

    const isUnique = await validateDocNumber(form.document_number);
    if (!isUnique) {
      setError("O número do documento já está sendo utilizado em outra movimentação.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: err } = await supabase
        .from("bank_transactions")
        .insert({
          company_id: company.id,
          bank_account_id: form.bank_account_id,
          transaction_date: form.transaction_date,
          document_number: form.document_number.trim(),
          description: form.description.trim(),
          type: form.type,
          amount,
          origin_type: form.origin_type,
        });
      if (err) throw err;
      toast.success("Movimentação registrada com sucesso.");
      setDialogOpen(false);
      await loadTransactions();
      await loadAccounts();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (t: BankTransaction) => {
    setDeleteTarget(t);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase
        .from("bank_transactions")
        .delete()
        .eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Movimentação excluída. Saldo atualizado.");
      setDeleteDialogOpen(false);
      await loadTransactions();
      await loadAccounts();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Excel ────────────────────────────────────────────────────────────────────
  const handleExcel = () => {
    const rows = filtered.map((t) => ({
      "Nº Documento": t.document_number,
      "Data": fmtDate(t.transaction_date),
      "Conta": t.bank_accounts?.account_name ?? "",
      "Tipo": t.type === "credit" ? "Entrada" : "Saída",
      "Descrição": t.description,
      "Valor": t.amount,
      "Origem": ORIGIN_TYPES.find(o => o.value === t.origin_type)?.label ?? t.origin_type,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentações");
    XLSX.writeFile(wb, "movimentacoes-bancarias.xlsx");
  };

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Movimentação Bancária</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Registre e acompanhe entradas e saídas de cada conta bancária.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Movimentação
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-premium rounded-xl p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Entradas</p>
              <p className="text-lg font-bold text-emerald-500">{fmt(totals.credits)}</p>
            </div>
          </div>
          <div className="card-premium rounded-xl p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <TrendingDown className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Saídas</p>
              <p className="text-lg font-bold text-destructive">{fmt(totals.debits)}</p>
            </div>
          </div>
          <div className="card-premium rounded-xl p-4 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${totals.balance >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
              <span className={`text-lg font-bold ${totals.balance >= 0 ? "text-primary" : "text-destructive"}`}>$</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo do Período</p>
              <p className={`text-lg font-bold ${totals.balance >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(totals.balance)}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-full sm:w-52"
          >
            <option value="">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-full sm:w-36"
          >
            <option value="">Todos os tipos</option>
            <option value="credit">Entrada</option>
            <option value="debit">Saída</option>
          </select>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="w-full sm:w-40"
            placeholder="Data de"
            title="Data inicial"
          />
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="w-full sm:w-40"
            placeholder="Data até"
            title="Data final"
          />
          <Button variant="outline" onClick={handleExcel} className="gap-2 shrink-0">
            <FileDown className="h-4 w-4" /> Excel
          </Button>
        </div>

        {/* Table */}
        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead className={thClass} onClick={() => handleSort("document_number")}>
                  Nº Documento <SortIcon col="document_number" />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("transaction_date")}>
                  Data <SortIcon col="transaction_date" />
                </TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className={thClass} onClick={() => handleSort("type")}>
                  Tipo <SortIcon col="type" />
                </TableHead>
                <TableHead className={thClass} onClick={() => handleSort("description")}>
                  Descrição <SortIcon col="description" />
                </TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className={`${thClass} text-right`} onClick={() => handleSort("amount")}>
                  Valor <SortIcon col="amount" />
                </TableHead>
                <TableHead className="text-right w-px whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    {search || filterAccount || filterType || filterDateFrom || filterDateTo
                      ? "Nenhuma movimentação encontrada com os filtros aplicados."
                      : "Nenhuma movimentação registrada ainda."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {t.document_number}
                    </TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {fmtDate(t.transaction_date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-medium">{t.bank_accounts?.account_name}</span>
                      <span className="text-muted-foreground text-xs block">
                        {t.bank_accounts?.bank_code} — {t.bank_accounts?.bank_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {t.type === "credit" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 rounded-full px-2 py-0.5">
                          <TrendingUp className="h-3 w-3" /> Entrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 rounded-full px-2 py-0.5">
                          <TrendingDown className="h-3 w-3" /> Saída
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={t.description}>
                      {t.description}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ORIGIN_TYPES.find(o => o.value === t.origin_type)?.label ?? t.origin_type}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-semibold ${t.type === "credit" ? "text-emerald-500" : "text-destructive"}`}>
                      {t.type === "credit" ? "+" : "-"}{fmt(t.amount)}
                    </TableCell>
                    <TableCell className="text-right w-px whitespace-nowrap">
                      <ActionGear
                        legendKeys={[]}
                        actions={[
                          {
                            label: "Excluir",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            onClick: () => openDelete(t),
                            variant: "destructive" as const,
                            disabled: t.origin_type !== "manual",
                            tooltip: t.origin_type !== "manual"
                              ? "Exclusão não permitida: movimentação originada de baixa de título financeiro."
                              : undefined,
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

      {/* ── Create Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Movimentação</DialogTitle>
            <DialogDescription>Registre uma movimentação manual na conta bancária.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <FieldLabel label="Número do Documento" tooltip="Identificador único da movimentação. Ex: número do boleto, referência PIX, código interno." required />
              <Input
                value={form.document_number}
                onChange={(e) => f("document_number", e.target.value)}
                placeholder="Ex: BOL-2024-001, PIX-123..."
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel label="Conta bancária" tooltip="Conta onde a movimentação será registrada." required />
              <select
                value={form.bank_account_id}
                onChange={(e) => f("bank_account_id", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecione uma conta...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_name} — {fmt(a.current_balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Data" tooltip="Data da movimentação." required />
                <Input
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => f("transaction_date", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Tipo" tooltip="Entrada (crédito) ou Saída (débito)." required />
                <select
                  value={form.type}
                  onChange={(e) => f("type", e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="credit">Entrada</option>
                  <option value="debit">Saída</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel label="Valor" tooltip="Valor da movimentação." required />
              <Input
                value={form.amount}
                onChange={(e) => f("amount", maskCurrency(e.target.value))}
                placeholder="0,00"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel label="Descrição" tooltip="Descrição ou observação sobre a movimentação." required />
              <Input
                value={form.description}
                onChange={(e) => f("description", e.target.value)}
                placeholder="Ex: Pagamento de fornecedor..."
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel label="Origem" tooltip="De onde se origina esta movimentação." />
              <select
                value={form.origin_type}
                onChange={(e) => f("origin_type", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {ORIGIN_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ─────────────────────────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta movimentação será excluída e o saldo da conta será revertido automaticamente. Esta ação não pode ser desfeita.
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
