import { useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, Download, Search, BarChart2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";

interface DimobRow {
  owner_id: string;
  owner_name: string;
  owner_document: string;
  owner_person_type: string;
  contracts_count: number;
  total_value: number;
  total_fee: number;
  total_irrf: number;
  total_repasse: number;
}

interface AnalyticRow {
  installment_id: string;
  competence: string;
  contract_code: string | null;
  property_address: string | null;
  paid_at: string;
  value: number;
  management_fee_value: number;
  irrf_value: number;
  owner_net_value: number;
}

function fm(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));

export default function Dimob() {
  const { company } = useAuth();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rows, setRows] = useState<DimobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [search, setSearch] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  // Analítico
  const [analyticOwner, setAnalyticOwner] = useState<DimobRow | null>(null);
  const [analyticRows, setAnalyticRows] = useState<AnalyticRow[]>([]);
  const [analyticLoading, setAnalyticLoading] = useState(false);
  // Store raw installment data for re-use
  const [allInstData, setAllInstData] = useState<any[]>([]);
  const [arPaidAtMap, setArPaidAtMap] = useState<Map<string, string>>(new Map());

  const load = async () => {
    if (!company?.id) return;
    setLoading(true);
    setSearched(false);

    const yearNum = Number(year);
    const dateFrom = `${yearNum}-01-01`;
    const dateTo = `${yearNum + 1}-01-01`;

    const { data: arData } = await supabase
      .from("accounts_receivable")
      .select("id, paid_at, installment_id")
      .eq("company_id", company.id)
      .eq("status", "paid")
      .gte("paid_at", dateFrom)
      .lt("paid_at", dateTo)
      .not("installment_id", "is", null);

    if (!arData || arData.length === 0) {
      setRows([]);
      setAllInstData([]);
      setArPaidAtMap(new Map());
      setLoading(false);
      setSearched(true);
      return;
    }

    const installmentIds = arData.map((ar) => ar.id);
    const paidAtMap = new Map(arData.map((ar) => [ar.id, ar.paid_at as string]));
    setArPaidAtMap(paidAtMap);

    const { data: instData } = await supabase
      .from("rental_installments")
      .select(`
        id, competence, value,
        management_fee_value, irrf_value, owner_net_value, repasse_value,
        accounts_receivable_id,
        rental_contracts(
          id, code,
          properties(client_id, address, clients(id, full_name, document, person_type))
        )
      `)
      .eq("company_id", company.id)
      .in("accounts_receivable_id", installmentIds);

    const data = (instData ?? []) as any[];
    setAllInstData(data);

    const map = new Map<string, DimobRow>();
    const contractsByOwner = new Map<string, Set<string>>();

    for (const r of data) {
      const client = r.rental_contracts?.properties?.clients;
      if (!client) continue;
      const ownerId = client.id as string;
      const contractId = r.rental_contracts?.id as string;

      if (!map.has(ownerId)) {
        map.set(ownerId, {
          owner_id: ownerId,
          owner_name: client.full_name ?? "—",
          owner_document: client.document ?? "—",
          owner_person_type: client.person_type ?? "fisica",
          contracts_count: 0,
          total_value: 0,
          total_fee: 0,
          total_irrf: 0,
          total_repasse: 0,
        });
        contractsByOwner.set(ownerId, new Set());
      }

      const row = map.get(ownerId)!;
      row.total_value += Number(r.value ?? 0);
      row.total_fee += Number(r.management_fee_value ?? 0);
      row.total_irrf += Number(r.irrf_value ?? 0);
      row.total_repasse += Number(r.owner_net_value ?? r.repasse_value ?? 0);

      if (contractId) contractsByOwner.get(ownerId)!.add(contractId);
    }

    for (const [ownerId, row] of map.entries()) {
      row.contracts_count = contractsByOwner.get(ownerId)?.size ?? 0;
    }

    const result = Array.from(map.values()).sort((a, b) =>
      a.owner_name.localeCompare(b.owner_name, "pt-BR")
    );

    setRows(result);
    setLoading(false);
    setSearched(true);
  };

  const openAnalytic = (owner: DimobRow) => {
    setAnalyticOwner(owner);
    setAnalyticLoading(true);

    const ownerRows: AnalyticRow[] = allInstData
      .filter((r: any) => r.rental_contracts?.properties?.clients?.id === owner.owner_id)
      .map((r: any) => ({
        installment_id: r.id,
        competence: r.competence ?? "—",
        contract_code: r.rental_contracts?.code ?? null,
        property_address: r.rental_contracts?.properties?.address ?? null,
        paid_at: arPaidAtMap.get(r.accounts_receivable_id) ?? "—",
        value: Number(r.value ?? 0),
        management_fee_value: Number(r.management_fee_value ?? 0),
        irrf_value: Number(r.irrf_value ?? 0),
        owner_net_value: Number(r.owner_net_value ?? r.repasse_value ?? 0),
      }))
      .sort((a, b) => a.paid_at.localeCompare(b.paid_at));

    setAnalyticRows(ownerRows);
    setAnalyticLoading(false);
  };

  const closeAnalytic = () => {
    setAnalyticOwner(null);
    setAnalyticRows([]);
  };

  const handleExcelAnalytic = () => {
    if (!analyticOwner) return;
    const exportData = analyticRows.map((r) => ({
      "Competência": r.competence,
      "Data Recebimento": formatDate(r.paid_at),
      "Contrato": r.contract_code ?? "—",
      "Endereço Imóvel": r.property_address ?? "—",
      "Valor Aluguel (R$)": r.value,
      "Taxa Adm (R$)": r.management_fee_value,
      "IRRF (R$)": r.irrf_value,
      "Valor Repassado (R$)": r.owner_net_value,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Analítico`);
    XLSX.writeFile(wb, `dimob_analitico_${analyticOwner.owner_name.replace(/\s+/g, "_")}_${year}.xlsx`);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.owner_name.toLowerCase().includes(q) ||
        r.owner_document.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => ({
    value: filtered.reduce((s, r) => s + r.total_value, 0),
    fee: filtered.reduce((s, r) => s + r.total_fee, 0),
    irrf: filtered.reduce((s, r) => s + r.total_irrf, 0),
    repasse: filtered.reduce((s, r) => s + r.total_repasse, 0),
  }), [filtered]);

  const analyticTotals = useMemo(() => ({
    value: analyticRows.reduce((s, r) => s + r.value, 0),
    fee: analyticRows.reduce((s, r) => s + r.management_fee_value, 0),
    irrf: analyticRows.reduce((s, r) => s + r.irrf_value, 0),
    repasse: analyticRows.reduce((s, r) => s + r.owner_net_value, 0),
  }), [analyticRows]);

  const handlePrint = () => window.print();

  const handleExcel = () => {
    const exportData = filtered.map((r) => ({
      "Proprietário": r.owner_name,
      "CPF / CNPJ": r.owner_document,
      "Tipo": r.owner_person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica",
      "Qtd. Contratos": r.contracts_count,
      "Total Aluguel (R$)": r.total_value,
      "Total Taxa Adm (R$)": r.total_fee,
      "Total IRRF (R$)": r.total_irrf,
      "Total Repassado (R$)": r.total_repasse,
    }));
    exportData.push({
      "Proprietário": "TOTAL",
      "CPF / CNPJ": "",
      "Tipo": "",
      "Qtd. Contratos": filtered.reduce((s, r) => s + r.contracts_count, 0),
      "Total Aluguel (R$)": totals.value,
      "Total Taxa Adm (R$)": totals.fee,
      "Total IRRF (R$)": totals.irrf,
      "Total Repassado (R$)": totals.repasse,
    } as any);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `DIMOB ${year}`);
    XLSX.writeFile(wb, `dimob_${year}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" ref={printRef}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">DIMOB Anual</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Demonstrativo de aluguel recebido por proprietário — base para declaração DIMOB à Receita Federal.{" "}
              <span className="font-medium text-primary">Regime de caixa</span>: considera a data efetiva de recebimento (baixa do título).
            </p>
          </div>
          {searched && rows.length > 0 && (
            <div className="flex gap-2 print:hidden">
              <Button variant="outline" className="gap-2" onClick={handlePrint}>
                <Printer className="h-4 w-4" /> Imprimir
              </Button>
              <Button variant="outline" className="gap-2" onClick={handleExcel}>
                <Download className="h-4 w-4" /> Excel
              </Button>
            </div>
          )}
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Gerar Relatório
          </Button>
          {searched && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar proprietário ou CPF/CNPJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
        </div>

        {/* Cabeçalho de impressão */}
        {searched && (
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">DIMOB — Ano {year}</h2>
            <p className="text-sm text-muted-foreground">{company?.name} — {filtered.length} proprietário(s)</p>
          </div>
        )}

        {/* Tabela */}
        {searched && (
          <div className="card-premium rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40">
                  <TableHead>Proprietário</TableHead>
                  <TableHead>CPF / CNPJ</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Qtd. Contratos</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total Aluguel</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total Taxa Adm</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total IRRF</TableHead>
                  <TableHead className="text-right whitespace-nowrap font-semibold">Total Repassado</TableHead>
                  <TableHead className="w-px whitespace-nowrap print:hidden"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      Nenhum dado encontrado para o ano {year}. Verifique se há parcelas com baixa registrada no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filtered.map((r) => (
                      <TableRow key={r.owner_id} className="border-border/40 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{r.owner_name}</TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{r.owner_document}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.owner_person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.contracts_count}</TableCell>
                        <TableCell className="text-right font-mono text-sm">R$ {fm(r.total_value)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">R$ {fm(r.total_fee)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {r.total_irrf > 0
                            ? <span className="text-destructive/80">R$ {fm(r.total_irrf)}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                          R$ {fm(r.total_repasse)}
                        </TableCell>
                        <TableCell className="print:hidden">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs h-7 px-2"
                            onClick={() => openAnalytic(r)}
                          >
                            <BarChart2 className="h-3.5 w-3.5" />
                            Analítico
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                      <TableCell colSpan={3} className="font-bold">TOTAL — {filtered.length} proprietário(s)</TableCell>
                      <TableCell className="text-right font-mono">
                        {filtered.reduce((s, r) => s + r.contracts_count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">R$ {fm(totals.value)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">R$ {fm(totals.fee)}</TableCell>
                      <TableCell className="text-right font-mono text-destructive/80">R$ {fm(totals.irrf)}</TableCell>
                      <TableCell className="text-right font-mono text-primary">R$ {fm(totals.repasse)}</TableCell>
                      <TableCell className="print:hidden" />
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Resumo cards */}
        {searched && filtered.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Aluguel", value: totals.value, sub: `${filtered.length} proprietário(s) — ${year}` },
              { label: "Total Taxa Admin", value: totals.fee, sub: "Receita de administração" },
              { label: "Total IRRF Retido", value: totals.irrf, sub: "Apenas PF", highlight: totals.irrf > 0 },
              { label: "Total Repassado", value: totals.repasse, accent: true, sub: "Líquido ao proprietário" },
            ].map((item) => (
              <div
                key={item.label}
                className={`card-premium rounded-xl p-4 border ${
                  (item as any).accent
                    ? "border-primary/40 bg-primary/5"
                    : (item as any).highlight
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border/40"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${
                  (item as any).accent ? "text-primary" : (item as any).highlight && totals.irrf > 0 ? "text-destructive/80" : "text-foreground"
                }`}>
                  R$ {fm(item.value)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Analítico */}
      <Dialog open={!!analyticOwner} onOpenChange={(o) => { if (!o) closeAnalytic(); }}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <BarChart2 className="h-5 w-5 text-primary" />
                  Analítico DIMOB — {analyticOwner?.owner_name}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Registros detalhados que compõem o valor da DIMOB {year} para este proprietário.
                  {analyticOwner && (
                    <span className="ml-2 font-mono text-xs">{analyticOwner.owner_document}</span>
                  )}
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleExcelAnalytic}>
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
            </div>
          </DialogHeader>

          {/* Cards de totais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            {[
              { label: "Total Aluguel", value: analyticTotals.value },
              { label: "Taxa Adm", value: analyticTotals.fee },
              { label: "IRRF Retido", value: analyticTotals.irrf, highlight: analyticTotals.irrf > 0 },
              { label: "Valor Repassado", value: analyticTotals.repasse, accent: true },
            ].map((c) => (
              <div
                key={c.label}
                className={`rounded-lg p-3 border text-center ${
                  (c as any).accent
                    ? "border-primary/40 bg-primary/5"
                    : (c as any).highlight && c.value > 0
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-border/40 bg-muted/20"
                }`}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className={`text-base font-bold font-mono mt-0.5 ${
                  (c as any).accent ? "text-primary" : (c as any).highlight && c.value > 0 ? "text-destructive/80" : "text-foreground"
                }`}>
                  R$ {fm(c.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Tabela analítica */}
          <div className="overflow-auto flex-1 rounded-lg border border-border/40">
            {analyticLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 bg-muted/30">
                    <TableHead className="whitespace-nowrap">Competência</TableHead>
                    <TableHead className="whitespace-nowrap">Dt. Recebimento</TableHead>
                    <TableHead className="whitespace-nowrap">Contrato</TableHead>
                    <TableHead>Endereço do Imóvel</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Aluguel</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Taxa Adm</TableHead>
                    <TableHead className="text-right whitespace-nowrap">IRRF</TableHead>
                    <TableHead className="text-right whitespace-nowrap font-semibold">Repassado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                        Nenhum registro encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {analyticRows.map((r) => (
                        <TableRow key={r.installment_id} className="border-border/40 hover:bg-muted/20 transition-colors">
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {r.competence}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{formatDate(r.paid_at)}</TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {r.contract_code ?? <span className="italic text-muted-foreground/60">—</span>}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={r.property_address ?? ""}>
                            {r.property_address ?? <span className="text-muted-foreground/60 italic">—</span>}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">R$ {fm(r.value)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">R$ {fm(r.management_fee_value)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {r.irrf_value > 0
                              ? <span className="text-destructive/80">R$ {fm(r.irrf_value)}</span>
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-primary">
                            R$ {fm(r.owner_net_value)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                        <TableCell colSpan={4} className="font-bold text-sm">
                          TOTAL — {analyticRows.length} parcela(s)
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">R$ {fm(analyticTotals.value)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">R$ {fm(analyticTotals.fee)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-destructive/80">
                          {analyticTotals.irrf > 0 ? `R$ ${fm(analyticTotals.irrf)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-primary">R$ {fm(analyticTotals.repasse)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
