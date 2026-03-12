import { useState, useMemo, useRef, useEffect } from "react";
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
import { Loader2, Printer, Download, Search, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";

interface OwnerOption {
  id: string;
  full_name: string;
  document: string;
  person_type: string;
}

interface InformeRow {
  id: string;
  competence: string;
  property_code: string;
  property_address: string;
  contract_code: string;
  value: number;
  management_fee_value: number;
  tax_base_value: number;
  irrf_value: number;
  owner_net_value: number;
  due_date: string;
}

function fm(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));

export default function InformeRendimentos() {
  const { company } = useAuth();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [ownerId, setOwnerId] = useState<string>("");
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [rows, setRows] = useState<InformeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [searched, setSearched] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Load owners (clients)
  useEffect(() => {
    const loadOwners = async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, full_name, document, person_type")
        .eq("status", "ativo")
        .order("full_name");
      setOwners((data ?? []) as OwnerOption[]);
      setLoadingOwners(false);
    };
    loadOwners();
  }, [company?.id]);

  const selectedOwner = useMemo(() => owners.find((o) => o.id === ownerId), [owners, ownerId]);

  const load = async () => {
    if (!ownerId) return;
    setLoading(true);
    setSearched(false);

    // Regime de caixa: buscar parcelas com contas_receber pago no ano selecionado
    const { data } = await supabase
      .from("rental_installments")
      .select(`
        id, competence, due_date, value,
        management_fee_value, tax_base_value, irrf_value, owner_net_value, repasse_value,
        accounts_receivable_id,
        accounts_receivable:accounts_receivable_id(id, paid_at, status),
        rental_contracts(
          code, property_id,
          properties(code, address, client_id)
        )
      `);

    const yearStr = year;

    const filtered = ((data ?? []) as any[]).filter((r) => {
      // Regime de caixa: considerar apenas títulos efetivamente recebidos (paid_at no ano selecionado)
      const ar = r.accounts_receivable;
      if (!ar || ar.status !== "paid") return false;
      const paidYear = ar.paid_at ? String(new Date(ar.paid_at).getFullYear()) : null;
      if (paidYear !== yearStr) return false;
      // Filtrar pelo proprietário (client_id no imóvel)
      const clientId = r.rental_contracts?.properties?.client_id;
      return clientId === ownerId;
    });

    const mapped: InformeRow[] = filtered.map((r) => ({
      id: r.id,
      competence: r.competence,
      property_code: r.rental_contracts?.properties?.code ?? "—",
      property_address: r.rental_contracts?.properties?.address ?? "—",
      contract_code: r.rental_contracts?.code ?? "—",
      value: r.value ?? 0,
      management_fee_value: r.management_fee_value ?? 0,
      tax_base_value: r.tax_base_value ?? 0,
      irrf_value: r.irrf_value ?? 0,
      owner_net_value: r.owner_net_value ?? r.repasse_value ?? 0,
      due_date: r.due_date,
    }));

    // Sort by property then competence
    mapped.sort((a, b) => {
      if (a.property_code !== b.property_code) return a.property_code.localeCompare(b.property_code);
      return a.competence.localeCompare(b.competence);
    });

    setRows(mapped);
    setLoading(false);
    setSearched(true);
  };

  const totals = useMemo(() => ({
    value: rows.reduce((s, r) => s + r.value, 0),
    fee: rows.reduce((s, r) => s + r.management_fee_value, 0),
    irrf: rows.reduce((s, r) => s + r.irrf_value, 0),
    net: rows.reduce((s, r) => s + r.owner_net_value, 0),
  }), [rows]);

  const handlePrint = () => window.print();

  const handleExcel = () => {
    if (!selectedOwner) return;
    const exportData = rows.map((r) => ({
      "Competência": r.competence,
      "Imóvel": r.property_code,
      "Endereço": r.property_address,
      "Contrato": r.contract_code,
      "Valor do Aluguel (R$)": r.value,
      "Taxa de Administração (R$)": r.management_fee_value,
      "Base de Cálculo IR (R$)": r.tax_base_value,
      "Valor IRRF (R$)": r.irrf_value,
      "Valor Líquido Repassado (R$)": r.owner_net_value,
    }));
    exportData.push({
      "Competência": "TOTAL",
      "Imóvel": "",
      "Endereço": "",
      "Contrato": "",
      "Valor do Aluguel (R$)": totals.value,
      "Taxa de Administração (R$)": totals.fee,
      "Base de Cálculo IR (R$)": 0,
      "Valor IRRF (R$)": totals.irrf,
      "Valor Líquido Repassado (R$)": totals.net,
    } as any);
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Informe ${year}`);
    XLSX.writeFile(wb, `informe_rendimentos_${selectedOwner.full_name.replace(/\s+/g, "_")}_${year}.xlsx`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" ref={printRef}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Informe de Rendimentos do Proprietário</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Demonstrativo anual de rendimentos de locação para entrega ao proprietário (declaração de IR).
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

          <Select value={ownerId} onValueChange={setOwnerId} disabled={loadingOwners}>
            <SelectTrigger className="flex-1 min-w-[200px]">
              <SelectValue placeholder={loadingOwners ? "Carregando..." : "Selecione o proprietário..."} />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.full_name} {o.document ? `— ${o.document}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={load} disabled={loading || !ownerId} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Gerar Informe
          </Button>
        </div>

        {/* Cabeçalho do informe — visível na tela e na impressão */}
        {searched && selectedOwner && (
          <div className="card-premium rounded-xl p-5 border border-border/40 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg">Informe de Rendimentos — {year}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Proprietário</span>
                <p className="font-semibold">{selectedOwner.full_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">CPF / CNPJ</span>
                <p className="font-mono">{selectedOwner.document || "Não informado"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Tipo</span>
                <p>{selectedOwner.person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">
              Imobiliária: <span className="font-medium">{company?.name}</span> — Período: 01/01/{year} a 31/12/{year}
            </div>
          </div>
        )}

        {/* Tabela de parcelas */}
        {searched && (
          <div className="card-premium rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40">
                  <TableHead className="whitespace-nowrap">Competência</TableHead>
                  <TableHead className="whitespace-nowrap">Imóvel</TableHead>
                  <TableHead className="whitespace-nowrap">Endereço</TableHead>
                  <TableHead className="whitespace-nowrap">Contrato</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Valor do Aluguel</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Taxa de Adm</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Base Cálc. IR</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Valor IRRF</TableHead>
                  <TableHead className="text-right whitespace-nowrap font-semibold">Valor Líquido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      Nenhuma parcela paga encontrada para {selectedOwner?.full_name} em {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-sm whitespace-nowrap">{r.competence}</TableCell>
                        <TableCell className="font-medium text-sm whitespace-nowrap">{r.property_code}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap max-w-[200px] truncate" title={r.property_address}>
                          {r.property_address}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">{r.contract_code}</TableCell>
                        <TableCell className="text-right font-mono text-sm whitespace-nowrap">R$ {fm(r.value)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                          R$ {fm(r.management_fee_value)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground whitespace-nowrap">
                          R$ {fm(r.tax_base_value)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                          {r.irrf_value > 0
                            ? <span className="text-destructive/80">R$ {fm(r.irrf_value)}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap text-primary">
                          R$ {fm(r.owner_net_value)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Linha de totais */}
                    <TableRow className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                      <TableCell colSpan={4} className="font-bold">TOTAL — {rows.length} parcela(s)</TableCell>
                      <TableCell className="text-right font-mono">R$ {fm(totals.value)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">R$ {fm(totals.fee)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">—</TableCell>
                      <TableCell className="text-right font-mono text-destructive/80">R$ {fm(totals.irrf)}</TableCell>
                      <TableCell className="text-right font-mono text-primary">R$ {fm(totals.net)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Totais em cards */}
        {searched && rows.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Aluguéis Recebidos", value: totals.value, sub: `${rows.length} parcela(s) — ${year}` },
              { label: "Total Taxa de Administração", value: totals.fee, sub: "Despesa de administração" },
              { label: "Total IRRF Retido", value: totals.irrf, sub: "Retido na fonte", highlight: totals.irrf > 0 },
              { label: "Total Líquido Repassado", value: totals.net, accent: true, sub: "Valor recebido pelo proprietário" },
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
