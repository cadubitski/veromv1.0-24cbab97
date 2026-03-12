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
import { Badge } from "@/components/ui/badge";
import { Printer, FileDown, Search, X, TrendingUp, TrendingDown, DollarSign, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";

const fmtDate = (d: string | null) => {
  if (!d) return "-";
  try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; }
};
const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface StatementRow {
  contract_id: string;
  owner_id: string;
  owner_name: string;
  installment_id: string;
  event_date: string | null;
  description: string;
  entrada: number;
  saida: number;
  company_id: string;
  event_type: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "data",        label: "Data",             defaultVisible: true },
  { key: "proprietario",label: "Proprietário",     defaultVisible: true },
  { key: "descricao",   label: "Descrição",        defaultVisible: true },
  { key: "contrato",    label: "Contrato",         defaultVisible: true },
  { key: "entrada",     label: "Entrada",          defaultVisible: true },
  { key: "saida",       label: "Saída",            defaultVisible: true },
  { key: "saldo",       label: "Saldo Acumulado",  defaultVisible: true },
];

type SortKey = "data" | "proprietario" | "descricao" | "contrato" | "entrada" | "saida" | "saldo";
type SortDir = "asc" | "desc";

export default function RelContaCorrenteProprietario() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterContract, setFilterContract] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3 inline text-primary" />
      : <ArrowDown className="ml-1 h-3 w-3 inline text-primary" />;
  };

  // Buscar proprietários (clients)
  const { data: owners = [] } = useQuery({
    queryKey: ["clients_owners", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("company_id", companyId!)
        .eq("status", "ativo")
        .order("full_name");
      return data ?? [];
    },
  });

  // Buscar contratos
  const { data: contracts = [] } = useQuery({
    queryKey: ["rental_contracts_list", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("rental_contracts")
        .select("id, code, property_id, properties(client_id, clients(full_name))")
        .eq("company_id", companyId!)
        .order("code");
      return data ?? [];
    },
  });

  // Buscar dados
  const { data: rawRows = [], isFetching } = useQuery({
    queryKey: ["owner_statement", companyId, dateFrom, dateTo],
    enabled: !!companyId,
    queryFn: async () => {
      const q1 = supabase
        .from("rental_installments")
        .select(`
          id,
          owner_net_value,
          value,
          financial_status,
          contract_id,
          rental_contracts!inner(
            id,
            code,
            company_id,
            property_id,
            properties!inner(
              client_id,
              clients(full_name)
            )
          ),
          accounts_receivable!rental_installments_accounts_receivable_id_fkey(
            id,
            paid_at
          )
        `)
        .eq("rental_contracts.company_id", companyId!)
        .in("financial_status", ["paid", "repasse_generated", "repasse_paid"])
        .not("accounts_receivable_id", "is", null);

      const q2 = supabase
        .from("rental_installments")
        .select(`
          id,
          repasse_value,
          financial_status,
          contract_id,
          rental_contracts!inner(
            id,
            code,
            company_id,
            property_id,
            properties!inner(
              client_id,
              clients(full_name)
            )
          ),
          accounts_payable!rental_installments_repasse_accounts_payable_id_fkey(
            id,
            paid_at
          )
        `)
        .eq("rental_contracts.company_id", companyId!)
        .eq("financial_status", "repasse_paid")
        .not("repasse_accounts_payable_id", "is", null);

      const [{ data: inst1 }, { data: inst2 }] = await Promise.all([q1, q2]);

      const rows: StatementRow[] = [];

      (inst1 ?? []).forEach((ri: any) => {
        const ar = ri.accounts_receivable;
        if (!ar?.paid_at) return;
        const rc = ri.rental_contracts;
        const prop = rc?.properties;
        rows.push({
          contract_id: rc?.id ?? "",
          owner_id: prop?.client_id ?? "",
          owner_name: prop?.clients?.full_name ?? "",
          installment_id: ri.id,
          event_date: ar.paid_at,
          description: "Aluguel recebido",
          entrada: Number(ri.owner_net_value ?? ri.value ?? 0),
          saida: 0,
          company_id: rc?.company_id ?? "",
          event_type: "rent_received",
        });
      });

      (inst2 ?? []).forEach((ri: any) => {
        const ap = ri.accounts_payable;
        if (!ap?.paid_at) return;
        const rc = ri.rental_contracts;
        const prop = rc?.properties;
        rows.push({
          contract_id: rc?.id ?? "",
          owner_id: prop?.client_id ?? "",
          owner_name: prop?.clients?.full_name ?? "",
          installment_id: ri.id,
          event_date: ap.paid_at,
          description: "Repasse ao proprietário",
          entrada: 0,
          saida: Number(ri.repasse_value ?? 0),
          company_id: rc?.company_id ?? "",
          event_type: "transfer_paid",
        });
      });

      rows.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
      return rows;
    },
  });

  // Filtros
  const filtered = useMemo(() => {
    return rawRows.filter((r) => {
      if (filterOwner !== "all" && r.owner_id !== filterOwner) return false;
      if (filterContract !== "all" && r.contract_id !== filterContract) return false;
      if (dateFrom && r.event_date && r.event_date < dateFrom) return false;
      if (dateTo && r.event_date && r.event_date > dateTo) return false;
      return true;
    });
  }, [rawRows, filterOwner, filterContract, dateFrom, dateTo]);

  // Saldo acumulado (antes de ordenar)
  const rowsWithBalance = useMemo(() => {
    let saldo = 0;
    return filtered.map((r) => {
      saldo += r.entrada - r.saida;
      return { ...r, saldo };
    });
  }, [filtered]);

  // Ordenação
  const sortedRows = useMemo(() => {
    return [...rowsWithBalance].sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "data":         av = a.event_date ?? ""; bv = b.event_date ?? ""; break;
        case "proprietario": av = a.owner_name;       bv = b.owner_name;       break;
        case "descricao":    av = a.description;      bv = b.description;      break;
        case "contrato":
          av = contracts.find((c: any) => c.id === a.contract_id)?.code ?? "";
          bv = contracts.find((c: any) => c.id === b.contract_id)?.code ?? "";
          break;
        case "entrada":      av = a.entrada;          bv = b.entrada;          break;
        case "saida":        av = a.saida;            bv = b.saida;            break;
        case "saldo":        av = a.saldo;            bv = b.saldo;            break;
        default:             av = ""; bv = "";
      }
      if (typeof av === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "pt-BR")
        : String(bv).localeCompare(String(av), "pt-BR");
    });
  }, [rowsWithBalance, sortKey, sortDir, contracts]);

  const totalEntrada = filtered.reduce((s, r) => s + r.entrada, 0);
  const totalSaida = filtered.reduce((s, r) => s + r.saida, 0);
  const saldoFinal = totalEntrada - totalSaida;

  const contractsForOwner = useMemo(() => {
    if (filterOwner === "all") return contracts;
    return contracts.filter((c: any) => c.properties?.client_id === filterOwner);
  }, [contracts, filterOwner]);

  const ownerName = useMemo(() => {
    if (filterOwner === "all") return null;
    return owners.find((o: any) => o.id === filterOwner)?.full_name ?? null;
  }, [owners, filterOwner]);

  const hasFilters = dateFrom || dateTo || filterOwner !== "all" || filterContract !== "all";
  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setFilterOwner("all"); setFilterContract("all");
  };

  const handleExcel = () => {
    const colMap: Record<string, (r: typeof sortedRows[0]) => any> = {
      data:         (r) => fmtDate(r.event_date),
      proprietario: (r) => r.owner_name,
      descricao:    (r) => r.description,
      contrato:     (r) => contracts.find((c: any) => c.id === r.contract_id)?.code ?? "",
      entrada:      (r) => r.entrada > 0 ? r.entrada : "",
      saida:        (r) => r.saida > 0 ? r.saida : "",
      saldo:        (r) => r.saldo,
    };
    const labelMap: Record<string, string> = {
      data: "Data", proprietario: "Proprietário", descricao: "Descrição",
      contrato: "Contrato", entrada: "Entrada (R$)", saida: "Saída (R$)", saldo: "Saldo Acumulado (R$)",
    };
    const rows = sortedRows.map((r) => {
      const obj: Record<string, any> = {};
      ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).forEach((c) => {
        obj[labelMap[c.key]] = colMap[c.key](r);
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conta Corrente");
    XLSX.writeFile(wb, `conta-corrente-proprietario-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const thClass = "px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-6 print:space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Conta Corrente do Proprietário</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Extrato financeiro consolidado de aluguéis recebidos e repasses efetuados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ColumnSelector columns={ALL_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
            <Button variant="outline" size="sm" onClick={handleExcel}>
              <FileDown className="h-4 w-4 mr-1.5" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" />Imprimir
            </Button>
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block text-center border-b pb-4 mb-4">
          <h1 className="text-xl font-bold">Conta Corrente do Proprietário</h1>
          {ownerName && <p className="text-base font-medium mt-1">{ownerName}</p>}
          <p className="text-sm text-muted-foreground">
            Emitido em {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Search className="h-4 w-4" />Filtros
              </CardTitle>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Proprietário</Label>
              <Select value={filterOwner} onValueChange={(v) => { setFilterOwner(v); setFilterContract("all"); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {owners.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contrato</Label>
              <Select value={filterContract} onValueChange={setFilterContract}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contractsForOwner.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.code ?? c.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Inicial</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Final</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" />
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
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtMoney(totalEntrada)}</p>
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
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{fmtMoney(totalSaida)}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-rose-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card className={`border-l-4 ${saldoFinal >= 0 ? "border-l-primary" : "border-l-amber-500"}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Saldo Final</p>
                  <p className={`text-xl font-bold ${saldoFinal >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                    {fmtMoney(saldoFinal)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {sortedRows.length} registro(s) encontrado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {visibleCols.has("data") && (
                      <th className={thClass} onClick={() => handleSort("data")}>
                        Data <SortIcon col="data" />
                      </th>
                    )}
                    {visibleCols.has("proprietario") && (
                      <th className={thClass} onClick={() => handleSort("proprietario")}>
                        Proprietário <SortIcon col="proprietario" />
                      </th>
                    )}
                    {visibleCols.has("descricao") && (
                      <th className={thClass} onClick={() => handleSort("descricao")}>
                        Descrição <SortIcon col="descricao" />
                      </th>
                    )}
                    {visibleCols.has("contrato") && (
                      <th className={thClass} onClick={() => handleSort("contrato")}>
                        Contrato <SortIcon col="contrato" />
                      </th>
                    )}
                    {visibleCols.has("entrada") && (
                      <th className={`${thClass} text-right`} onClick={() => handleSort("entrada")}>
                        Entrada <SortIcon col="entrada" />
                      </th>
                    )}
                    {visibleCols.has("saida") && (
                      <th className={`${thClass} text-right`} onClick={() => handleSort("saida")}>
                        Saída <SortIcon col="saida" />
                      </th>
                    )}
                    {visibleCols.has("saldo") && (
                      <th className={`${thClass} text-right`} onClick={() => handleSort("saldo")}>
                        Saldo Acumulado <SortIcon col="saldo" />
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
                    </tr>
                  ) : sortedRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleCols.size} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhum evento encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((r, idx) => {
                      const contractCode = contracts.find((c: any) => c.id === r.contract_id)?.code ?? r.contract_id.slice(0, 8);
                      return (
                        <tr
                          key={`${r.installment_id}-${r.event_type}`}
                          className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                        >
                          {visibleCols.has("data") && (
                            <td className="px-4 py-2.5 align-middle whitespace-nowrap text-foreground/90">
                              {fmtDate(r.event_date)}
                            </td>
                          )}
                          {visibleCols.has("proprietario") && (
                            <td className="px-4 py-2.5 align-middle whitespace-nowrap text-foreground/90 font-medium">
                              {r.owner_name || "—"}
                            </td>
                          )}
                          {visibleCols.has("descricao") && (
                            <td className="px-4 py-2.5 align-middle">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  r.event_type === "rent_received"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                                }`}
                              >
                                {r.description}
                              </Badge>
                            </td>
                          )}
                          {visibleCols.has("contrato") && (
                            <td className="px-4 py-2.5 align-middle whitespace-nowrap text-foreground/90">
                              {contractCode}
                            </td>
                          )}
                          {visibleCols.has("entrada") && (
                            <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                              {r.entrada > 0 ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  +{fmtMoney(r.entrada)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          )}
                          {visibleCols.has("saida") && (
                            <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                              {r.saida > 0 ? (
                                <span className="font-semibold text-rose-600 dark:text-rose-400">
                                  -{fmtMoney(r.saida)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          )}
                          {visibleCols.has("saldo") && (
                            <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                              <span className={`font-bold ${r.saldo >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                                {fmtMoney(r.saldo)}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {sortedRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td
                        className="px-4 py-3 text-sm text-muted-foreground"
                        colSpan={Math.max(1, visibleCols.size - (visibleCols.has("entrada") ? 1 : 0) - (visibleCols.has("saida") ? 1 : 0) - (visibleCols.has("saldo") ? 1 : 0))}
                      >
                        TOTAIS
                      </td>
                      {visibleCols.has("entrada") && (
                        <td className="px-4 py-3 text-sm text-right text-emerald-600 dark:text-emerald-400">
                          +{fmtMoney(totalEntrada)}
                        </td>
                      )}
                      {visibleCols.has("saida") && (
                        <td className="px-4 py-3 text-sm text-right text-rose-600 dark:text-rose-400">
                          -{fmtMoney(totalSaida)}
                        </td>
                      )}
                      {visibleCols.has("saldo") && (
                        <td className={`px-4 py-3 text-sm text-right font-bold ${saldoFinal >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                          {fmtMoney(saldoFinal)}
                        </td>
                      )}
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
