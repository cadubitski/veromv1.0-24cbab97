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
import { Printer, FileDown, Search, X, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const ALL_COLUMNS: ColumnDef[] = [
  { key: "transaction_date", label: "Data", defaultVisible: true },
  { key: "document_number", label: "Nº Documento", defaultVisible: true },
  { key: "type", label: "Tipo", defaultVisible: true },
  { key: "description", label: "Descrição", defaultVisible: true },
  { key: "amount", label: "Valor (R$)", defaultVisible: true },
  { key: "bank_account", label: "Conta Bancária", defaultVisible: true },
  { key: "origin_type", label: "Origem", defaultVisible: true },
  { key: "origin_id", label: "ID Origem", defaultVisible: false },
  { key: "created_at", label: "Criado em", defaultVisible: false },
];

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual",
  aluguel: "Aluguel",
  contas_receber: "Contas a Receber",
  contas_pagar: "Contas a Pagar",
};

const fmtDate = (d: string) => { try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; } };
const fmtDatetime = (d: string) => { try { return format(parseISO(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; } };
const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelMovimentacaoBancaria() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterOrigin, setFilterOrigin] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterDoc, setFilterDoc] = useState("");
  const [filterDesc, setFilterDesc] = useState("");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank_accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("id, account_name, bank_name").eq("company_id", companyId!).order("account_name");
      return data ?? [];
    },
  });

  const { data: rawTransactions = [], isFetching } = useQuery({
    queryKey: ["rel_mov_bancaria", companyId, dateFrom, dateTo],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase.from("bank_transactions").select("*, bank_accounts(account_name, bank_name, bank_code)").eq("company_id", companyId!);
      if (dateFrom) q = q.gte("transaction_date", dateFrom);
      if (dateTo) q = q.lte("transaction_date", dateTo);
      q = q.order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
      const { data } = await q;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    return rawTransactions.filter((t: any) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterOrigin !== "all" && t.origin_type !== filterOrigin) return false;
      if (filterAccount !== "all" && t.bank_account_id !== filterAccount) return false;
      if (filterDoc && !t.document_number?.toLowerCase().includes(filterDoc.toLowerCase())) return false;
      if (filterDesc && !t.description?.toLowerCase().includes(filterDesc.toLowerCase())) return false;
      return true;
    });
  }, [rawTransactions, filterType, filterOrigin, filterAccount, filterDoc, filterDesc]);

  const totalCredito = filtered.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalDebito = filtered.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const saldo = totalCredito - totalDebito;

  const getCell = (t: any, key: string) => {
    switch (key) {
      case "transaction_date": return fmtDate(t.transaction_date);
      case "document_number": return t.document_number ?? "-";
      case "type": return t.type === "credit" ? "Entrada" : "Saída";
      case "description": return t.description ?? "-";
      case "amount": return fmtMoney(Number(t.amount));
      case "bank_account": return t.bank_accounts ? `${t.bank_accounts.account_name} – ${t.bank_accounts.bank_name}` : "-";
      case "origin_type": return ORIGIN_LABELS[t.origin_type] ?? t.origin_type;
      case "origin_id": return t.origin_id ?? "-";
      case "created_at": return fmtDatetime(t.created_at);
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
    rows.push({});
    const summaryRow: Record<string, any> = {};
    cols.forEach((c, i) => {
      if (i === 0) summaryRow[c.label] = "TOTAIS";
      else if (c.key === "amount") summaryRow[c.label] = "";
      else summaryRow[c.label] = "";
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimentação");
    XLSX.writeFile(wb, `movimentacao-bancaria-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handlePrint = () => window.print();

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setFilterType("all"); setFilterOrigin("all");
    setFilterAccount("all"); setFilterDoc(""); setFilterDesc("");
  };

  const hasFilters = dateFrom || dateTo || filterType !== "all" || filterOrigin !== "all" || filterAccount !== "all" || filterDoc || filterDesc;

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatório de Movimentação Bancária</h1>
            <p className="text-sm text-muted-foreground mt-1">Auditoria completa de todas as movimentações financeiras</p>
          </div>
          <div className="flex items-center gap-2">
            <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            <Button variant="outline" size="sm" onClick={handleExcel}><FileDown className="h-4 w-4 mr-1.5" />Excel</Button>
            <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="h-4 w-4 mr-1.5" />Imprimir</Button>
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold">Relatório de Movimentação Bancária</h1>
          <p className="text-sm text-muted-foreground">Emitido em {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Search className="h-4 w-4" />Filtros</CardTitle>
              {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-3.5 w-3.5 mr-1" />Limpar</Button>}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Data Inicial</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Final</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="credit">Entrada</SelectItem>
                  <SelectItem value="debit">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Origem</Label>
              <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {Object.entries(ORIGIN_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Label className="text-xs">Nº Documento</Label>
              <Input placeholder="Buscar..." value={filterDoc} onChange={(e) => setFilterDoc(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Buscar na descrição..." value={filterDesc} onChange={(e) => setFilterDesc(e.target.value)} className="h-8 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Entradas</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalCredito)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Saídas</p>
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{fmtMoney(totalDebito)}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-rose-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${saldo >= 0 ? "border-l-primary" : "border-l-amber-500"}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo Período</p>
                  <p className={`text-xl font-bold ${saldo >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>{fmtMoney(saldo)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">{filtered.length} registro(s) encontrado(s)</CardTitle>
          </CardHeader>
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
                    <tr><td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">Nenhuma movimentação encontrada com os filtros aplicados.</td></tr>
                  ) : (
                    filtered.map((t: any, idx: number) => (
                      <tr key={t.id} className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                          <td key={c.key} className="px-4 py-2.5 align-middle whitespace-nowrap">
                            {c.key === "type" ? (
                              <Badge variant={t.type === "credit" ? "default" : "destructive"} className={`text-xs ${t.type === "credit" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"}`}>
                                {t.type === "credit" ? "Entrada" : "Saída"}
                              </Badge>
                            ) : c.key === "amount" ? (
                              <span className={`font-semibold ${t.type === "credit" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {t.type === "debit" ? "-" : "+"}{fmtMoney(Number(t.amount))}
                              </span>
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
                          {i === 0 ? <span className="text-muted-foreground">TOTAIS</span>
                            : c.key === "amount" ? (
                              <span className="text-foreground">{fmtMoney(totalCredito - totalDebito)}</span>
                            ) : ""}
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
