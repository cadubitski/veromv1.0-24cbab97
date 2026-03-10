import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/InfoTooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Pencil, Trash2, ArrowLeft, Home, ChevronUp, ChevronDown } from "lucide-react";
import { StatusDot, ActionGear } from "@/components/TableActions";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";
import { toast } from "sonner";
import { maskCurrency, parseCurrency } from "@/lib/masks";

interface PropertyType { id: string; name: string; }
interface Property {
  id: string; company_id: string; client_id: string;
  property_type_id: string | null; code: string;
  purpose: "aluguel" | "venda" | "ambos";
  rent_value: number | null; sale_value: number | null;
  negotiation_percent: number | null; area_m2: number | null;
  registry_number: string | null; municipal_registration: string | null;
  address: string | null; status: "disponivel" | "alugado" | "vendido" | "inativo";
  client_name?: string;
}
interface Client { id: string; full_name: string; }

const DEFAULT_TYPES = ["Apartamento", "Casa", "Comercial", "Terreno", "Rural", "Galpão"];

type Purpose = "aluguel" | "venda" | "ambos";
type PropStatus = "disponivel" | "alugado" | "vendido" | "inativo";
type SortKey = "client_name" | "code" | "status" | "purpose" | "address";
type SortDir = "asc" | "desc";

const PROPERTY_COLUMNS: ColumnDef[] = [
  { key: "client_name", label: "Locador", defaultVisible: true },
  { key: "code", label: "Código", defaultVisible: true },
  { key: "purpose", label: "Finalidade", defaultVisible: true },
  { key: "address", label: "Endereço", defaultVisible: true },
  { key: "rent_value", label: "Valor Aluguel", defaultVisible: false },
  { key: "sale_value", label: "Valor Venda", defaultVisible: false },
  { key: "area_m2", label: "Área (m²)", defaultVisible: false },
  { key: "status", label: "Status", defaultVisible: true },
];

const EMPTY_FORM: {
  property_type_id: string; code: string; purpose: Purpose;
  rent_value: string; sale_value: string; negotiation_percent: string; area_m2: string;
  registry_number: string; municipal_registration: string; address: string;
  status: PropStatus;
} = {
  property_type_id: "", code: "", purpose: "aluguel",
  rent_value: "", sale_value: "", negotiation_percent: "", area_m2: "",
  registry_number: "", municipal_registration: "", address: "",
  status: "disponivel",
};

const statusLabel: Record<string, string> = {
  disponivel: "Disponível", alugado: "Alugado", vendido: "Vendido", inativo: "Inativo",
};
const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
  disponivel: "default", alugado: "secondary", vendido: "secondary", inativo: "destructive",
};

export default function Imoveis() {
  const { clientId } = useParams<{ clientId?: string }>();
  const navigate = useNavigate();
  const { company } = useAuth();

  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("client_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editProp, setEditProp] = useState<Property | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(PROPERTY_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  const loadData = async () => {
    setLoading(true);
    if (!company?.id) return;

    const { data: ptData } = await supabase
      .from("property_types")
      .select("id, name")
      .eq("company_id", company.id)
      .order("name");

    let types: PropertyType[] = ptData ?? [];
    if (types.length === 0) {
      const inserts = DEFAULT_TYPES.map((name) => ({ company_id: company.id, name, is_default: true }));
      const { data: inserted } = await supabase.from("property_types").insert(inserts).select("id, name");
      types = inserted ?? [];
    }
    setPropertyTypes(types);

    // Load all clients for owner name lookup
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, full_name")
      .eq("company_id", company.id);
    const clientMap: Record<string, string> = {};
    (allClients ?? []).forEach((c: Client) => { clientMap[c.id] = c.full_name; });
    setClients(allClients as Client[] ?? []);

    if (clientId) {
      const { data: cl } = await supabase.from("clients").select("id, full_name").eq("id", clientId).maybeSingle();
      setClient(cl as Client | null);
    }

    let query = supabase.from("properties").select("*").eq("company_id", company.id);
    if (clientId) query = query.eq("client_id", clientId);
    const { data: propData } = await query;
    const propsWithName = ((propData as Property[]) ?? []).map((p) => ({
      ...p,
      client_name: clientMap[p.client_id] ?? "—",
    }));
    setProperties(propsWithName);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [company?.id, clientId]);

  const generateCode = () => `IMO-${Date.now().toString().slice(-6)}`;

  const openCreate = () => {
    setEditProp(null);
    setForm({ ...EMPTY_FORM, code: generateCode() });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Property) => {
    setEditProp(p);
    setForm({
      property_type_id: p.property_type_id ?? "",
      code: p.code,
      purpose: p.purpose,
      rent_value: p.rent_value != null ? maskCurrency(String(Math.round(p.rent_value * 100))) : "",
      sale_value: p.sale_value != null ? maskCurrency(String(Math.round(p.sale_value * 100))) : "",
      negotiation_percent: p.negotiation_percent?.toString() ?? "",
      area_m2: p.area_m2?.toString() ?? "",
      registry_number: p.registry_number ?? "",
      municipal_registration: p.municipal_registration ?? "",
      address: p.address ?? "",
      status: p.status,
    });
    setError(null);
    setDialogOpen(true);
  };

  const openDelete = (p: Property) => {
    setDeleteTarget(p);
    setBlockMessage(null);
    setDeleteDialogOpen(true);
  };

  const handleAddType = async () => {
    if (!newTypeName.trim() || !company?.id) return;
    setAddingType(true);
    const { data } = await supabase
      .from("property_types")
      .insert({ company_id: company.id, name: newTypeName.trim(), is_default: false })
      .select("id, name")
      .single();
    if (data) {
      setPropertyTypes((p) => [...p, data as PropertyType].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, property_type_id: data.id }));
    }
    setNewTypeName("");
    setAddingType(false);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { setError("Código do imóvel é obrigatório."); return; }
    if (!company?.id) return;
    setSaving(true);
    setError(null);
    try {
      let codeQuery = supabase
        .from("properties")
        .select("id")
        .eq("company_id", company.id)
        .eq("code", form.code.trim());
      if (editProp) codeQuery = codeQuery.neq("id", editProp.id);
      const { data: existing } = await codeQuery.maybeSingle();
      if (existing) { setError("Já existe um imóvel cadastrado com este código."); setSaving(false); return; }

      const payload = {
        property_type_id: form.property_type_id || null,
        code: form.code.trim(),
        purpose: form.purpose,
        rent_value: parseCurrency(form.rent_value),
        sale_value: parseCurrency(form.sale_value),
        negotiation_percent: form.negotiation_percent ? parseFloat(form.negotiation_percent) : null,
        area_m2: form.area_m2 ? parseFloat(form.area_m2) : null,
        registry_number: form.registry_number || null,
        municipal_registration: form.municipal_registration || null,
        address: form.address || null,
        status: form.status,
      };

      if (editProp) {
        const { error: err } = await supabase.from("properties").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editProp.id);
        if (err) throw err;
        toast.success("Imóvel atualizado com sucesso.");
      } else {
        const targetClientId = clientId;
        if (!targetClientId) { setError("Selecione um cliente para vincular o imóvel."); setSaving(false); return; }
        const { error: err } = await supabase.from("properties").insert({ ...payload, company_id: company.id, client_id: targetClientId });
        if (err) throw err;
        toast.success("Imóvel criado com sucesso.");
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setBlockMessage(null);
    try {
      const { error: err } = await supabase.from("properties").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Imóvel excluído com sucesso.");
      setDeleteDialogOpen(false);
      loadData();
    } catch (e: any) {
      setBlockMessage(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const f = (key: keyof typeof form, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleCurrencyInput = (key: "rent_value" | "sale_value", v: string) => {
    f(key, maskCurrency(v));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-20 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 opacity-80 inline ml-1" />
      : <ChevronDown className="h-3 w-3 opacity-80 inline ml-1" />;
  };

  const filtered = useMemo(() => {
    let arr = properties.filter((p) => {
      const matchSearch =
        p.code.toLowerCase().includes(search.toLowerCase()) ||
        (p.address ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (p.client_name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "todos" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
    arr = [...arr].sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [properties, search, statusFilter, sortKey, sortDir]);

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          {clientId && (
            <Button variant="ghost" size="icon" onClick={() => navigate("/cadastros/clientes")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Home className="h-6 w-6 text-primary" />
              {client ? `Imóveis de ${client.full_name}` : "Imóveis"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
            {client ? "Gerencie os imóveis deste locador." : "Gerencie todos os imóveis cadastrados."}
            </p>
          </div>
          {clientId && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" /> Novo Imóvel
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por código, locador ou endereço..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="alugado">Alugado</SelectItem>
              <SelectItem value="vendido">Vendido</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <ColumnSelector columns={PROPERTY_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
        </div>

        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                {!clientId && visibleCols.has("client_name") && (
                  <TableHead className={thClass} onClick={() => handleSort("client_name")}>
                    Locador <SortIcon col="client_name" />
                  </TableHead>
                )}
                {visibleCols.has("code") && <TableHead className={thClass} onClick={() => handleSort("code")}>Código <SortIcon col="code" /></TableHead>}
                {visibleCols.has("purpose") && <TableHead className={thClass} onClick={() => handleSort("purpose")}>Finalidade <SortIcon col="purpose" /></TableHead>}
                {visibleCols.has("address") && <TableHead className={thClass} onClick={() => handleSort("address")}>Endereço <SortIcon col="address" /></TableHead>}
                {visibleCols.has("rent_value") && <TableHead>Aluguel</TableHead>}
                {visibleCols.has("sale_value") && <TableHead>Venda</TableHead>}
                {visibleCols.has("area_m2") && <TableHead>Área</TableHead>}
                {visibleCols.has("status") && <TableHead className={thClass} onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12 text-muted-foreground text-sm">
                  {clientId ? "Nenhum imóvel vinculado a este cliente." : "Nenhum imóvel cadastrado."}
                </TableCell></TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    {!clientId && visibleCols.has("client_name") && (
                      <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => navigate(`/cadastros/clientes/${p.client_id}/imoveis`)}>
                        {p.client_name}
                      </TableCell>
                    )}
                    {visibleCols.has("code") && <TableCell className="font-mono font-medium text-sm">{p.code}</TableCell>}
                    {visibleCols.has("purpose") && <TableCell className="text-muted-foreground text-sm capitalize">{p.purpose}</TableCell>}
                    {visibleCols.has("address") && <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">{p.address || "—"}</TableCell>}
                    {visibleCols.has("rent_value") && <TableCell className="text-muted-foreground text-sm font-mono">{p.rent_value ? `R$ ${p.rent_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</TableCell>}
                    {visibleCols.has("sale_value") && <TableCell className="text-muted-foreground text-sm font-mono">{p.sale_value ? `R$ ${p.sale_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</TableCell>}
                    {visibleCols.has("area_m2") && <TableCell className="text-muted-foreground text-sm">{p.area_m2 ? `${p.area_m2} m²` : "—"}</TableCell>}
                    {visibleCols.has("status") && (
                      <TableCell>
                        <Badge variant={statusVariant[p.status]} className="text-xs">{statusLabel[p.status]}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => openDelete(p)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editProp ? "Editar imóvel" : "Novo imóvel"}</DialogTitle>
            <DialogDescription>{editProp ? "Atualize os dados do imóvel." : "Preencha os dados do imóvel."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Código do imóvel" tooltip="Código interno único do imóvel. Gerado automaticamente, mas pode ser editado." required />
                <Input value={form.code} onChange={(e) => f("code", e.target.value)} placeholder="IMO-000000" />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Status" tooltip="Status atual do imóvel no portfólio." required />
                <Select value={form.status} onValueChange={(v) => f("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="alugado">Alugado</SelectItem>
                    <SelectItem value="vendido">Vendido</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel label="Tipo do imóvel" tooltip="Categoria do imóvel. Você pode criar tipos personalizados." />
              <div className="flex gap-2">
                <Select value={form.property_type_id} onValueChange={(v) => f("property_type_id", v)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione um tipo" /></SelectTrigger>
                  <SelectContent>
                    {propertyTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 mt-1">
                <Input value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="Criar novo tipo..." className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && handleAddType()} />
                <Button variant="outline" size="sm" onClick={handleAddType} disabled={addingType || !newTypeName.trim()} className="h-8 text-xs shrink-0">
                  {addingType ? <Loader2 className="h-3 w-3 animate-spin" /> : "Adicionar"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel label="Finalidade" tooltip="Define se o imóvel está disponível para aluguel, venda ou ambos." required />
              <Select value={form.purpose} onValueChange={(v) => f("purpose", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aluguel">Aluguel</SelectItem>
                  <SelectItem value="venda">Venda</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Valor aluguel (R$)" tooltip="Valor mensal do aluguel cobrado pelo imóvel." />
                <Input
                  value={form.rent_value}
                  onChange={(e) => handleCurrencyInput("rent_value", e.target.value)}
                  placeholder="0,00"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Valor venda (R$)" tooltip="Valor estimado para venda do imóvel." />
                <Input
                  value={form.sale_value}
                  onChange={(e) => handleCurrencyInput("sale_value", e.target.value)}
                  placeholder="0,00"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Negociação máx. (%)" tooltip="Percentual máximo autorizado pelo proprietário para negociação do preço." />
                <Input type="number" value={form.negotiation_percent} onChange={(e) => f("negotiation_percent", e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Área total (m²)" tooltip="Área total do imóvel em metros quadrados." />
                <Input type="number" value={form.area_m2} onChange={(e) => f("area_m2", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Matrícula" tooltip="Número da matrícula do imóvel no cartório de registro de imóveis." />
                <Input value={form.registry_number} onChange={(e) => f("registry_number", e.target.value)} placeholder="000000" />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Inscrição imobiliária" tooltip="Número da inscrição imobiliária do imóvel na prefeitura (IPTU)." />
                <Input value={form.municipal_registration} onChange={(e) => f("municipal_registration", e.target.value)} placeholder="000.000.000-0" />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel label="Endereço do imóvel" tooltip="Endereço completo onde o imóvel está localizado." />
              <Input value={form.address} onChange={(e) => f("address", e.target.value)} placeholder="Rua, número, complemento, bairro, cidade - UF" />
            </div>

            {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editProp ? "Salvar" : "Criar imóvel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir imóvel</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o imóvel <strong>{deleteTarget?.code}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {blockMessage && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{blockMessage}</div>}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!blockMessage && (
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
