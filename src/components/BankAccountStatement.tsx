import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { ActionGear } from "@/components/TableActions";
import { toast } from "sonner";

interface BankTransaction {
  id: string;
  transaction_date: string;
  description: string;
  type: "credit" | "debit";
  amount: number;
  origin_type: string;
  created_at: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual",
  aluguel: "Aluguel",
  contas_receber: "Contas a Receber",
  contas_pagar: "Contas a Pagar",
  integracao_externa: "Integração Externa",
};

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

interface Props {
  bankAccountId: string;
  onBalanceChanged?: () => void;
}

export default function BankAccountStatement({ bankAccountId, onBalanceChanged }: Props) {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterType, setFilterType] = useState<"" | "credit" | "debit">("");
  const [deleteTarget, setDeleteTarget] = useState<BankTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("bank_account_id", bankAccountId)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    setTransactions((data as BankTransaction[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (bankAccountId) load();
  }, [bankAccountId]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const matchType = !filterType || t.type === filterType;
      const matchFrom = !filterDateFrom || t.transaction_date >= filterDateFrom;
      const matchTo = !filterDateTo || t.transaction_date <= filterDateTo;
      return matchType && matchFrom && matchTo;
    });
  }, [transactions, filterType, filterDateFrom, filterDateTo]);

  const totals = useMemo(() => {
    const credits = filtered.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
    const debits = filtered.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);
    return { credits, debits };
  }, [filtered]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("bank_transactions")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Movimentação excluída. Saldo atualizado.");
      setDeleteTarget(null);
      await load();
      onBalanceChanged?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 w-36"
        >
          <option value="">Todos</option>
          <option value="credit">Entradas</option>
          <option value="debit">Saídas</option>
        </select>
        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="h-9 w-36 text-sm"
          title="Data inicial"
        />
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="h-9 w-36 text-sm"
          title="Data final"
        />
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-emerald-500 font-medium">
          <TrendingUp className="h-3.5 w-3.5 inline mr-1" />
          Entradas: {fmt(totals.credits)}
        </span>
        <span className="text-destructive font-medium">
          <TrendingDown className="h-3.5 w-3.5 inline mr-1" />
          Saídas: {fmt(totals.debits)}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40">
              <TableHead className="text-xs">Data</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Descrição</TableHead>
              <TableHead className="text-xs">Origem</TableHead>
              <TableHead className="text-xs text-right">Valor</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma movimentação encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id} className="border-border/40 hover:bg-muted/30">
                  <TableCell className="font-mono text-xs whitespace-nowrap">{fmtDate(t.transaction_date)}</TableCell>
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
                  <TableCell className="text-sm max-w-[180px] truncate" title={t.description}>
                    {t.description}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ORIGIN_LABELS[t.origin_type] ?? t.origin_type}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-semibold ${t.type === "credit" ? "text-emerald-500" : "text-destructive"}`}>
                    {t.type === "credit" ? "+" : "-"}{fmt(t.amount)}
                  </TableCell>
                   <TableCell className="w-px">
                    <ActionGear
                      legendKeys={[]}
                      actions={[
                        {
                          label: "Excluir",
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          onClick: () => setDeleteTarget(t),
                          variant: "destructive" as const,
                          disabled: t.origin_type !== "manual",
                          title: t.origin_type !== "manual"
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir movimentação?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta movimentação será excluída e o saldo da conta será revertido automaticamente.
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
    </div>
  );
}
