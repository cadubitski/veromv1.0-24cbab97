import { useState, useEffect, useMemo, useRef } from "react";
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
  Loader2, Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, Eye, Filter,
} from "lucide-react";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { toast } from "sonner";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { format, addMonths, setDate, parseISO } from "date-fns";

interface Tenant { id: string; full_name: string; }
interface Property { id: string; code: string; address: string | null; client_name?: string; }

interface Contract {
  id: string;
  company_id: string;
  tenant_id: string;
  property_id: string;
  code: string | null;
  rent_value: number;
  start_date: string;
  due_day: number;
  duration_months: number;
  status: string;
  management_fee_percent: number;
  management_fee_value: number;
  repasse_value: number;
  created_at: string;
  tenants?: Tenant;
  properties?: Property & { clients?: { full_name: string } };
}

interface Installment {
  id: string;
  contract_id: string;
  company_id: string;
  competence: string;
  due_date: string;
  value: number;
  management_fee_percent: number;
  management_fee_value: number;
  repasse_value: number;
  status: string;
  paid_at: string | null;
}

type SortKey = "code" | "tenant_name" | "property_code" | "rent_value" | "start_date" | "due_day" | "status";
type SortDir = "asc" | "desc";

const CONTRACT_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Código", defaultVisible: true },
  { key: "tenant_name", label: "Locatário", defaultVisible: true },
  { key: "property_code", label: "Imóvel", defaultVisible: true },
  { key: "rent_value", label: "Valor", defaultVisible: true },
  { key: "management_fee", label: "Taxa Admin", defaultVisible: false },
  { key: "repasse", label: "Repasse", defaultVisible: false },
  { key: "start_date", label: "Início", defaultVisible: true },
  { key: "due_day", label: "Vencimento", defaultVisible: true },
  { key: "duration_months", label: "Período", defaultVisible: false },
  { key: "status", label: "Status", defaultVisible: true },
];

const STATUS_COLORS: Record<string, string> = {
  ativo: "default",
  encerrado: "secondary",
  cancelado: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
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

// Searchable select component
function SearchableSelect({
  placeholder,
  value,
  onChange,
  items,
  renderItem,
  getLabel,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string; sublabel?: string }[];
  renderItem?: (item: { id: string; label: string; sublabel?: string }) => React.ReactNode;
  getLabel: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = items.filter(
    (i) =>
      i.label.toLowerCase().includes(q.toLowerCase()) ||
      (i.sublabel ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const selectedLabel = value ? getLabel(value) : "";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={selectedLabel ? "text-foreground" : "text-muted-foreground"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full rounded-sm bg-transparent pl-7 pr-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Pesquisar..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado.</li>
            )}
            {filtered.map((item) => (
              <li
                key={item.id}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${item.id === value ? "bg-primary/10 text-primary" : ""}`}
                onClick={() => { onChange(item.id); setOpen(false); setQ(""); }}
              >
                {renderItem ? renderItem(item) : (
                  <div>
                    <div>{item.label}</div>
                    {item.sublabel && <div className="text-xs text-muted-foreground">{item.sublabel}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function GestaoContratos() {
  const { company } = useAuth();
  const [searchParams] = useSearchParams();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Contract dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [editContract, setEditContract] = useState<Contract | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    code: "",
    tenant_id: "",
    property_id: "",
    rent_value: "",
    start_date: "",
    due_day: "10",
    duration_months: "12",
    management_fee_percent: "0",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Visible columns
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(CONTRACT_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  // Extended filters
  const [filterTenant, setFilterTenant] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [filterStartFrom, setFilterStartFrom] = useState("");
  const [filterStartTo, setFilterStartTo] = useState("");
  const [filterDueDay, setFilterDueDay] = useState("");
  const [showFilters, setShowFilters] = useState(false);

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
  const [editingInstValue, setEditingInstValue] = useState<Record<string, string>>({});
  const [savingInstValue, setSavingInstValue] = useState<string | null>(null);

  const loadContracts = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rental_contracts")
      .select("*, tenants(id, full_name), properties(id, code, address, clients(full_name))");
    setContracts((data as Contract[]) ?? []);
    setLoading(false);
  };

  const loadDropdowns = async (contractId?: string) => {
    const [t, p] = await Promise.all([
      supabase.from("tenants").select("id, full_name").eq("status", "ativo"),
      supabase.from("properties").select("id, code, address, clients(full_name)"),
    ]);

    const { data: activeContracts } = await supabase
      .from("rental_contracts")
      .select("property_id")
      .eq("status", "ativo");

    const takenIds = new Set((activeContracts ?? []).map((c) => c.property_id));
    if (contractId) {
      const current = contracts.find((c) => c.id === contractId);
      if (current) takenIds.delete(current.property_id);
    }

    const allProps = ((p.data ?? []) as any[]).map((prop) => ({
      id: prop.id,
      code: prop.code,
      address: prop.address,
      client_name: prop.clients?.full_name ?? "",
    }));

    setTenants((t.data as Tenant[]) ?? []);
    setProperties(allProps.filter((pp) => !takenIds.has(pp.id)));
  };

  useEffect(() => { loadContracts(); }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const resolveInstStatus = (inst: Installment) => {
    if (inst.status === "pago") return "pago";
    const due = new Date(inst.due_date + "T00:00:00");
    if (due < today) return "atrasado";
    return "em_aberto";
  };

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

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap";

  const filtered = useMemo(() => {
    let arr = contracts.filter((c) => {
      const q = search.toLowerCase();
      const name = c.tenants?.full_name?.toLowerCase() ?? "";
      const code = c.properties?.code?.toLowerCase() ?? "";
      const contractCode = c.code?.toLowerCase() ?? "";
      const matchSearch = name.includes(q) || code.includes(q) || contractCode.includes(q);
      const st = statusFilter === "todos" || c.status === statusFilter;
      const matchTenant = !filterTenant || name.includes(filterTenant.toLowerCase());
      const matchProp = !filterProperty || code.includes(filterProperty.toLowerCase());
      const matchFrom = !filterStartFrom || c.start_date >= filterStartFrom;
      const matchTo = !filterStartTo || c.start_date <= filterStartTo;
      const matchDue = !filterDueDay || String(c.due_day) === filterDueDay;
      return matchSearch && st && matchTenant && matchProp && matchFrom && matchTo && matchDue;
    });
    arr = [...arr].sort((a, b) => {
      let va = "", vb = "";
      if (sortKey === "code") { va = a.code ?? ""; vb = b.code ?? ""; }
      else if (sortKey === "tenant_name") { va = a.tenants?.full_name ?? ""; vb = b.tenants?.full_name ?? ""; }
      else if (sortKey === "property_code") { va = a.properties?.code ?? ""; vb = b.properties?.code ?? ""; }
      else if (sortKey === "rent_value") { return sortDir === "asc" ? a.rent_value - b.rent_value : b.rent_value - a.rent_value; }
      else if (sortKey === "start_date") { va = a.start_date; vb = b.start_date; }
      else if (sortKey === "due_day") { return sortDir === "asc" ? a.due_day - b.due_day : b.due_day - a.due_day; }
      else if (sortKey === "status") { va = a.status; vb = b.status; }
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [contracts, search, statusFilter, sortKey, sortDir, filterTenant, filterProperty, filterStartFrom, filterStartTo, filterDueDay]);

  const openCreate = async () => {
    await loadDropdowns();
    setEditContract(null);
    setForm({ code: "", tenant_id: "", property_id: "", rent_value: "", start_date: "", due_day: "10", duration_months: "12", management_fee_percent: "0" });
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = async (c: Contract) => {
    await loadDropdowns(c.id);
    setEditContract(c);
    setForm({
      code: c.code ?? "",
      tenant_id: c.tenant_id,
      property_id: c.property_id,
      rent_value: formatMoney(c.rent_value),
      start_date: c.start_date,
      due_day: String(c.due_day),
      duration_months: String(c.duration_months),
      management_fee_percent: String(c.management_fee_percent ?? 0),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openView = (c: Contract) => { setViewContract(c); setViewDialogOpen(true); };

  const feePercent = parseFloat(form.management_fee_percent) || 0;
  const rentValPreview = parseCurrency(form.rent_value) ?? 0;
  const feeValuePreview = rentValPreview * feePercent / 100;
  const repassePreview = rentValPreview - feeValuePreview;

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
    const feeP = parseFloat(form.management_fee_percent) || 0;

    // Validate code uniqueness if provided
    if (form.code.trim()) {
      const query = supabase
        .from("rental_contracts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .eq("code", form.code.trim());
      if (editContract) query.neq("id", editContract.id);
      const { count: codeCount } = await query;
      if ((codeCount ?? 0) > 0) {
        setFormError("Já existe um contrato com este código.");
        return;
      }
    }

    setSaving(true); setFormError(null);
    try {
      let contractId: string;
      if (editContract) {
        const oldDueDay = editContract.due_day;
        const { error: err } = await supabase.from("rental_contracts").update({
          code: form.code.trim() || null,
          tenant_id: form.tenant_id, property_id: form.property_id,
          rent_value: rentVal, start_date: form.start_date,
          due_day: dueDay, duration_months: durationMonths,
          management_fee_percent: feeP,
          updated_at: new Date().toISOString(),
        }).eq("id", editContract.id);
        if (err) throw err;
        contractId = editContract.id;

        if (dueDay !== oldDueDay) {
          const { data: unpaid } = await supabase.from("rental_installments")
            .select("id, due_date")
            .eq("contract_id", contractId)
            .neq("status", "pago");
          if (unpaid && unpaid.length > 0) {
            const updates = unpaid.map((inst: any) => {
              const dt = parseISO(inst.due_date);
              const lastDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
              const newDay = Math.min(dueDay, lastDay);
              return supabase.from("rental_installments").update({
                due_date: format(setDate(dt, newDay), "yyyy-MM-dd"),
                updated_at: new Date().toISOString(),
              }).eq("id", inst.id);
            });
            await Promise.all(updates);
          }
        }
        toast.success("Contrato atualizado.");
      } else {
        const { count: taken } = await supabase.from("rental_contracts")
          .select("id", { count: "exact", head: true })
          .eq("property_id", form.property_id)
          .eq("status", "ativo");
        if ((taken ?? 0) > 0) { setFormError("Este imóvel já possui um contrato ativo."); setSaving(false); return; }

        const { data, error: err } = await supabase.from("rental_contracts").insert({
          company_id: company.id,
          code: form.code.trim() || null,
          tenant_id: form.tenant_id,
          property_id: form.property_id,
          rent_value: rentVal,
          start_date: form.start_date,
          due_day: dueDay,
          duration_months: durationMonths,
          management_fee_percent: feeP,
          status: "ativo",
        }).select("id").single();
        if (err) throw err;
        contractId = data.id;

        await supabase.from("properties").update({ status: "alugado" }).eq("id", form.property_id);

        const startDate = parseISO(form.start_date);
        const installmentRows = [];
        for (let i = 0; i < durationMonths; i++) {
          const monthDate = addMonths(startDate, i);
          let dueDate: Date;
          try {
            dueDate = setDate(monthDate, dueDay);
          } catch {
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
            management_fee_percent: feeP,
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
      await supabase.from("properties").update({ status: "disponivel" }).eq("id", deleteTarget.property_id);
      toast.success("Contrato excluído."); setDeleteDialogOpen(false); loadContracts();
    } catch (e: any) { setBlockMessage(e.message); }
    finally { setDeleting(false); }
  };

  const handleChangeStatus = async (c: Contract, newStatus: string) => {
    await supabase.from("rental_contracts").update({ status: newStatus }).eq("id", c.id);
    if (newStatus !== "ativo") {
      await supabase.from("properties").update({ status: "disponivel" }).eq("id", c.property_id);
    }
    loadContracts();
    toast.success("Status do contrato atualizado.");
  };

  const openManagement = async (c: Contract) => {
    setManagementContract(c);
    setManagementOpen(true);
    setLoadingInst(true);
    const { data } = await supabase.from("rental_installments").select("*").eq("contract_id", c.id).order("due_date");
    setInstallments((data as Installment[]) ?? []);
    setEditingInstValue({});
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

  const saveInstValue = async (inst: Installment) => {
    const newVal = parseCurrency(editingInstValue[inst.id]);
    if (!newVal || newVal <= 0) { toast.error("Valor inválido."); return; }
    setSavingInstValue(inst.id);
    const feeP = inst.management_fee_percent ?? 0;
    const { error: err } = await supabase.from("rental_installments").update({
      value: newVal,
      updated_at: new Date().toISOString(),
    }).eq("id", inst.id);
    if (err) { toast.error("Erro ao atualizar valor."); }
    else {
      toast.success("Valor atualizado.");
      setInstallments((prev) => prev.map((i) => i.id === inst.id ? {
        ...i, value: newVal,
        management_fee_value: newVal * feeP / 100,
        repasse_value: newVal - newVal * feeP / 100,
      } : i));
      setEditingInstValue((p) => { const n = { ...p }; delete n[inst.id]; return n; });
    }
    setSavingInstValue(null);
  };

  const tenantItems = tenants.map((t) => ({ id: t.id, label: t.full_name }));
  const propertyItems = properties.map((p) => ({
    id: p.id,
    label: p.code + (p.address ? ` – ${p.address.slice(0, 30)}` : ""),
    sublabel: p.client_name ? `Locador: ${p.client_name}` : "",
  }));

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestão de Contratos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Contratos de locação e cronogramas de pagamento.</p>
          </div>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" /> Novo Contrato</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por código, locatário ou imóvel..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => setShowFilters((v) => !v)}>
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
          <ColumnSelector columns={CONTRACT_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4 rounded-xl border border-border/40 bg-muted/20">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Locatário</p>
              <Input placeholder="Nome do locatário" value={filterTenant} onChange={(e) => setFilterTenant(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Imóvel</p>
              <Input placeholder="Código do imóvel" value={filterProperty} onChange={(e) => setFilterProperty(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Início de</p>
              <Input type="date" value={filterStartFrom} onChange={(e) => setFilterStartFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Início até</p>
              <Input type="date" value={filterStartTo} onChange={(e) => setFilterStartTo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Dia vencimento</p>
              <Input type="number" min={1} max={31} placeholder="1–31" value={filterDueDay} onChange={(e) => setFilterDueDay(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setFilterTenant(""); setFilterProperty(""); setFilterStartFrom(""); setFilterStartTo(""); setFilterDueDay(""); }}>
              Limpar filtros
            </Button>
          </div>
        )}

        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                {visibleCols.has("code") && <TableHead className={thClass} onClick={() => handleSort("code")}>Código <SortIcon col="code" /></TableHead>}
                {visibleCols.has("tenant_name") && <TableHead className={thClass} onClick={() => handleSort("tenant_name")}>Locatário <SortIcon col="tenant_name" /></TableHead>}
                {visibleCols.has("property_code") && <TableHead className={thClass} onClick={() => handleSort("property_code")}>Imóvel <SortIcon col="property_code" /></TableHead>}
                {visibleCols.has("rent_value") && <TableHead className={thClass} onClick={() => handleSort("rent_value")}>Valor <SortIcon col="rent_value" /></TableHead>}
                {visibleCols.has("management_fee") && <TableHead className="whitespace-nowrap">Taxa Admin</TableHead>}
                {visibleCols.has("repasse") && <TableHead>Repasse</TableHead>}
                {visibleCols.has("start_date") && <TableHead className={thClass} onClick={() => handleSort("start_date")}>Início <SortIcon col="start_date" /></TableHead>}
                {visibleCols.has("due_day") && <TableHead className={thClass} onClick={() => handleSort("due_day")}>Venc. <SortIcon col="due_day" /></TableHead>}
                {visibleCols.has("duration_months") && <TableHead className="whitespace-nowrap">Período</TableHead>}
                {visibleCols.has("status") && <TableHead className={thClass} onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>}
                <TableHead className="text-right w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum contrato encontrado.
                </TableCell></TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                  {visibleCols.has("code") && (
                    <TableCell className="font-mono text-sm font-medium">
                      {c.code ? <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{c.code}</span> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                  )}
                  {visibleCols.has("tenant_name") && <TableCell className="font-medium text-sm">{c.tenants?.full_name ?? "—"}</TableCell>}
                  {visibleCols.has("property_code") && (
                    <TableCell className="text-muted-foreground text-sm">
                      <span className="font-medium text-foreground">{c.properties?.code ?? "—"}</span>
                      {c.properties?.address ? <span className="hidden lg:inline"> – {c.properties.address.slice(0, 20)}</span> : ""}
                    </TableCell>
                  )}
                  {visibleCols.has("rent_value") && <TableCell className="text-sm font-mono">R$ {formatMoney(c.rent_value)}</TableCell>}
                  {visibleCols.has("management_fee") && <TableCell className="text-sm font-mono text-muted-foreground">{c.management_fee_percent}% · R$ {formatMoney(c.management_fee_value ?? 0)}</TableCell>}
                  {visibleCols.has("repasse") && <TableCell className="text-sm font-mono text-muted-foreground">R$ {formatMoney(c.repasse_value ?? 0)}</TableCell>}
                  {visibleCols.has("start_date") && <TableCell className="text-muted-foreground text-sm whitespace-nowrap">{format(parseISO(c.start_date), "dd/MM/yyyy")}</TableCell>}
                  {visibleCols.has("due_day") && <TableCell className="text-muted-foreground text-sm">Dia {c.due_day}</TableCell>}
                  {visibleCols.has("duration_months") && <TableCell className="text-muted-foreground text-sm">{c.duration_months}m</TableCell>}
                  {visibleCols.has("status") && (
                    <TableCell>
                      <Badge variant={(STATUS_COLORS[c.status] as any) ?? "outline"} className="text-xs">
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-right w-[120px]">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar" onClick={() => openView(c)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Parcelas" onClick={() => openManagement(c)}><FileText className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" title="Excluir" onClick={() => openDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Detalhes do Contrato</DialogTitle></DialogHeader>
          {viewContract && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {viewContract.code && (
                  <div className="col-span-2"><p className="text-muted-foreground text-xs">Código do contrato</p><p className="font-mono font-medium">{viewContract.code}</p></div>
                )}
                <div><p className="text-muted-foreground text-xs">Locatário</p><p className="font-medium">{viewContract.tenants?.full_name ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Imóvel</p><p className="font-medium">{viewContract.properties?.code ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Endereço</p><p>{viewContract.properties?.address ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Locador</p><p>{(viewContract.properties as any)?.clients?.full_name ?? "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Valor aluguel</p><p className="font-mono">R$ {formatMoney(viewContract.rent_value)}</p></div>
                <div><p className="text-muted-foreground text-xs">Início</p><p>{format(parseISO(viewContract.start_date), "dd/MM/yyyy")}</p></div>
                <div><p className="text-muted-foreground text-xs">Vencimento</p><p>Dia {viewContract.due_day}</p></div>
                <div><p className="text-muted-foreground text-xs">Período</p><p>{viewContract.duration_months} meses</p></div>
                <div><p className="text-muted-foreground text-xs">Taxa admin (%)</p><p>{viewContract.management_fee_percent ?? 0}%</p></div>
                <div><p className="text-muted-foreground text-xs">Valor admin</p><p className="font-mono">R$ {formatMoney(viewContract.management_fee_value ?? 0)}</p></div>
                <div><p className="text-muted-foreground text-xs">Valor repasse</p><p className="font-mono">R$ {formatMoney(viewContract.repasse_value ?? 0)}</p></div>
                <div><p className="text-muted-foreground text-xs">Status</p><Badge variant={(STATUS_COLORS[viewContract.status] as any) ?? "outline"} className="text-xs">{STATUS_LABELS[viewContract.status] ?? viewContract.status}</Badge></div>
              </div>
              {viewContract.status === "ativo" && (
                <div className="flex gap-2 pt-2 border-t border-border/40">
                  <Button size="sm" variant="outline" onClick={() => { handleChangeStatus(viewContract, "encerrado"); setViewDialogOpen(false); }}>Encerrar contrato</Button>
                  <Button size="sm" variant="outline" onClick={() => { handleChangeStatus(viewContract, "cancelado"); setViewDialogOpen(false); }}>Cancelar contrato</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Contract Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editContract ? "Editar contrato" : "Novo contrato"}</DialogTitle>
            <DialogDescription>{editContract ? "Atualize os dados do contrato." : "Preencha os dados para criar um novo contrato."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <FieldLabel label="Código do contrato" tooltip="Código de identificação do contrato (ex: CT-001). Deve ser único." />
              <Input
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="Ex: CT-001"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel label="Locatário" tooltip="Selecione o locatário que irá locar o imóvel." required />
              <SearchableSelect
                placeholder="Selecione o locatário..."
                value={form.tenant_id}
                onChange={(v) => setForm((p) => ({ ...p, tenant_id: v }))}
                items={tenantItems}
                getLabel={(id) => tenants.find((t) => t.id === id)?.full_name ?? ""}
              />
            </div>
            <div className="space-y-2">
              <FieldLabel label="Imóvel" tooltip="Apenas imóveis disponíveis (não alugados) são exibidos. O proprietário é mostrado abaixo." required />
              <SearchableSelect
                placeholder="Selecione o imóvel..."
                value={form.property_id}
                onChange={(v) => setForm((p) => ({ ...p, property_id: v }))}
                items={propertyItems}
                getLabel={(id) => {
                  const p = properties.find((pp) => pp.id === id);
                  return p ? p.code + (p.address ? ` – ${p.address.slice(0, 30)}` : "") : "";
                }}
              />
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
                <FieldLabel label="Taxa de administração (%)" tooltip="Percentual da taxa de administração da imobiliária." />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={form.management_fee_percent}
                  onChange={(e) => setForm((p) => ({ ...p, management_fee_percent: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            {rentValPreview > 0 && (
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Valor administração</p><p className="font-mono font-medium">R$ {formatMoney(feeValuePreview)}</p></div>
                <div><p className="text-xs text-muted-foreground">Valor repasse</p><p className="font-mono font-medium">R$ {formatMoney(repassePreview)}</p></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Data de início" tooltip="Data em que o contrato começa a vigorar." required />
                <Input type="date" value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Dia de vencimento" tooltip="Dia do mês em que o aluguel vence (1 a 31)." required />
                <Input type="number" min={1} max={31} value={form.due_day} onChange={(e) => setForm((p) => ({ ...p, due_day: e.target.value }))} placeholder="10" />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel label="Período (meses)" tooltip="Duração total do contrato em meses." required />
              <Input type="number" min={1} value={form.duration_months} onChange={(e) => setForm((p) => ({ ...p, duration_months: e.target.value }))} placeholder="12" />
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
        <DialogContent className="sm:max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Cronograma de pagamentos</DialogTitle>
            <DialogDescription>
              {managementContract?.tenants?.full_name} — R$ {managementContract ? formatMoney(managementContract.rent_value) : ""}/mês
              {managementContract && managementContract.management_fee_percent > 0 && (
                <> · Taxa: {managementContract.management_fee_percent}% · Repasse: R$ {formatMoney(managementContract.repasse_value)}</>
              )}
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
                    <TableHead className="hidden md:table-cell">Tx. Admin</TableHead>
                    <TableHead className="hidden md:table-cell">Repasse</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((inst) => {
                    const resolvedStatus = resolveInstStatus(inst);
                    const isEditing = editingInstValue[inst.id] !== undefined;
                    const feeP = inst.management_fee_percent ?? 0;
                    const feeV = inst.management_fee_value ?? (inst.value * feeP / 100);
                    const rep = inst.repasse_value ?? (inst.value - feeV);
                    return (
                      <TableRow key={inst.id} className="border-border/40">
                        <TableCell className="font-mono text-sm">{inst.competence}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{format(parseISO(inst.due_date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {inst.status !== "pago" && isEditing ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 text-xs w-24"
                                value={editingInstValue[inst.id]}
                                onChange={(e) => setEditingInstValue((p) => ({ ...p, [inst.id]: maskCurrency(e.target.value) }))}
                                inputMode="numeric"
                              />
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveInstValue(inst)} disabled={savingInstValue === inst.id}>
                                {savingInstValue === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingInstValue((p) => { const n = { ...p }; delete n[inst.id]; return n; })}>✕</Button>
                            </div>
                          ) : (
                            <span
                              className={inst.status !== "pago" ? "cursor-pointer hover:text-primary transition-colors" : ""}
                              title={inst.status !== "pago" ? "Clique para editar" : ""}
                              onClick={() => inst.status !== "pago" && setEditingInstValue((p) => ({ ...p, [inst.id]: formatMoney(inst.value) }))}
                            >
                              R$ {formatMoney(inst.value)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">R$ {formatMoney(feeV)}</TableCell>
                        <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">R$ {formatMoney(rep)}</TableCell>
                        <TableCell>
                          <Badge variant={INST_COLORS[resolvedStatus] ?? "outline"} className="text-xs">
                            {INST_LABELS[resolvedStatus] ?? resolvedStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {inst.status === "pago" ? (
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{inst.paid_at ? format(parseISO(inst.paid_at + "T00:00:00"), "dd/MM/yyyy") : "—"}</span>
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
