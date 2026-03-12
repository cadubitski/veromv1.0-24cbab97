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
import { Printer, FileDown, Search, X, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtDate = (d: string | null) => {
  if (!d) return "-";
  try { return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; }
};
const fmtMoney = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface StatementRow {
  contract_id: string;
  owner_id: string;
  installment_id: string;
  event_date: string | null;
  description: string;
  entrada: number;
  saida: number;
  company_id: string;
  event_type: string;
}

export default function RelContaCorrenteProprietario() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterContract, setFilterContract] = useState("all");

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

  // Buscar dados da view vw_owner_statement via query direta nas tabelas
  const { data: rawRows = [], isFetching } = useQuery({
    queryKey: ["owner_statement", companyId, dateFrom, dateTo],
    enabled: !!companyId,
    queryFn: async () => {
      // Evento 1: Aluguel recebido
      let q1 = supabase
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

      const { data: inst1 } = await q1;

      // Evento 2: Repasse pago
      let q2 = supabase
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

      const { data: inst2 } = await q2;

      const rows: StatementRow[] = [];

      // Processar eventos tipo 1
      (inst1 ?? []).forEach((ri: any) => {
        const ar = ri.accounts_receivable;
        if (!ar?.paid_at) return;
        const rc = ri.rental_contracts;
        const prop = rc?.properties;
        rows.push({
          contract_id: rc?.id ?? "",
          owner_id: prop?.client_id ?? "",
          installment_id: ri.id,
          event_date: ar.paid_at,
          description: "Aluguel recebido",
          entrada: Number(ri.owner_net_value ?? ri.value ?? 0),
          saida: 0,
          company_id: rc?.company_id ?? "",
          event_type: "rent_received",
        });
      });

      // Processar eventos tipo 2
      (inst2 ?? []).forEach((ri: any) => {
        const ap = ri.accounts_payable;
        if (!ap?.paid_at) return;
        const rc = ri.rental_contracts;
        const prop = rc?.properties;
        rows.push({
          contract_id: rc?.id ?? "",
          owner_id: prop?.client_id ?? "",
          installment_id: ri.id,
          event_date: ap.paid_at,
          description: "Repasse ao proprietário",
          entrada: 0,
          saida: Number(ri.repasse_value ?? 0),
          company_id: rc?.company_id ?? "",
          event_type: "transfer_paid",
        });
      });

      // Ordenar por data
      rows.sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? ""));
      return rows;
    },
  });

  // Filtros aplicados
  const filtered = useMemo(() => {
    return rawRows.filter((r) => {
      if (filterOwner !== "all" && r.owner_id !== filterOwner) return false;
      if (filterContract !== "all" && r.contract_id !== filterContract) return false;
      if (dateFrom && r.event_date && r.event_date < dateFrom) return false;
      if (dateTo && r.event_date && r.event_date > dateTo) return false;
      return true;
    });
  }, [rawRows, filterOwner, filterContract, dateFrom, dateTo]);

  // Saldo acumulado calculado na aplicação
  const rowsWithBalance = useMemo(() => {
    let saldo = 0;
    return filtered.map((r) => {
      saldo += r.entrada - r.saida;
      return { ...r, saldo };
    });
  }, [filtered]);

  const totalEntrada = filtered.reduce((s, r) => s + r.entrada, 0);
  const totalSaida = filtered.reduce((s, r) => s + r.saida, 0);
  const saldoFinal = totalEntrada - totalSaida;

  // Mapa de contratos filtrados pelo proprietário selecionado
  const contractsForOwner = useMemo(() => {
    if (filterOwner === "all") return contracts;
    return contracts.filter((c: any) => {
      const clientId = c.properties?.client_id;
      return clientId === filterOwner;
    });
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
    const rows = rowsWithBalance.map((r) => ({
      "Data": fmtDate(r.event_date),
      "Descrição": r.description,
      "Proprietário": owners.find((o: any) => o.id === r.owner_id)?.full_name ?? r.owner_id,
      "Contrato": contracts.find((c: any) => c.id === r.contract_id)?.code ?? r.contract_id,
      "Entrada (R$)": r.entrada > 0 ? r.entrada : "",
      "Saída (R$)": r.saida > 0 ? r.saida : "",
      "Saldo Acumulado (R$)": r.saldo,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Conta Corrente");
    XLSX.writeFile(wb, `conta-corrente-proprietario-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

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
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Final</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
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
              {rowsWithBalance.length} registro(s) encontrado(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Contrato</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Entrada</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Saída</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {isFetching ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Carregando...</td>
                    </tr>
                  ) : rowsWithBalance.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Nenhum evento encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    rowsWithBalance.map((r, idx) => {
                      const contractCode = contracts.find((c: any) => c.id === r.contract_id)?.code ?? r.contract_id.slice(0, 8);
                      return (
                        <tr
                          key={`${r.installment_id}-${r.event_type}`}
                          className={`border-b transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                        >
                          <td className="px-4 py-2.5 align-middle whitespace-nowrap text-foreground/90">
                            {fmtDate(r.event_date)}
                          </td>
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
                          <td className="px-4 py-2.5 align-middle whitespace-nowrap text-foreground/90">
                            {contractCode}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                            {r.entrada > 0 ? (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                +{fmtMoney(r.entrada)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                            {r.saida > 0 ? (
                              <span className="font-semibold text-rose-600 dark:text-rose-400">
                                -{fmtMoney(r.saida)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 align-middle text-right whitespace-nowrap">
                            <span className={`font-bold ${r.saldo >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                              {fmtMoney(r.saldo)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {rowsWithBalance.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-semibold">
                      <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={3}>TOTAIS</td>
                      <td className="px-4 py-3 text-sm text-right text-emerald-600 dark:text-emerald-400">
                        +{fmtMoney(totalEntrada)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-rose-600 dark:text-rose-400">
                        -{fmtMoney(totalSaida)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-bold ${saldoFinal >= 0 ? "text-primary" : "text-amber-600 dark:text-amber-400"}`}>
                        {fmtMoney(saldoFinal)}
                      </td>
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
