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
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Loader2, Plus, Search, Pencil, Trash2, ChevronDown, ChevronUp, FileText, CheckCircle2, Eye, Filter, Printer, Download,
  DollarSign, RefreshCcw, AlertCircle,
} from "lucide-react";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { StatusDot, ActionGear } from "@/components/TableActions";
import { toast } from "sonner";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { format, addMonths, setDate, parseISO } from "date-fns";
import * as XLSX from "xlsx";

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
  repasse_days_after_receipt: number;
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
  management_fee_value: number | null;
  repasse_value: number | null;
  tax_base_value: number | null;
  irrf_value: number | null;
  owner_net_value: number | null;
  ir_rate: number | null;
  ir_deduction: number | null;
  status: string;
  paid_at: string | null;
  financial_status: string;
  accounts_receivable_id: string | null;
}

type SortKey = "code" | "tenant_name" | "property_code" | "rent_value" | "start_date" | "due_day" | "status";
type SortDir = "asc" | "desc";

const CONTRACT_COLUMNS: ColumnDef[] = [
  { key: "code", label: "Código", defaultVisible: true },
  { key: "owner_name", label: "Proprietário", defaultVisible: true },
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

// Financial status badge for installments
const FinancialStatusBadge = ({ status }: { status: string }) => {
  if (status === "repasse_paid") return <Badge className="bg-emerald-700/15 text-emerald-700 border-emerald-700/25 text-xs font-normal">Repasse Efetuado</Badge>;
  if (status === "repasse_generated") return <Badge className="bg-violet-500/15 text-violet-600 border-violet-500/25 text-xs font-normal">Repasse Gerado</Badge>;
  if (status === "paid") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25 text-xs font-normal">Pago</Badge>;
  if (status === "generated") return <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/25 text-xs font-normal">CR Gerado</Badge>;
  if (status === "cancelled") return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-xs font-normal">Cancelado</Badge>;
  return <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 text-xs font-normal">Pendente</Badge>;
};


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

interface DocumentTemplate {
  id: string;
  nome_modelo: string;
  descricao: string | null;
  conteudo_markdown: string;
  entidades_utilizadas: string[];
}

// Simple markdown-to-HTML converter
function markdownToHtml(md: string): string {
  let html = md
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // HR
    .replace(/^---$/gm, '<hr/>')
    // Unordered list items
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`)
    // Line breaks to paragraphs (double newline)
    .split(/\n\n+/)
    .map((block) => {
      if (/^<(h[1-3]|ul|hr|li)/.test(block.trim())) return block;
      return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
  return html;
}

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GestaoContratos() {
  const { company, role } = useAuth();
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
    repasse_days_after_receipt: "5",
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
  const [editingInstValue, setEditingInstValue] = useState<Record<string, string>>({});
  const [savingInstValue, setSavingInstValue] = useState<string | null>(null);

  // Generate accounts receivable dialog
  const [generateCROpen, setGenerateCROpen] = useState(false);
  const [generatingCR, setGeneratingCR] = useState(false);

  // Reopen installments dialog
  const [reopenInstOpen, setReopenInstOpen] = useState(false);
  const [reopeningInst, setReopeningInst] = useState(false);


  // Print / template
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printContract, setPrintContract] = useState<Contract | null>(null);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

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
    setForm({ code: "", tenant_id: "", property_id: "", rent_value: "", start_date: "", due_day: "10", duration_months: "12", management_fee_percent: "0", repasse_days_after_receipt: "5" });
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
      repasse_days_after_receipt: String(c.repasse_days_after_receipt ?? 5),
    });
    setFormError(null);
    setDialogOpen(true);
  };

  const openView = (c: Contract) => { setViewContract(c); setViewDialogOpen(true); };

  const openPrint = async (c: Contract) => {
    setPrintContract(c);
    setSelectedTemplateId("");
    setLoadingTemplates(true);
    setPrintDialogOpen(true);
    const { data } = await supabase.from("document_templates").select("id, nome_modelo, descricao, conteudo_markdown, entidades_utilizadas").order("nome_modelo");
    setTemplates((data as DocumentTemplate[]) ?? []);
    setLoadingTemplates(false);
  };

  const handleGenerateDocument = async () => {
    if (!selectedTemplateId || !printContract) return;
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    setGenerating(true);
    try {
      // Fetch full contract data with relations
      const { data: contractData } = await supabase
        .from("rental_contracts")
        .select("*, tenants(*), properties(*, clients(*), property_types(name))")
        .eq("id", printContract.id)
        .single();

      if (!contractData) throw new Error("Contrato não encontrado.");

      const c = contractData as any;
      const tenant = c.tenants ?? {};
      const property = c.properties ?? {};
      const owner = property.clients ?? {};

      // Build replacement map
      const replacements: Record<string, string> = {
        "{{contrato.codigo}}": c.code ?? "—",
        "{{contrato.valor_aluguel}}": `R$ ${formatMoney(c.rent_value)}`,
        "{{contrato.data_inicio}}": c.start_date ? format(parseISO(c.start_date), "dd/MM/yyyy") : "—",
        "{{contrato.dia_vencimento}}": String(c.due_day ?? "—"),
        "{{contrato.duracao_meses}}": String(c.duration_months ?? "—"),
        "{{contrato.taxa_administracao}}": `${c.management_fee_percent ?? 0}%`,
        "{{contrato.valor_taxa}}": `R$ ${formatMoney(c.management_fee_value ?? 0)}`,
        "{{contrato.valor_repasse}}": `R$ ${formatMoney(c.repasse_value ?? 0)}`,
        "{{contrato.status}}": c.status ?? "—",
        "{{locatario.nome}}": tenant.full_name ?? "—",
        "{{locatario.documento}}": tenant.document ?? "—",
        "{{locatario.email}}": tenant.email ?? "—",
        "{{locatario.telefone}}": tenant.phone ?? "—",
        "{{locatario.whatsapp}}": tenant.whatsapp ?? "—",
        "{{locatario.endereco}}": tenant.address ?? "—",
        "{{locador.nome}}": owner.full_name ?? "—",
        "{{locador.documento}}": owner.document ?? "—",
        "{{locador.email}}": owner.email ?? "—",
        "{{locador.telefone}}": owner.phone ?? "—",
        "{{locador.whatsapp}}": owner.whatsapp ?? "—",
        "{{locador.endereco}}": owner.address ?? "—",
        "{{imovel.codigo}}": property.code ?? "—",
        "{{imovel.endereco}}": property.address ?? "—",
        "{{imovel.tipo}}": property.property_types?.name ?? "—",
        "{{imovel.area_m2}}": property.area_m2 ? `${property.area_m2} m²` : "—",
        "{{imovel.matricula}}": property.registry_number ?? "—",
        "{{imovel.inscricao_municipal}}": property.municipal_registration ?? "—",
        "{{imovel.valor_aluguel}}": property.rent_value ? `R$ ${formatMoney(property.rent_value)}` : "—",
      };

      // Replace all known tags
      let content = template.conteudo_markdown;
      for (const [tag, value] of Object.entries(replacements)) {
        content = content.split(tag).join(value);
      }
      // Highlight unresolved tags
      content = content.replace(/\{\{[^}]+\}\}/g, (match) =>
        `<span class="unresolved">${match}</span>`
      );

      const html = markdownToHtml(content);

      // Open preview window
      const previewWin = window.open("/document-preview.html", "_blank");
      if (!previewWin) { toast.error("Popup bloqueado. Permita popups para este site."); return; }

      const sendData = () => {
        previewWin.postMessage({ title: template.nome_modelo, html }, "*");
      };

      // Wait for ready signal from the new window, with fallback
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "ready") {
          sendData();
          window.removeEventListener("message", handler);
        }
      };
      window.addEventListener("message", handler);
      // Fallback after 2s
      setTimeout(() => { sendData(); window.removeEventListener("message", handler); }, 2000);

      setPrintDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar documento.");
    } finally {
      setGenerating(false);
    }
  };

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
        const feeValEdit = rentVal * feeP / 100;
        const repasseValEdit = rentVal - feeValEdit;
        const repDaysEdit = parseInt(form.repasse_days_after_receipt) || 5;
        const { error: err } = await supabase.from("rental_contracts").update({
          code: form.code.trim() || null,
          tenant_id: form.tenant_id, property_id: form.property_id,
          rent_value: rentVal, start_date: form.start_date,
          due_day: dueDay, duration_months: durationMonths,
          management_fee_percent: feeP,
          management_fee_value: feeValEdit,
          repasse_value: repasseValEdit,
          repasse_days_after_receipt: repDaysEdit,
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

        const feeValContract = rentVal * feeP / 100;
        const repasseValContract = rentVal - feeValContract;
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
          management_fee_value: feeValContract,
          repasse_value: repasseValContract,
          status: "ativo",
        }).select("id").single();
        if (err) throw err;
        contractId = data.id;

        await supabase.from("properties").update({ status: "alugado" }).eq("id", form.property_id);

        // Fetch property owner type and all tax brackets for IR calculation
        const { data: propData } = await supabase
          .from("properties")
          .select("clients(person_type)")
          .eq("id", form.property_id)
          .single();
        const ownerPersonType = (propData as any)?.clients?.person_type ?? "fisica";

        const { data: allTaxBrackets } = await supabase
          .from("income_tax_brackets")
          .select("*")
          .order("valid_from_date", { ascending: false });

        // Returns the correct bracket set for a given competence (MM/yyyy)
        const getBracketsForCompetence = (competence: string, brackets: any[]): any[] => {
          if (!brackets || brackets.length === 0) return [];
          // Parse competence MM/yyyy to a date string YYYY-MM-01
          const [month, year] = competence.split("/");
          const compDate = `${year}-${month}-01`;
          // Find the most recent valid_from_date <= compDate
          const sorted = [...brackets].sort((a, b) =>
            (b.valid_from_date ?? "2000-01-01").localeCompare(a.valid_from_date ?? "2000-01-01")
          );
          const latestValidDate = sorted.find((b) => (b.valid_from_date ?? "2000-01-01") <= compDate)?.valid_from_date;
          if (!latestValidDate) return [];
          return brackets.filter((b) => (b.valid_from_date ?? "2000-01-01") === latestValidDate);
        };

        const calcIR = (rentValue: number, competence: string): { feeVal: number; taxBase: number; irrfVal: number; ownerNet: number; repasseVal: number; appliedRate: number | null; appliedDeduction: number | null } => {
          const feeVal = rentValue * feeP / 100;
          const taxBase = rentValue - feeVal;
          let irrfVal = 0;
          let appliedRate: number | null = null;
          let appliedDeduction: number | null = null;
          if (ownerPersonType === "fisica" && allTaxBrackets && allTaxBrackets.length > 0) {
            const brackets = getBracketsForCompetence(competence, allTaxBrackets as any[]);
            const bracket = brackets.find(
              (b: any) => taxBase >= b.range_start && (b.range_end == null || taxBase <= b.range_end)
            );
            if (bracket) {
              appliedRate = bracket.rate;
              appliedDeduction = bracket.deduction;
              irrfVal = Math.max(0, (taxBase * bracket.rate / 100) - bracket.deduction);
            }
          }
          const ownerNet = taxBase - irrfVal;
          return { feeVal, taxBase, irrfVal, ownerNet, repasseVal: ownerNet, appliedRate, appliedDeduction };
        };

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
          const ir = calcIR(rentVal, competence);
          installmentRows.push({
            company_id: company.id,
            contract_id: contractId,
            competence,
            due_date: format(dueDate, "yyyy-MM-dd"),
            value: rentVal,
            management_fee_percent: feeP,
            management_fee_value: ir.feeVal,
            repasse_value: ir.repasseVal,
            tax_base_value: ir.taxBase,
            irrf_value: ir.irrfVal,
            owner_net_value: ir.ownerNet,
            ir_rate: ir.appliedRate,
            ir_deduction: ir.appliedDeduction,
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
    const { error: err } = await supabase.from("rental_contracts").update({ status: newStatus }).eq("id", c.id);
    if (err) { toast.error("Erro ao atualizar status."); return; }
    if (newStatus !== "ativo") {
      await supabase.from("properties").update({ status: "disponivel" }).eq("id", c.property_id);
    }
    setViewDialogOpen(false);
    setStatusChangeTarget(null);
    await loadContracts();
    toast.success(`Contrato ${newStatus === "encerrado" ? "encerrado" : "cancelado"} com sucesso. Imóvel liberado.`);
  };

  const [statusChangeTarget, setStatusChangeTarget] = useState<{ contract: Contract; newStatus: string } | null>(null);

  const openManagement = async (c: Contract) => {
    setManagementContract(c);
    setManagementOpen(true);
    setLoadingInst(true);
    const { data } = await supabase.from("rental_installments").select("*").eq("contract_id", c.id).order("due_date");
    setInstallments((data as Installment[]) ?? []);
    setEditingInstValue({});
    setLoadingInst(false);
  };

  // Generate accounts receivable function
  const handleGenerateCR = async () => {
    if (!managementContract || !company) return;
    setGeneratingCR(true);
    try {
      const pendingInsts = installments.filter((i) => i.financial_status === "pending");
      if (pendingInsts.length === 0) {
        toast.warning("Nenhuma parcela pendente para gerar.");
        setGeneratingCR(false);
        setGenerateCROpen(false);
        return;
      }

      // Get tenant_id from contract
      const tenantId = managementContract.tenant_id;

      for (const inst of pendingInsts) {
        // Build document_number: ALUG-{contractCode}-{YYYYMM}
        const [month, year] = inst.competence.split("/");
        const compYYYYMM = `${year}${month}`;
        const contractRef = managementContract.code ?? managementContract.id.slice(0, 8);
        const docNumber = `ALUG-${contractRef}-${compYYYYMM}`;

        // Check uniqueness
        const { data: existing } = await supabase
          .from("accounts_receivable")
          .select("id")
          .eq("company_id", company.id)
          .eq("document_number", docNumber)
          .maybeSingle();

        if (existing) {
          toast.warning(`Título ${docNumber} já existe. Ignorado.`);
          continue;
        }

        // Create accounts_receivable record
        const { data: arData, error: arErr } = await supabase
          .from("accounts_receivable")
          .insert({
            company_id: company.id,
            client_id: tenantId,
            contract_id: managementContract.id,
            installment_id: inst.id,
            document_number: docNumber,
            description: `Aluguel - Contrato ${contractRef} - Parcela ${inst.competence}`,
            issue_date: format(new Date(), "yyyy-MM-dd"),
            due_date: inst.due_date,
            amount: inst.value,
            source_type: "contract_installment",
            status: "pending",
          })
          .select("id")
          .single();

        if (arErr || !arData) {
          toast.error(`Erro ao gerar título para ${inst.competence}: ${arErr?.message}`);
          continue;
        }

        // Update installment
        await supabase
          .from("rental_installments")
          .update({
            financial_status: "generated",
            accounts_receivable_id: arData.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", inst.id);
      }

      toast.success(`${pendingInsts.length} título(s) de Contas a Receber gerado(s) com sucesso!`);
      setGenerateCROpen(false);

      // Reload installments
      const { data } = await supabase.from("rental_installments").select("*").eq("contract_id", managementContract.id).order("due_date");
      setInstallments((data as Installment[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar Contas a Receber.");
    } finally {
      setGeneratingCR(false);
    }
  };

  // Reopen pending installments (admin)
  const handleReopenInst = async () => {
    if (!managementContract) return;
    setReopeningInst(true);
    try {
      const generatedInsts = installments.filter((i) => i.financial_status === "generated");
      for (const inst of generatedInsts) {
        if (inst.accounts_receivable_id) {
          await supabase.from("accounts_receivable").delete().eq("id", inst.accounts_receivable_id);
        }
        await supabase.from("rental_installments").update({
          financial_status: "pending",
          accounts_receivable_id: null,
          updated_at: new Date().toISOString(),
        }).eq("id", inst.id);
      }
      toast.success(`${generatedInsts.length} parcela(s) reaberta(s) com sucesso.`);
      setReopenInstOpen(false);
      const { data } = await supabase.from("rental_installments").select("*").eq("contract_id", managementContract.id).order("due_date");
      setInstallments((data as Installment[]) ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao reabrir parcelas.");
    } finally {
      setReopeningInst(false);
    }
  };


  const saveInstValue = async (inst: Installment) => {
    const newVal = parseCurrency(editingInstValue[inst.id]);
    if (!newVal || newVal <= 0) { toast.error("Valor inválido."); return; }
    setSavingInstValue(inst.id);
    const feeP = inst.management_fee_percent ?? 0;
    const feeVal = newVal * feeP / 100;
    const taxBase = newVal - feeVal;

    // Recalculate IR for the new value using competence-based bracket selection
    let irrfVal = 0;
    let appliedRate: number | null = null;
    let appliedDeduction: number | null = null;
    if (managementContract) {
      const { data: propData } = await supabase
        .from("properties")
        .select("clients(person_type)")
        .eq("id", managementContract.property_id)
        .single();
      const ownerPersonType = (propData as any)?.clients?.person_type ?? "fisica";
      if (ownerPersonType === "fisica") {
        const { data: allBrackets } = await supabase.from("income_tax_brackets").select("*").order("valid_from_date", { ascending: false });
        if (allBrackets && allBrackets.length > 0) {
          const [month, year] = inst.competence.split("/");
          const compDate = `${year}-${month}-01`;
          const sortedBrackets = [...(allBrackets as any[])].sort((a, b) =>
            (b.valid_from_date ?? "2000-01-01").localeCompare(a.valid_from_date ?? "2000-01-01")
          );
          const latestValidDate = sortedBrackets.find((b) => (b.valid_from_date ?? "2000-01-01") <= compDate)?.valid_from_date;
          if (latestValidDate) {
            const periodBrackets = (allBrackets as any[]).filter((b) => (b.valid_from_date ?? "2000-01-01") === latestValidDate);
            const bracket = periodBrackets.find((b: any) => taxBase >= b.range_start && (b.range_end == null || taxBase <= b.range_end));
            if (bracket) {
              appliedRate = bracket.rate;
              appliedDeduction = bracket.deduction;
              irrfVal = Math.max(0, (taxBase * bracket.rate / 100) - bracket.deduction);
            }
          }
        }
      }
    }
    const ownerNet = taxBase - irrfVal;

    const { error: err } = await supabase.from("rental_installments").update({
      value: newVal,
      management_fee_percent: feeP,
      management_fee_value: feeVal,
      repasse_value: ownerNet,
      tax_base_value: taxBase,
      irrf_value: irrfVal,
      owner_net_value: ownerNet,
      ir_rate: appliedRate,
      ir_deduction: appliedDeduction,
      updated_at: new Date().toISOString(),
    }).eq("id", inst.id);
    if (err) { toast.error("Erro ao atualizar valor."); }
    else {
      toast.success("Valor atualizado.");
      setInstallments((prev) => prev.map((i) => i.id === inst.id ? {
        ...i, value: newVal, management_fee_value: newVal * feeP / 100,
        tax_base_value: taxBase, irrf_value: irrfVal, owner_net_value: ownerNet, repasse_value: ownerNet,
        ir_rate: appliedRate, ir_deduction: appliedDeduction,
      } : i));
      setEditingInstValue((p) => { const n = { ...p }; delete n[inst.id]; return n; });
    }
    setSavingInstValue(null);
  };

  const exportInstallmentsExcel = () => {
    if (!managementContract || installments.length === 0) return;
    const exportData = installments.map((inst) => {
      const feeP = inst.management_fee_percent ?? 0;
      const feeV = inst.management_fee_value ?? (inst.value * feeP / 100);
      const taxBase = inst.tax_base_value ?? (inst.value - feeV);
      const irrfV = inst.irrf_value ?? 0;
      const ownerNet = inst.owner_net_value ?? inst.repasse_value ?? (taxBase - irrfV);
      const resolvedStatus = resolveInstStatus(inst);
      return {
        "Competência": inst.competence,
        "Vencimento": format(parseISO(inst.due_date + "T00:00:00"), "dd/MM/yyyy"),
        "Status": INST_LABELS[resolvedStatus] ?? inst.status,
        "Data Pagamento": inst.paid_at ? format(parseISO(inst.paid_at + "T00:00:00"), "dd/MM/yyyy") : "",
        "Valor do aluguel (R$)": inst.value,
        "Tx. Adm (%)": feeP,
        "Valor Tx. Adm (R$)": feeV,
        "Base IR (R$)": taxBase,
        "Alíquota IR (%)": inst.ir_rate ?? 0,
        "Dedução IR (R$)": inst.ir_deduction ?? 0,
        "Valor IR / IRRF (R$)": irrfV,
        "Repasse ao proprietário (R$)": ownerNet,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parcelas");
    const filename = `parcelas_${managementContract.code ?? managementContract.id.slice(0, 8)}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, filename);
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
                {visibleCols.has("owner_name") && <TableHead className="whitespace-nowrap">Proprietário</TableHead>}
                {visibleCols.has("tenant_name") && <TableHead className={thClass} onClick={() => handleSort("tenant_name")}>Locatário <SortIcon col="tenant_name" /></TableHead>}
                {visibleCols.has("property_code") && <TableHead className={thClass} onClick={() => handleSort("property_code")}>Imóvel <SortIcon col="property_code" /></TableHead>}
                {visibleCols.has("rent_value") && <TableHead className={thClass} onClick={() => handleSort("rent_value")}>Valor <SortIcon col="rent_value" /></TableHead>}
                {visibleCols.has("management_fee") && <TableHead className="whitespace-nowrap">Taxa Admin</TableHead>}
                {visibleCols.has("repasse") && <TableHead>Repasse</TableHead>}
                {visibleCols.has("start_date") && <TableHead className={thClass} onClick={() => handleSort("start_date")}>Início <SortIcon col="start_date" /></TableHead>}
                {visibleCols.has("due_day") && <TableHead className={thClass} onClick={() => handleSort("due_day")}>Venc. <SortIcon col="due_day" /></TableHead>}
                {visibleCols.has("duration_months") && <TableHead className="whitespace-nowrap">Período</TableHead>}
                {visibleCols.has("status") && <TableHead className={`${thClass} w-px whitespace-nowrap`} onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>}
                <TableHead className="text-right w-px whitespace-nowrap">Ações</TableHead>
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
                  {visibleCols.has("owner_name") && <TableCell className="text-sm text-muted-foreground">{c.properties?.clients?.full_name ?? "—"}</TableCell>}
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
                    <TableCell className="w-px whitespace-nowrap"><StatusDot status={c.status} /></TableCell>
                  )}
                  <TableCell className="text-right w-px whitespace-nowrap">
                    <ActionGear
                      legendKeys={["ativo", "encerrado", "cancelado"]}
                      actions={[
                        { label: "Visualizar", icon: <Eye className="h-3.5 w-3.5" />, onClick: () => openView(c) },
                        { label: "Parcelas", icon: <FileText className="h-3.5 w-3.5" />, onClick: () => openManagement(c) },
                        { label: "Imprimir contrato", icon: <Printer className="h-3.5 w-3.5" />, onClick: () => openPrint(c) },
                        { label: "Editar", icon: <Pencil className="h-3.5 w-3.5" />, onClick: () => openEdit(c) },
                        ...(c.status === "ativo" ? [
                          { label: "Encerrar contrato", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setStatusChangeTarget({ contract: c, newStatus: "encerrado" }), variant: "destructive" as const },
                          { label: "Cancelar contrato", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setStatusChangeTarget({ contract: c, newStatus: "cancelado" }), variant: "destructive" as const },
                        ] : []),
                        { label: "Excluir", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => openDelete(c), variant: "destructive" as const },
                      ]}
                    />
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
                  <Button size="sm" variant="outline" onClick={() => setStatusChangeTarget({ contract: viewContract, newStatus: "encerrado" })}>Encerrar contrato</Button>
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setStatusChangeTarget({ contract: viewContract, newStatus: "cancelado" })}>Cancelar contrato</Button>
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
        <DialogContent className="max-w-[98vw] w-full flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>Cronograma de pagamentos</DialogTitle>
                <DialogDescription>
                  Inq {managementContract?.tenants?.full_name} — R$ {managementContract ? formatMoney(managementContract.rent_value) : ""}/mês
                  {managementContract && managementContract.management_fee_percent > 0 && (
                    <> · Taxa: {managementContract.management_fee_percent}% · Repasse: R$ {formatMoney(managementContract.repasse_value)}</>
                  )}
                </DialogDescription>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {installments.some((i) => i.financial_status === "generated") && managementContract?.status === "ativo" && role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setReopenInstOpen(true)}
                  >
                    <RefreshCcw className="h-4 w-4" /> Reabrir pendentes
                  </Button>
                )}
                {installments.some((i) => i.financial_status === "pending") && managementContract?.status === "ativo" && (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => setGenerateCROpen(true)}
                  >
                    <DollarSign className="h-4 w-4" /> Gerar Contas a Receber
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={exportInstallmentsExcel}
                  disabled={loadingInst || installments.length === 0}
                >
                  <Download className="h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
          </DialogHeader>
          {(managementContract?.status === "encerrado" || managementContract?.status === "cancelado") && (
            <div className="shrink-0 mx-0 mb-2 rounded-lg bg-muted/50 border border-border/50 px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Eye className="h-4 w-4 shrink-0" />
              Contrato <strong className="text-foreground">{managementContract.status === "encerrado" ? "encerrado" : "cancelado"}</strong> — somente visualização. Não é possível registrar pagamentos ou editar valores.
            </div>
          )}
          <div className="overflow-auto flex-1">
            {loadingInst ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="whitespace-nowrap">Competência</TableHead>
                    <TableHead className="whitespace-nowrap">Vencimento</TableHead>
                    <TableHead className="whitespace-nowrap w-px">Situação</TableHead>
                    <TableHead className="whitespace-nowrap w-px">Financeiro</TableHead>
                    <TableHead className="whitespace-nowrap">Pagamento</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Valor do aluguel</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Tx. Adm %</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Valor Tx. Adm</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Base IR</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Alíquota IR</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Dedução IR</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Valor IR</TableHead>
                    <TableHead className="whitespace-nowrap text-right font-semibold">Repasse ao proprietário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installments.map((inst) => {
                    const resolvedStatus = resolveInstStatus(inst);
                    const financialStatus = inst.financial_status ?? "pending";
                    const isEditing = editingInstValue[inst.id] !== undefined;
                    const feeP = inst.management_fee_percent ?? 0;
                    const feeV = inst.management_fee_value ?? (inst.value * feeP / 100);
                    const taxBase = inst.tax_base_value ?? (inst.value - feeV);
                    const irrfV = inst.irrf_value ?? 0;
                    const ownerNet = inst.owner_net_value ?? inst.repasse_value ?? (taxBase - irrfV);
                    const contractReadOnly = managementContract?.status === "encerrado" || managementContract?.status === "cancelado";
                    // Block editing if financial status is generated or paid
                    const instFinancialLocked = financialStatus === "generated" || financialStatus === "paid";
                    return (
                      <TableRow key={inst.id} className={`border-border/40 ${contractReadOnly ? "opacity-80" : ""}`}>
                        {/* Competência */}
                        <TableCell className="font-mono text-sm whitespace-nowrap">{inst.competence}</TableCell>

                        {/* Vencimento */}
                        <TableCell className="text-sm whitespace-nowrap">{format(parseISO(inst.due_date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>

                        {/* Situação (legacy status dot) */}
                        <TableCell className="w-px whitespace-nowrap">
                          <StatusDot status={resolvedStatus} />
                        </TableCell>

                        {/* Financial Status Badge */}
                        <TableCell className="w-px whitespace-nowrap">
                          <FinancialStatusBadge status={financialStatus} />
                        </TableCell>

                        {/* Pagamento - read only, filled by baixa */}
                        <TableCell className="whitespace-nowrap">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {inst.paid_at ? format(parseISO(inst.paid_at + "T00:00:00"), "dd/MM/yyyy") : "—"}
                          </span>
                        </TableCell>

                        {/* Valor do aluguel */}
                        <TableCell className="font-mono text-sm text-right whitespace-nowrap">
                          {!contractReadOnly && !instFinancialLocked && isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
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
                              className={!contractReadOnly && !instFinancialLocked ? "cursor-pointer hover:text-primary transition-colors" : ""}
                              title={!contractReadOnly && !instFinancialLocked ? "Clique para editar" : ""}
                              onClick={() => !contractReadOnly && !instFinancialLocked && setEditingInstValue((p) => ({ ...p, [inst.id]: formatMoney(inst.value) }))}
                            >
                              R$ {formatMoney(inst.value)}
                            </span>
                          )}
                        </TableCell>

                        {/* Tx. Adm % */}
                        <TableCell className="font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                          {feeP.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%
                        </TableCell>

                        {/* Valor Tx. Adm */}
                        <TableCell className="font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                          R$ {formatMoney(feeV)}
                        </TableCell>

                        {/* Base IR */}
                        <TableCell className="font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                          R$ {formatMoney(taxBase)}
                        </TableCell>

                        {/* Alíquota IR */}
                        <TableCell className="font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                          {inst.ir_rate != null ? `${inst.ir_rate.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%` : <span>—</span>}
                        </TableCell>

                        {/* Dedução IR */}
                        <TableCell className="font-mono text-xs text-muted-foreground text-right whitespace-nowrap">
                          {inst.ir_deduction != null ? `R$ ${formatMoney(inst.ir_deduction)}` : <span>—</span>}
                        </TableCell>

                        {/* Valor IR (IRRF) com tooltip */}
                        <TableCell className="font-mono text-xs text-right whitespace-nowrap">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={irrfV > 0 ? "text-destructive/80 cursor-help underline decoration-dotted" : "text-muted-foreground cursor-default"}>
                                  {irrfV > 0 ? `R$ ${formatMoney(irrfV)}` : "—"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[260px] text-xs space-y-1 p-3">
                                <p className="font-semibold text-foreground mb-1">Detalhamento do IRRF</p>
                                <p>Base IR: <span className="font-mono">R$ {formatMoney(taxBase)}</span></p>
                                <p>Alíquota: <span className="font-mono">{inst.ir_rate != null ? `${inst.ir_rate}%` : "—"}</span></p>
                                <p>Dedução: <span className="font-mono">{inst.ir_deduction != null ? `R$ ${formatMoney(inst.ir_deduction)}` : "—"}</span></p>
                                <p className="text-muted-foreground pt-1 border-t border-border/40">
                                  ({formatMoney(taxBase)} × {inst.ir_rate ?? 0}%) − R$ {formatMoney(inst.ir_deduction ?? 0)}
                                </p>
                                <p className="font-semibold text-foreground">= R$ {formatMoney(irrfV)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>

                        {/* Repasse ao proprietário */}
                        <TableCell className="font-mono text-sm font-semibold text-right whitespace-nowrap">
                          R$ {formatMoney(ownerNet)}
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

      {/* Generate Contas a Receber Confirmation Dialog */}
      <AlertDialog open={generateCROpen} onOpenChange={setGenerateCROpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Gerar Contas a Receber
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>Você está prestes a gerar os títulos de Contas a Receber para todas as parcelas pendentes deste contrato.</p>
                <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1">
                  <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">Após gerar os títulos:</p>
                  <p className="flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> As parcelas ficarão travadas para edição</p>
                  <p className="flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> O controle de pagamento será feito pelo módulo financeiro</p>
                </div>
                <p className="text-muted-foreground">Parcelas pendentes: <strong className="text-foreground">{installments.filter((i) => i.financial_status === "pending").length}</strong></p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateCR} disabled={generatingCR}>
              {generatingCR ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar geração"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Installments Confirmation Dialog */}
      <AlertDialog open={reopenInstOpen} onOpenChange={setReopenInstOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-primary" />
              Reabrir parcelas pendentes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>Esta operação irá remover os títulos de contas a receber das parcelas que ainda não foram pagas.</p>
                <div className="rounded-lg bg-muted/50 border border-border/50 p-3 space-y-1">
                  <p className="flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> Parcelas com CR gerado serão reabertas para edição</p>
                  <p className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Parcelas já pagas serão preservadas</p>
                </div>
                <p className="text-muted-foreground">Parcelas a reabrir: <strong className="text-foreground">{installments.filter((i) => i.financial_status === "generated").length}</strong></p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReopenInst} disabled={reopeningInst} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {reopeningInst ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



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

      {/* Print / Generate Document Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimir Contrato</DialogTitle>
            <DialogDescription>
              Selecione um modelo de documento para gerar o contrato de{" "}
              <strong>{printContract?.tenants?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {loadingTemplates ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm text-muted-foreground text-center">
                Nenhum modelo cadastrado. Acesse{" "}
                <a href="/documentos/modelos" className="text-primary underline">Documentos → Modelos</a>{" "}
                para criar um modelo.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Escolha o modelo</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        selectedTemplateId === t.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-sm font-medium">{t.nome_modelo}</p>
                      {t.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t.descricao}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleGenerateDocument}
              disabled={!selectedTemplateId || generating}
              className="gap-2"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Gerar documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={!!statusChangeTarget} onOpenChange={(open) => { if (!open) setStatusChangeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChangeTarget?.newStatus === "encerrado" ? "Encerrar contrato" : "Cancelar contrato"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja{" "}
              <strong>{statusChangeTarget?.newStatus === "encerrado" ? "encerrar" : "cancelar"}</strong> o contrato de{" "}
              <strong>{statusChangeTarget?.contract.tenants?.full_name}</strong>?
              <br />
              O imóvel <strong>{statusChangeTarget?.contract.properties?.code}</strong> será automaticamente marcado como <strong>disponível</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (statusChangeTarget) handleChangeStatus(statusChangeTarget.contract, statusChangeTarget.newStatus); }}
            >
              {statusChangeTarget?.newStatus === "encerrado" ? "Encerrar" : "Cancelar contrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
