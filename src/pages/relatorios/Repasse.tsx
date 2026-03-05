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
  repasse_value: number;
  status: string;
  paid_at: string | null;
  tenant_name: string;
  property_code: string;
  property_address: string;
  owner_name: string;
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
        id, competence, due_date, value, management_fee_percent, management_fee_value, repasse_value, status, paid_at,
        rental_contracts(
          tenant_id, tenants(full_name),
          property_id, properties(code, address, clients(full_name))
        )
      `)
      .order("due_date");

    const mapped: InstRow[] = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      competence: r.competence,
      due_date: r.due_date,
      value: r.value,
      management_fee_percent: r.management_fee_percent ?? 0,
      management_fee_value: r.management_fee_value ?? (r.value * (r.management_fee_percent ?? 0) / 100),
      repasse_value: r.repasse_value ?? (r.value - r.value * (r.management_fee_percent ?? 0) / 100),
      status: r.status,
      paid_at: r.paid_at,
      tenant_name: r.rental_contracts?.tenants?.full_name ?? "—",
      property_code: r.rental_contracts?.properties?.code ?? "—",
      property_address: r.rental_contracts?.properties?.address ?? "—",
      owner_name: r.rental_contracts?.properties?.clients?.full_name ?? "—",
    }));
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
      return matchQ && matchStatus && matchComp;
    });
  }, [rows, search, statusFilter, competenceFilter]);

  const totals = useMemo(() => ({
    value: filtered.reduce((s, r) => s + r.value, 0),
    fee: filtered.reduce((s, r) => s + r.management_fee_value, 0),
    repasse: filtered.reduce((s, r) => s + r.repasse_value, 0),
  }), [filtered]);

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    const exportData = filtered.map((r) => ({
      "Competência": r.competence,
      "Vencimento": format(parseISO(r.due_date + "T00:00:00"), "dd/MM/yyyy"),
      "Inquilino": r.tenant_name,
      "Imóvel": r.property_code,
      "Endereço": r.property_address,
      "Proprietário": r.owner_name,
      "Valor Aluguel": r.value,
      "Taxa Admin (%)": r.management_fee_percent,
      "Valor Admin": r.management_fee_value,
      "Repasse": r.repasse_value,
      "Status": INST_LABELS[resolveStatus(r)] ?? r.status,
      "Data Pagamento": r.paid_at ? format(parseISO(r.paid_at + "T00:00:00"), "dd/MM/yyyy") : "",
    }));
    // Add totals row
    exportData.push({
      "Competência": "TOTAL",
      "Vencimento": "",
      "Inquilino": "",
      "Imóvel": "",
      "Endereço": "",
      "Proprietário": "",
      "Valor Aluguel": totals.value,
      "Taxa Admin (%)": 0,
      "Valor Admin": totals.fee,
      "Repasse": totals.repasse,
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
            <p className="text-sm text-muted-foreground mt-0.5">Cronograma de parcelas com valores de administração e repasse ao proprietário.</p>
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
            <Input placeholder="Buscar por inquilino, imóvel, proprietário..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Input placeholder="Filtrar competência (ex: 05/2026)" value={competenceFilter} onChange={(e) => setCompetenceFilter(e.target.value)} className="w-full sm:w-52" />
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
                <TableHead>Inquilino</TableHead>
                <TableHead className="hidden md:table-cell">Imóvel</TableHead>
                <TableHead className="hidden lg:table-cell">Proprietário</TableHead>
                <TableHead className="text-right">Aluguel</TableHead>
                <TableHead className="text-right hidden md:table-cell">Taxa Admin</TableHead>
                <TableHead className="text-right">Repasse</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">Nenhum registro encontrado.</TableCell></TableRow>
              ) : filtered.map((r) => {
                const rs = resolveStatus(r);
                return (
                  <TableRow key={r.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono text-sm">{r.competence}</TableCell>
                    <TableCell className="text-sm">{format(parseISO(r.due_date + "T00:00:00"), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium text-sm">{r.tenant_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{r.property_code}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{r.owner_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">R$ {fm(r.value)}</TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell text-muted-foreground">
                      R$ {fm(r.management_fee_value)} <span className="text-xs">({r.management_fee_percent}%)</span>
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
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Aluguel", value: totals.value, accent: false },
            { label: "Total Taxa Admin", value: totals.fee, accent: false },
            { label: "Total Repasse", value: totals.repasse, accent: true },
          ].map((item) => (
            <div key={item.label} className={`card-premium rounded-xl p-4 border ${item.accent ? "border-primary/40 bg-primary/5" : "border-border/40"}`}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className={`text-xl font-bold font-mono mt-1 ${item.accent ? "text-primary" : "text-foreground"}`}>R$ {fm(item.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} parcela(s)</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
