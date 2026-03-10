import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Printer, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";

interface InstRow {
  id: string;
  competence: string;
  due_date: string;
  value: number;
  management_fee_percent: number;
  management_fee_value: number;
  tax_base_value: number;
  irrf_value: number;
  owner_net_value: number;
  repasse_value: number;
  status: string;
  paid_at: string | null;
  tenant_name: string;
  property_code: string;
  property_address: string;
  owner_name: string;
  owner_person_type: string;
}

const INST_LABELS: Record<string, string> = {
  em_aberto: "Em aberto",
  pago: "Pago",
  atrasado: "Atrasado",
};

const INST_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  em_aberto: "outline",
  pago: "default",
  atrasado: "destructive",
};

function fm(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Repasse() {
  const { company } = useAuth();
  const [rows, setRows] = useState<InstRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState("todos");
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const resolveStatus = (row: InstRow) => {
    if (row.status === "pago") return "pago";
    const due = new Date(row.due_date + "T00:00:00");
    if (due < today) return "atrasado";
    return "em_aberto";
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rental_installments")
      .select(`
        id, competence, due_date, value,
        management_fee_percent, management_fee_value,
        tax_base_value, irrf_value, owner_net_value, repasse_value,
        status, paid_at,
        rental_contracts(
          tenant_id, tenants(full_name),
          property_id, properties(code, address, clients(full_name, person_type))
        )
      `)
      .order("due_date");

    const mapped: InstRow[] = ((data ?? []) as any[]).map((r) => {
      const feeP = r.management_fee_percent ?? 0;
      const feeV = r.management_fee_value ?? (r.value * feeP / 100);
      const taxBase = r.tax_base_value ?? (r.value - feeV);
      const irrfV = r.irrf_value ?? 0;
      const ownerNet = r.owner_net_value ?? r.repasse_value ?? (taxBase - irrfV);
      return {
        id: r.id,
        competence: r.competence,
        due_date: r.due_date,
        value: r.value,
        management_fee_percent: feeP,
        management_fee_value: feeV,
        tax_base_value: taxBase,
        irrf_value: irrfV,
        owner_net_value: ownerNet,
        repasse_value: ownerNet,
        status: r.status,
        paid_at: r.paid_at,
        tenant_name: r.rental_contracts?.tenants?.full_name ?? "—",
        property_code: r.rental_contracts?.properties?.code ?? "—",
        property_address: r.rental_contracts?.properties?.address ?? "—",
        owner_name: r.rental_contracts?.properties?.clients?.full_name ?? "—",
        owner_person_type: r.rental_contracts?.properties?.clients?.person_type ?? "fisica",
      };
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, [company?.id]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const rs = resolveStatus(r);
      const q = search.toLowerCase();
      const matchQ =
        r.tenant_name.toLowerCase().includes(q) ||
        r.property_code.toLowerCase().includes(q) ||
        r.owner_name.toLowerCase().includes(q) ||
        r.competence.includes(q) ||
        (r.property_address ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "todos" || rs === statusFilter;
      const matchComp = !competenceFilter || r.competence.includes(competenceFilter);
      const matchOwnerType = ownerTypeFilter === "todos" || r.owner_person_type === ownerTypeFilter;
      return matchQ && matchStatus && matchComp && matchOwnerType;
    });
  }, [rows, search, statusFilter, competenceFilter, ownerTypeFilter]);

  const totals = useMemo(() => ({
    value: filtered.reduce((s, r) => s + r.value, 0),
    fee: filtered.reduce((s, r) => s + r.management_fee_value, 0),
    irrf: filtered.reduce((s, r) => s + r.irrf_value, 0),
    repasse: filtered.reduce((s, r) => s + r.repasse_value, 0),
  }), [filtered]);

  const handlePrint = () => window.print();

  const handleExcel = () => {
    const exportData = filtered.map((r) => ({
      "Competência": r.competence,
      "Vencimento": format(parseISO(r.due_date + "T00:00:00"), "dd/MM/yyyy"),
      "Locatário": r.tenant_name,
      "Imóvel": r.property_code,
      "Endereço": r.property_address,
      "Locador": r.owner_name,
      "Tipo Locador": r.owner_person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica",
      "Valor Aluguel": r.value,
      "Taxa Admin (%)": r.management_fee_percent,
      "Valor Admin (R$)": r.management_fee_value,
      "Base IR (R$)": r.tax_base_value,
      "IRRF (R$)": r.irrf_value,
      "Repasse Líquido (R$)": r.repasse_value,
      "Status": INST_LABELS[resolveStatus(r)] ?? r.status,
      "Data Pagamento": r.paid_at ? format(parseISO(r.paid_at + "T00:00:00"), "dd/MM/yyyy") : "",
    }));
    exportData.push({
      "Competência": "TOTAL",
      "Vencimento": "",
      "Locatário": "",
      "Imóvel": "",
      "Endereço": "",
      "Locador": "",
      "Tipo Locador": "",
      "Valor Aluguel": totals.value,
      "Taxa Admin (%)": 0,
      "Valor Admin (R$)": totals.fee,
      "Base IR (R$)": 0,
      "IRRF (R$)": totals.irrf,
      "Repasse Líquido (R$)": totals.repasse,
      "Status": "",
      "Data Pagamento": "",
    } as any);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Repasse");
    XLSX.writeFile(wb, `repasse_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" ref={printRef}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Relatório de Repasse</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cronograma de parcelas com taxa de administração, IRRF e repasse líquido ao proprietário.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" className="gap-2" onClick={handlePrint}><Printer className="h-4 w-4" /> Imprimir</Button>
            <Button variant="outline" className="gap-2" onClick={handleExcel}><Download className="h-4 w-4" /> Excel</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por locatário, imóvel, locador..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Input placeholder="Competência (ex: 05/2026)" value={competenceFilter} onChange={(e) => setCompetenceFilter(e.target.value)} className="w-full sm:w-48" />
          <Select value={ownerTypeFilter} onValueChange={setOwnerTypeFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Tipo locador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os locadores</SelectItem>
              <SelectItem value="fisica">Pessoa Física (c/ IR)</SelectItem>
              <SelectItem value="juridica">Pessoa Jurídica (s/ IR)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="em_aberto">Em aberto</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="atrasado">Atrasado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead>Competência</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Locatário</TableHead>
                <TableHead className="hidden md:table-cell">Imóvel</TableHead>
                <TableHead className="hidden lg:table-cell">Locador</TableHead>
                <TableHead className="text-right">Aluguel</TableHead>
                <TableHead className="text-right hidden md:table-cell">Taxa Admin</TableHead>
                <TableHead className="text-right hidden lg:table-cell">Base IR</TableHead>
                <TableHead className="text-right hidden lg:table-cell">IRRF</TableHead>
                <TableHead className="text-right font-semibold">Repasse Líquido</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-sm">Nenhum registro encontrado.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const rs = resolveStatus(r);
                const hasIrrf = r.irrf_value > 0;
                return (
                  <TableRow key={r.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-sm">{r.competence}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{format(parseISO(r.due_date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium text-sm">{r.tenant_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{r.property_code}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">{r.owner_name}</span>
                        <span className="text-xs text-muted-foreground/60">{r.owner_person_type === "fisica" ? "PF" : "PJ"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">R$ {fm(r.value)}</TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell text-muted-foreground">
                      R$ {fm(r.management_fee_value)}{" "}
                      <span className="text-xs">({r.management_fee_percent}%)</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm hidden lg:table-cell text-muted-foreground">
                      R$ {fm(r.tax_base_value)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm hidden lg:table-cell">
                      {hasIrrf
                        ? <span className="text-destructive/80">R$ {fm(r.irrf_value)}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">R$ {fm(r.repasse_value)}</TableCell>
                    <TableCell><Badge variant={INST_COLORS[rs] ?? "outline"} className="text-xs">{INST_LABELS[rs] ?? rs}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Aluguel", value: totals.value, accent: false, sub: `${filtered.length} parcela(s)` },
            { label: "Total Taxa Admin", value: totals.fee, accent: false, sub: "Administração imobiliária" },
            { label: "Total IRRF Retido", value: totals.irrf, accent: false, sub: "Apenas locadores PF", highlight: totals.irrf > 0 },
            { label: "Total Repasse Líquido", value: totals.repasse, accent: true, sub: "Valor ao proprietário" },
          ].map((item) => (
            <div
              key={item.label}
              className={`card-premium rounded-xl p-4 border ${
                item.accent
                  ? "border-primary/40 bg-primary/5"
                  : (item as any).highlight
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border/40"
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className={`text-xl font-bold font-mono mt-1 ${
                item.accent ? "text-primary" : (item as any).highlight && totals.irrf > 0 ? "text-destructive/80" : "text-foreground"
              }`}>
                R$ {fm(item.value)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
