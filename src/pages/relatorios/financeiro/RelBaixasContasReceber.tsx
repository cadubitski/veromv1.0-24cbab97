import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { Printer, FileDown, Search, X, CheckCircle2, DollarSign, Hash } from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const ALL_COLUMNS: ColumnDef[] = [
  { key: "document_number", label: "Nº Documento", defaultVisible: true },
  { key: "paid_at", label: "Data Pagamento", defaultVisible: true },
  { key: "due_date", label: "Vencimento", defaultVisible: true },
  { key: "description", label: "Descrição", defaultVisible: true },
  { key: "client", label: "Cliente/Locatário", defaultVisible: true },
  { key: "amount", label: "Valor (R$)", defaultVisible: true },
  { key: "bank_account", label: "Conta Bancária", defaultVisible: true },
  { key: "source_type", label: "Origem", defaultVisible: true },
  { key: "issue_date", label: "Data Emissão", defaultVisible: false },
  { key: "bank_transaction_id", label: "ID Mov. Bancária", defaultVisible: false },
  { key: "contract_id", label: "ID Contrato", defaultVisible: false },
  { key: "installment_id", label: "ID Parcela", defaultVisible: false },
  { key: "id", label: "ID Registro", defaultVisible: false },
];

const SOURCE_LABELS: Record<string, string> = { manual: "Manual", aluguel: "Aluguel" };
const fmtDate = (d: string | null) => { if (!d) return "-"; try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; } };
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelBaixasContasReceber() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [dateFromPaid, setDateFromPaid] = useState("");
  const [dateToPaid, setDateToPaid] = useState("");
  const [dateFromDue, setDateFromDue] = useState("");
  const [dateToDue, setDateToDue] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [filterClient, setFilterClient] = useState("");
  const [filterDoc, setFilterDoc] = useState("");
  const [filterAccount, setFilterAccount] = useState("all");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id, account_name").eq("company_id", companyId!).order("account_name");
      return data ?? [];
    },
  });

  const { data: rawData = [], isFetching } = useQuery({
    queryKey: ["rel_baixas_receber", companyId, dateFromPaid, dateToPaid, dateFromDue, dateToDue],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase.from("accounts_receivable")
        .select("*, tenants(full_name), bank_accounts(account_name)")
        .eq("company_id", companyId!)
        .eq("status", "paid")
        .not("paid_at", "is", null);
      if (dateFromPaid) q = q.gte("paid_at", dateFromPaid);
      if (dateToPaid) q = q.lte("paid_at", dateToPaid);
      if (dateFromDue) q = q.gte("due_date", dateFromDue);
      if (dateToDue) q = q.lte("due_date", dateToDue);
      q = q.order("paid_at", { ascending: false });
      const { data } = await q;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return rawData.filter((t: any) => {
      if (filterSource !== "all" && t.source_type !== filterSource) return false;
      if (filterClient && !t.tenants?.full_name?.toLowerCase().includes(filterClient.toLowerCase())) return false;
      if (filterDoc && !t.document_number?.toLowerCase().includes(filterDoc.toLowerCase())) return false;
      if (filterAccount !== "all" && t.bank_account_id !== filterAccount) return false;
      return true;
    });
  }, [rawData, filterSource, filterClient, filterDoc, filterAccount]);

  const totalBaixas = filtered.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const getCell = (t: any, key: string) => {
    switch (key) {
      case "document_number": return t.document_number ?? "-";
      case "paid_at": return fmtDate(t.paid_at);
      case "due_date": return fmtDate(t.due_date);
      case "description": return t.description ?? "-";
      case "client": return t.tenants?.full_name ?? "-";
      case "amount": return fmtMoney(Number(t.amount));
      case "bank_account": return t.bank_accounts?.account_name ?? "-";
      case "source_type": return SOURCE_LABELS[t.source_type] ?? t.source_type;
      case "issue_date": return fmtDate(t.issue_date);
      case "bank_transaction_id": return t.bank_transaction_id ?? "-";
      case "contract_id": return t.contract_id ?? "-";
      case "installment_id": return t.installment_id ?? "-";
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
    XLSX.utils.book_append_sheet(wb, ws, "Baixas CR");
    XLSX.writeFile(wb, `baixas-contas-receber-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const clearFilters = () => {
    setDateFromPaid(""); setDateToPaid(""); setDateFromDue(""); setDateToDue("");
    setFilterSource("all"); setFilterClient(""); setFilterDoc(""); setFilterAccount("all");
  };

  const hasFilters = dateFromPaid || dateToPaid || dateFromDue || dateToDue || filterSource !== "all" || filterClient || filterDoc || filterAccount !== "all";

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Baixas de Contas a Receber</h1>
            <p className="text-sm text-muted-foreground mt-1">Relatório auditável de todos os recebimentos liquidados</p>
          </div>
          <div className="flex items-center gap-2">
            <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            <Button variant="outline" size="sm" onClick={handleExcel}><FileDown className="h-4 w-4 mr-1.5" />Excel</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Imprimir</Button>
          </div>
        </div>

        <div className="hidden print:block text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold">Baixas de Contas a Receber</h1>
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
              <Label className="text-xs">Pagamento Inicial</Label>
              <Input type="date" value={dateFromPaid} onChange={(e) => setDateFromPaid(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pagamento Final</Label>
              <Input type="date" value={dateToPaid} onChange={(e) => setDateToPaid(e.target.value)} className="h-8 text-sm" />
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
              <Label className="text-xs">Conta Bancária</Label>
              <Select value={filterAccount} onValueChange={setFilterAccount}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origem</Label>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="aluguel">Aluguel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cliente / Locatário</Label>
              <Input placeholder="Buscar..." value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nº Documento</Label>
              <Input placeholder="Buscar..." value={filterDoc} onChange={(e) => setFilterDoc(e.target.value)} className="h-8 text-sm" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Total Recebido</p><p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalBaixas)}</p></div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Média por Baixa</p><p className="text-xl font-bold text-primary">{filtered.length > 0 ? fmtMoney(totalBaixas / filtered.length) : fmtMoney(0)}</p></div>
                <DollarSign className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wide">Qtd. de Baixas</p><p className="text-xl font-bold text-blue-600 dark:text-blue-400">{filtered.length}</p></div>
                <Hash className="h-8 w-8 text-blue-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{filtered.length} baixa(s) encontrada(s)</CardTitle></CardHeader>
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
                    <tr><td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">Nenhuma baixa encontrada.</td></tr>
                  ) : (
                    filtered.map((t: any, idx: number) => (
                      <tr key={t.id} className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                          <td key={c.key} className="px-4 py-2.5 align-middle whitespace-nowrap">
                            {c.key === "amount" ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmtMoney(Number(t.amount))}</span>
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
                          {i === 0 ? <span className="text-muted-foreground">TOTAL</span> : c.key === "amount" ? <span className="text-emerald-600 dark:text-emerald-400">{fmtMoney(totalBaixas)}</span> : ""}
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
