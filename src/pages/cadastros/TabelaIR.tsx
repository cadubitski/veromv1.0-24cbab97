import { useState, useEffect, useMemo } from "react";
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
import { Loader2, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { ActionGear } from "@/components/TableActions";
import { toast } from "sonner";

interface TaxBracket {
  id: string;
  company_id: string;
  range_start: number;
  range_end: number | null;
  rate: number;
  deduction: number;
  created_at: string;
}

type SortKey = "range_start" | "rate";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  range_start: "",
  range_end: "",
  rate: "",
  deduction: "",
};

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TabelaIR() {
  const { company } = useAuth();
  const [brackets, setBrackets] = useState<TaxBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("range_start");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editBracket, setEditBracket] = useState<TaxBracket | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxBracket | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("income_tax_brackets").select("*").order("range_start");
    setBrackets((data as TaxBracket[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

  const sorted = useMemo(() => {
    return [...brackets].sort((a, b) => {
      const va = a[sortKey] ?? 0;
      const vb = b[sortKey] ?? 0;
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [brackets, sortKey, sortDir]);

  const openCreate = () => {
    setEditBracket(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (b: TaxBracket) => {
    setEditBracket(b);
    setForm({
      range_start: String(b.range_start),
      range_end: b.range_end != null ? String(b.range_end) : "",
      rate: String(b.rate),
      deduction: String(b.deduction),
    });
    setError(null);
    setDialogOpen(true);
  };

  const openDelete = (b: TaxBracket) => { setDeleteTarget(b); setDeleteDialogOpen(true); };

  const handleSave = async () => {
    const rangeStart = parseFloat(form.range_start.replace(",", "."));
    const rangeEnd = form.range_end.trim() ? parseFloat(form.range_end.replace(",", ".")) : null;
    const rate = parseFloat(form.rate.replace(",", "."));
    const deduction = parseFloat(form.deduction.replace(",", ".") || "0");

    if (isNaN(rangeStart) || rangeStart < 0) { setError("Início da faixa inválido."); return; }
    if (rangeEnd !== null && (isNaN(rangeEnd) || rangeEnd <= rangeStart)) { setError("Fim da faixa deve ser maior que o início."); return; }
    if (isNaN(rate) || rate < 0 || rate > 100) { setError("Alíquota deve ser entre 0 e 100%."); return; }
    if (isNaN(deduction) || deduction < 0) { setError("Dedução inválida."); return; }
    if (!company?.id) return;

    setSaving(true); setError(null);
    try {
      const payload = { range_start: rangeStart, range_end: rangeEnd, rate, deduction };
      if (editBracket) {
        const { error: err } = await supabase.from("income_tax_brackets").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editBracket.id);
        if (err) throw err;
        toast.success("Faixa atualizada com sucesso.");
      } else {
        const { error: err } = await supabase.from("income_tax_brackets").insert({ ...payload, company_id: company.id });
        if (err) throw err;
        toast.success("Faixa criada com sucesso.");
      }
      setDialogOpen(false);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: err } = await supabase.from("income_tax_brackets").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Faixa excluída.");
      setDeleteDialogOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
  };

  const f = (key: keyof typeof form, value: string) => setForm((p) => ({ ...p, [key]: value }));
  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tabela de Imposto de Renda</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure as faixas de IRRF sobre aluguéis de locadores pessoa física.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Faixa
          </Button>
        </div>

        {brackets.length === 0 && !loading && (
          <div className="rounded-xl border border-border/40 bg-muted/20 p-6 text-sm text-muted-foreground text-center">
            <p className="font-medium mb-1">Nenhuma faixa cadastrada.</p>
            <p>Adicione as faixas de IR conforme a tabela vigente da Receita Federal. Locadores PJ ficam isentos automaticamente.</p>
          </div>
        )}

        {(brackets.length > 0 || loading) && (
          <div className="card-premium rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40">
                  <TableHead className={thClass} onClick={() => handleSort("range_start")}>
                    Início da Faixa (R$) <SortIcon col="range_start" />
                  </TableHead>
                  <TableHead>Fim da Faixa (R$)</TableHead>
                  <TableHead className={thClass} onClick={() => handleSort("rate")}>
                    Alíquota (%) <SortIcon col="rate" />
                  </TableHead>
                  <TableHead>Dedução (R$)</TableHead>
                  <TableHead className="text-right w-px whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : sorted.map((b) => (
                  <TableRow key={b.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-sm">R$ {formatMoney(b.range_start)}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {b.range_end != null ? `R$ ${formatMoney(b.range_end)}` : <span className="italic">Acima (sem limite)</span>}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{b.rate}%</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">R$ {formatMoney(b.deduction)}</TableCell>
                    <TableCell className="text-right w-px whitespace-nowrap">
                      <ActionGear
                        legendKeys={[]}
                        actions={[
                          { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(b) },
                          { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => openDelete(b), variant: "destructive" },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editBracket ? "Editar faixa" : "Nova faixa de IR"}</DialogTitle>
            <DialogDescription>
              {editBracket
                ? "Atualize os dados da faixa de imposto."
                : "Cadastre uma faixa da tabela de IRRF sobre aluguéis."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel
                  label="Início da faixa (R$)"
                  tooltip="Valor mínimo da base de cálculo para esta faixa. Use 0 para a primeira faixa (isenta)."
                  required
                />
                <Input
                  value={form.range_start}
                  onChange={(e) => f("range_start", e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel
                  label="Fim da faixa (R$)"
                  tooltip="Valor máximo da base de cálculo. Deixe em branco para a última faixa (sem limite superior)."
                />
                <Input
                  value={form.range_end}
                  onChange={(e) => f("range_end", e.target.value)}
                  placeholder="Sem limite"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel
                  label="Alíquota (%)"
                  tooltip="Percentual do imposto sobre a base de cálculo. Use 0 para faixas isentas."
                  required
                />
                <Input
                  value={form.rate}
                  onChange={(e) => f("rate", e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel
                  label="Dedução (R$)"
                  tooltip="Valor fixo a deduzir do imposto calculado, conforme tabela da Receita Federal."
                  required
                />
                <Input
                  value={form.deduction}
                  onChange={(e) => f("deduction", e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </div>
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editBracket ? "Salvar" : "Criar faixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir faixa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a faixa de{" "}
              <strong>R$ {deleteTarget ? formatMoney(deleteTarget.range_start) : ""}</strong>
              {deleteTarget?.range_end != null ? ` até R$ ${formatMoney(deleteTarget.range_end)}` : " em diante"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
