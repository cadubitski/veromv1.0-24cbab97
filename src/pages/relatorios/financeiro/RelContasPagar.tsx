import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { Printer, FileDown, Search, X, Clock, CheckCircle2, DollarSign } from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const ALL_COLUMNS: ColumnDef[] = [
  { key: "document_number", label: "Nº Documento", defaultVisible: true },
  { key: "issue_date", label: "Data Emissão", defaultVisible: true },
  { key: "due_date", label: "Vencimento", defaultVisible: true },
  { key: "description", label: "Descrição", defaultVisible: true },
  { key: "vendor", label: "Fornecedor / Proprietário", defaultVisible: true },
  { key: "amount", label: "Valor (R$)", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "source_type", label: "Origem", defaultVisible: true },
  { key: "paid_at", label: "Data Pagamento", defaultVisible: false },
  { key: "bank_account", label: "Conta Bancária", defaultVisible: false },
  { key: "contract_id", label: "ID Contrato", defaultVisible: false },
  { key: "installment_id", label: "ID Parcela", defaultVisible: false },
  { key: "created_at", label: "Criado em", defaultVisible: false },
  { key: "id", label: "ID Registro", defaultVisible: false },
];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  paid: { label: "Pago", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  overdue: { label: "Vencido", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  aluguel: "Aluguel",
  owner_transfer: "Repasse Proprietário",
};

const fmtDate = (d: string | null) => { if (!d) return "-"; try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; } };
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelContasPagar() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [dateFromIssue, setDateFromIssue] = useState("");
  const [dateToIssue, setDateToIssue] = useState("");
  const [dateFromDue, setDateFromDue] = useState("");
  const [dateToDue, setDateToDue] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterVendor, setFilterVendor] = useState("");
  const [filterDoc, setFilterDoc] = useState("");
  const [filterDesc, setFilterDesc] = useState("");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const { data: rawData = [], isFetching } = useQuery({
    queryKey: ["rel_contas_pagar", companyId, dateFromIssue, dateToIssue, dateFromDue, dateToDue],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase.from("accounts_payable")
        .select("*, clients(full_name), bank_accounts(account_name)")
        .eq("company_id", companyId!);
      if (dateFromIssue) q = q.gte("issue_date", dateFromIssue);
      if (dateToIssue) q = q.lte("issue_date", dateToIssue);
      if (dateFromDue) q = q.gte("due_date", dateFromDue);
      if (dateToDue) q = q.lte("due_date", dateToDue);
      q = q.order("due_date", { ascending: false });
      const { data } = await q;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return rawData.filter((t: any) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterSource !== "all" && t.source_type !== filterSource) return false;
      if (filterVendor && !t.clients?.full_name?.toLowerCase().includes(filterVendor.toLowerCase())) return false;
      if (filterDoc && !t.document_number?.toLowerCase().includes(filterDoc.toLowerCase())) return false;
      if (filterDesc && !t.description?.toLowerCase().includes(filterDesc.toLowerCase())) return false;
      return true;
    });
  }, [rawData, filterStatus, filterSource, filterVendor, filterDoc, filterDesc]);

  const totalPending = filtered.filter((t: any) => t.status === "pending").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalPaid = filtered.filter((t: any) => t.status === "paid").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalAll = filtered.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const getCell = (t: any, key: string) => {
    switch (key) {
      case "document_number": return t.document_number ?? "-";
      case "issue_date": return fmtDate(t.issue_date);
      case "due_date": return fmtDate(t.due_date);
      case "description": return t.description ?? "-";
      case "vendor": return t.clients?.full_name ?? "-";
      case "amount": return fmtMoney(Number(t.amount));
      case "status": return STATUS_LABELS[t.status]?.label ?? t.status;
      case "source_type": return SOURCE_LABELS[t.source_type] ?? t.source_type;
      case "paid_at": return fmtDate(t.paid_at);
      case "bank_account": return t.bank_accounts?.account_name ?? "-";
      case "contract_id": return t.contract_id ?? "-";
      case "installment_id": return t.installment_id ?? "-";
      case "created_at": return fmtDate(t.created_at);
      case "id": return t.id ?? "-";
      default: return "-";
    }
  };

  const handleExcel = () => {
    const cols = ALL_COLUMNS.filter((c) => visibleCols.has(c.key));
    const rows = filtered.map((t: any) => {
      const row: Record<string, any> = {};
      cols.forEach((c) => { row[c.label] = getCell(t, c.key); });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas-pagar-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const clearFilters = () => {
    setDateFromIssue(""); setDateToIssue(""); setDateFromDue(""); setDateToDue("");
    setFilterStatus("all"); setFilterSource("all"); setFilterVendor(""); setFilterDoc(""); setFilterDesc("");
  };

  const hasFilters = dateFromIssue || dateToIssue || dateFromDue || dateToDue || filterStatus !== "all" || filterSource !== "all" || filterVendor || filterDoc || filterDesc;

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatório de Contas a Pagar</h1>
            <p className="text-sm text-muted-foreground mt-1">Visão completa dos títulos a pagar com auditoria detalhada</p>
          </div>
          <div className="flex items-center gap-2">
            <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            <Button variant="outline" size="sm" onClick={handleExcel}><FileDown className="h-4 w-4 mr-1.5" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Imprimir</Button>
          </div>
        </div>

        <div className="hidden print:block text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold">Relatório de Contas a Pagar</h1>
          <p className="text-sm text-muted-foreground">Emitido em {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>

        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Search className="h-4 w-4" />Filtros</CardTitle>
              {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" />Limpar</Button>}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Emissão Inicial</Label>
              <Input type="date" value={dateFromIssue} onChange={(e) => setDateFromIssue(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Emissão Final</Label>
              <Input type="date" value={dateToIssue} onChange={(e) => setDateToIssue(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento Inicial</Label>
              <Input type="date" value={dateFromDue} onChange={(e) => setDateFromDue(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento Final</Label>
              <Input type="date" value={dateToDue} onChange={(e) => setDateToDue(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([v, { label }]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origem</Label>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fornecedor / Proprietário</Label>
              <Input placeholder="Buscar..." value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº Documento</Label>
              <Input placeholder="Buscar..." value={filterDoc} onChange={(e) => setFilterDoc(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Buscar na descrição..." value={filterDesc} onChange={(e) => setFilterDesc(e.target.value)} className="h-8 text-sm" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">A Pagar</p><p className="text-xl font-bold text-amber-600 dark:text-amber-400">{fmtMoney(totalPending)}</p></div>
                <Clock className="h-8 w-8 text-amber-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Pago</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalPaid)}</p></div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Total Geral</p><p className="text-xl font-bold text-primary">{fmtMoney(totalAll)}</p></div>
                <DollarSign className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{filtered.length} registro(s) encontrado(s)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr><td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">Nenhum título encontrado.</td></tr>
                  ) : (
                    filtered.map((t: any, idx: number) => (
                      <tr key={t.id} className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                          <td key={c.key} className="px-4 py-2.5 align-middle whitespace-nowrap">
                            {c.key === "status" ? (
                              <Badge variant="outline" className={`text-xs ${STATUS_LABELS[t.status]?.cls ?? ""}`}>{STATUS_LABELS[t.status]?.label ?? t.status}</Badge>
                            ) : c.key === "amount" ? (
                              <span className="font-semibold text-foreground">{fmtMoney(Number(t.amount))}</span>
                            ) : (
                              <span className="text-foreground/90">{getCell(t, c.key)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c, i) => (
                        <td key={c.key} className="px-4 py-3 text-sm">
                          {i === 0 ? <span className="text-muted-foreground">TOTAL</span> : c.key === "amount" ? fmtMoney(totalAll) : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
