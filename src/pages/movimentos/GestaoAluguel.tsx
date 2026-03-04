import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { format, addMonths, setDate, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Tenant { id: string; full_name: string; }
interface Property { id: string; code: string; address: string | null; }

interface Contract {
  id: string;
  company_id: string;
  tenant_id: string;
  property_id: string;
  rent_value: number;
  start_date: string;
  due_day: number;
  duration_months: number;
  status: string;
  created_at: string;
  tenants?: Tenant;
  properties?: Property;
}

interface Installment {
  id: string;
  contract_id: string;
  company_id: string;
  competence: string;
  due_date: string;
  value: number;
  status: string;
  paid_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ativo: "default",
  encerrado: "secondary",
  cancelado: "destructive",
};

const INST_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  em_aberto: "outline",
  pago: "default",
  atrasado: "destructive",
};

const INST_LABELS: Record<string, string> = {
  em_aberto: "Em aberto",
  pago: "Pago",
  atrasado: "Atrasado",
};

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GestaoAluguel() {
  const { company } = useAuth();
  const [searchParams] = useSearchParams();
  const filterParam = searchParams.get("filter");

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(filterParam === "vencidos" || filterParam === "proximos" ? "todos" : "todos");

  // Contract dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    tenant_id: "",
    property_id: "",
    rent_value: "",
    start_date: "",
    due_day: "10",
    duration_months: "12",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Management (installments)
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementContract, setManagementContract] = useState<Contract | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loadingInst, setLoadingInst] = useState(false);
  const [paidDateInputs, setPaidDateInputs] = useState<Record<string, string>>({});
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const loadContracts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rental_contracts")
      .select("*, tenants(id, full_name), properties(id, code, address)");
    setContracts((data as Contract[]) ?? []);
    setLoading(false);
  };

  const loadDropdowns = async () => {
    const [t, p] = await Promise.all([
      supabase.from("tenants").select("id, full_name").eq("status", "ativo"),
      supabase.from("properties").select("id, code, address").eq("status", "disponivel"),
    ]);
    setTenants((t.data as Tenant[]) ?? []);
    setProperties((p.data as Property[]) ?? []);
  };

  useEffect(() => { loadContracts(); }, []);

  // Compute "atrasado" status client-side for display
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const resolveInstStatus = (inst: Installment) => {
    if (inst.status === "pago") return "pago";
    const due = new Date(inst.due_date + "T00:00:00");
    if (due < today) return "atrasado";
    return "em_aberto";
  };

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const q = search.toLowerCase();
      const name = c.tenants?.full_name?.toLowerCase() ?? "";
      const code = c.properties?.code?.toLowerCase() ?? "";
      const match = name.includes(q) || code.includes(q);
      const st = statusFilter === "todos" || c.status === statusFilter;
      return match && st;
    });
  }, [contracts, search, statusFilter]);

  const openCreate = async () => {
    await loadDropdowns();
    setEditContract(null);
    setForm({ tenant_id: "", property_id: "", rent_value: "", start_date: "", due_day: "10", duration_months: "12" });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = async (c: Contract) => {
    await loadDropdowns();
    setEditContract(c);
    setForm({
      tenant_id: c.tenant_id,
      property_id: c.property_id,
      rent_value: formatMoney(c.rent_value),
      start_date: c.start_date,
      due_day: String(c.due_day),
      duration_months: String(c.duration_months),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.tenant_id || !form.property_id || !form.rent_value || !form.start_date) {
      setFormError("Preencha todos os campos obrigatórios.");
      return;
    }
    const rentVal = parseCurrency(form.rent_value);
    if (!rentVal || rentVal <= 0) { setFormError("Valor do aluguel inválido."); return; }
    const dueDay = parseInt(form.due_day);
    const durationMonths = parseInt(form.duration_months);
    if (!dueDay || dueDay < 1 || dueDay > 31) { setFormError("Dia de vencimento deve ser entre 1 e 31."); return; }
    if (!durationMonths || durationMonths < 1) { setFormError("Período inválido."); return; }
    if (!company?.id) return;

    setSaving(true); setFormError(null);
    try {
      let contractId: string;
      if (editContract) {
        const { error: err } = await supabase.from("rental_contracts").update({
          tenant_id: form.tenant_id, property_id: form.property_id,
          rent_value: rentVal, start_date: form.start_date,
          due_day: dueDay, duration_months: durationMonths,
          updated_at: new Date().toISOString(),
        }).eq("id", editContract.id);
        if (err) throw err;
        contractId = editContract.id;
        toast.success("Contrato atualizado.");
      } else {
        const { data, error: err } = await supabase.from("rental_contracts").insert({
          company_id: company.id,
          tenant_id: form.tenant_id,
          property_id: form.property_id,
          rent_value: rentVal,
          start_date: form.start_date,
          due_day: dueDay,
          duration_months: durationMonths,
          status: "ativo",
        }).select("id").single();
        if (err) throw err;
        contractId = data.id;

        // Generate installments
        const startDate = parseISO(form.start_date);
        const installmentRows = [];
        for (let i = 0; i < durationMonths; i++) {
          const monthDate = addMonths(startDate, i);
          let dueDate: Date;
          try {
            dueDate = setDate(monthDate, dueDay);
          } catch {
            // If day > last day of month, use last day
            const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
            dueDate = setDate(monthDate, Math.min(dueDay, lastDay));
          }
          const competence = format(monthDate, "MM/yyyy");
          installmentRows.push({
            company_id: company.id,
            contract_id: contractId,
            competence,
            due_date: format(dueDate, "yyyy-MM-dd"),
            value: rentVal,
            status: "em_aberto",
          });
        }
        const { error: instErr } = await supabase.from("rental_installments").insert(installmentRows);
        if (instErr) throw instErr;
        toast.success(`Contrato criado com ${durationMonths} parcela(s) gerada(s).`);
      }
      setDialogOpen(false);
      loadContracts();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  };

  const openDelete = (c: Contract) => { setDeleteTarget(c); setBlockMessage(null); setDeleteDialogOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true); setBlockMessage(null);
    try {
      const { count } = await supabase.from("rental_installments")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", deleteTarget.id)
        .eq("status", "pago");
      if ((count ?? 0) > 0) {
        setBlockMessage("Não é possível excluir este contrato pois existem parcelas já pagas.");
        setDeleting(false); return;
      }
      const { error: err } = await supabase.from("rental_contracts").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Contrato excluído."); setDeleteDialogOpen(false); loadContracts();
    } catch (e: any) { setBlockMessage(e.message); }
    finally { setDeleting(false); }
  };

  const openManagement = async (c: Contract) => {
    setManagementContract(c);
    setManagementOpen(true);
    setLoadingInst(true);
    const { data } = await supabase.from("rental_installments").select("*").eq("contract_id", c.id).order("due_date");
    setInstallments((data as Installment[]) ?? []);
    setLoadingInst(false);
  };

  const markAsPaid = async (inst: Installment) => {
    const paidDate = paidDateInputs[inst.id] || format(new Date(), "yyyy-MM-dd");
    setMarkingPaid(inst.id);
    const { error: err } = await supabase.from("rental_installments")
      .update({ status: "pago", paid_at: paidDate, updated_at: new Date().toISOString() })
      .eq("id", inst.id);
    if (err) { toast.error("Erro ao marcar parcela como paga."); }
    else {
      toast.success("Parcela marcada como paga.");
      setInstallments((prev) => prev.map((i) => i.id === inst.id ? { ...i, status: "pago", paid_at: paidDate } : i));
    }
    setMarkingPaid(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Aluguel</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Contratos de locação e cronogramas de pagamento.</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Novo Contrato</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por inquilino ou código do imóvel..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="encerrado">Encerrado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead>Inquilino</TableHead>
                <TableHead className="hidden sm:table-cell">Imóvel</TableHead>
                <TableHead className="hidden md:table-cell">Valor</TableHead>
                <TableHead className="hidden lg:table-cell">Início</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum contrato encontrado.
                </TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">{c.tenants?.full_name ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {c.properties?.code ?? "—"}{c.properties?.address ? ` – ${c.properties.address.slice(0, 30)}...` : ""}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm font-mono">R$ {formatMoney(c.rent_value)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {format(parseISO(c.start_date), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={(STATUS_COLORS[c.status] as any) ?? "outline"} className="text-xs capitalize">{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Gerenciar parcelas" onClick={() => openManagement(c)}><FileText className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => openDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Contract Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editContract ? "Editar contrato" : "Novo contrato de aluguel"}</DialogTitle>
            <DialogDescription>{editContract ? "Atualize os dados do contrato." : "Preencha os dados para criar um novo contrato. As parcelas serão geradas automaticamente."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <FieldLabel label="Inquilino" tooltip="Selecione o inquilino que irá locar o imóvel." required />
              <Select value={form.tenant_id} onValueChange={(v) => setForm((p) => ({ ...p, tenant_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o inquilino..." /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FieldLabel label="Imóvel" tooltip="Selecione o imóvel disponível para locação." required />
              <Select value={form.property_id} onValueChange={(v) => setForm((p) => ({ ...p, property_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o imóvel..." /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={p.id}>{p.code}{p.address ? ` – ${p.address.slice(0, 40)}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Valor do aluguel" tooltip="Valor mensal do aluguel em Reais." required />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input
                    value={form.rent_value}
                    onChange={(e) => setForm((p) => ({ ...p, rent_value: maskCurrency(e.target.value) }))}
                    placeholder="0,00"
                    className="pl-9"
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <FieldLabel label="Data de início" tooltip="Data em que o contrato começa a vigorar." required />
                <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Dia de vencimento" tooltip="Dia do mês em que o aluguel vence (1 a 31)." required />
                <Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm((p) => ({ ...p, due_day: e.target.value }))} placeholder="10" />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Período (meses)" tooltip="Duração total do contrato em meses." required />
                <Input type="number" min={1} value={form.duration_months} onChange={(e) => setForm((p) => ({ ...p, duration_months: e.target.value }))} placeholder="12" />
              </div>
            </div>
            {formError && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editContract ? "Salvar" : "Criar contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Management Dialog (installments) */}
      <Dialog open={managementOpen} onOpenChange={setManagementOpen}>
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Cronograma de pagamentos</DialogTitle>
            <DialogDescription>
              {managementContract?.tenants?.full_name} — R$ {managementContract ? formatMoney(managementContract.rent_value) : ""}/mês
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1">
            {loadingInst ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead>Competência</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data pagamento</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((inst) => {
                    const resolvedStatus = resolveInstStatus(inst);
                    return (
                      <TableRow key={inst.id} className="border-border/40">
                        <TableCell className="font-mono text-sm">{inst.competence}</TableCell>
                        <TableCell className="text-sm">{format(parseISO(inst.due_date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="font-mono text-sm">R$ {formatMoney(inst.value)}</TableCell>
                        <TableCell>
                          <Badge variant={INST_COLORS[resolvedStatus] ?? "outline"} className="text-xs">
                            {INST_LABELS[resolvedStatus] ?? resolvedStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inst.status === "pago" ? (
                            <span className="text-sm text-muted-foreground">{inst.paid_at ? format(parseISO(inst.paid_at + "T00:00:00"), "dd/MM/yyyy") : "—"}</span>
                          ) : (
                            <Input
                              type="date"
                              className="h-7 text-xs w-36"
                              value={paidDateInputs[inst.id] ?? ""}
                              onChange={(e) => setPaidDateInputs((p) => ({ ...p, [inst.id]: e.target.value }))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {inst.status !== "pago" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => markAsPaid(inst)}
                              disabled={markingPaid === inst.id}
                            >
                              {markingPaid === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              Pago
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o contrato de <strong>{deleteTarget?.tenants?.full_name}</strong>? Todas as parcelas em aberto serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {blockMessage && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{blockMessage}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!blockMessage && (
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
