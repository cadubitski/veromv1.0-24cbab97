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
import { Loader2, Printer, Download, Search } from "lucide-react";
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

function fm(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const load = async () => {
    setLoading(true);
    setSearched(false);

    // Regime de caixa: buscar parcelas cujo contas_receber foi pago no ano selecionado
    const { data } = await supabase
      .from("rental_installments")
      .select(`
        id, competence, value,
        management_fee_value, irrf_value, owner_net_value, repasse_value,
        accounts_receivable_id,
        accounts_receivable:accounts_receivable_id(id, paid_at, status),
        rental_contracts(
          id, property_id,
          properties(code, clients(id, full_name, document, person_type))
        )
      `);

    const yearStr = year;
    const filtered = ((data ?? []) as any[]).filter((r) => {
      // Regime de caixa: considerar apenas títulos efetivamente recebidos (paid_at no ano selecionado)
      const ar = r.accounts_receivable;
      if (!ar || ar.status !== "paid") return false;
      const paidYear = ar.paid_at ? String(new Date(ar.paid_at).getFullYear()) : null;
      return paidYear === yearStr;
    });

    // Group by owner
    const map = new Map<string, DimobRow>();
    const contractsByOwner = new Map<string, Set<string>>();

    for (const r of filtered) {
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
      const feeV = r.management_fee_value ?? 0;
      const irrfV = r.irrf_value ?? 0;
      const repV = r.owner_net_value ?? r.repasse_value ?? 0;

      row.total_value += r.value ?? 0;
      row.total_fee += feeV;
      row.total_irrf += irrfV;
      row.total_repasse += repV;

      if (contractId) contractsByOwner.get(ownerId)!.add(contractId);
    }

    // Set contract counts
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
              Demonstrativo de aluguel recebido por proprietário — base para declaração DIMOB à Receita Federal.
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      Nenhum dado encontrado para o ano {year}. Verifique se há parcelas pagas registradas.
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
                      </TableRow>
                    ))}
                    {/* Linha de totais */}
                    <TableRow className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                      <TableCell colSpan={3} className="font-bold">TOTAL — {filtered.length} proprietário(s)</TableCell>
                      <TableCell className="text-right font-mono">
                        {filtered.reduce((s, r) => s + r.contracts_count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">R$ {fm(totals.value)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">R$ {fm(totals.fee)}</TableCell>
                      <TableCell className="text-right font-mono text-destructive/80">R$ {fm(totals.irrf)}</TableCell>
                      <TableCell className="text-right font-mono text-primary">R$ {fm(totals.repasse)}</TableCell>
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
    </DashboardLayout>
  );
}
