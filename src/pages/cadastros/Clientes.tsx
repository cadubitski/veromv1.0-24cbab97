import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Eye, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { maskCPF, maskCNPJ, maskPhone } from "@/lib/masks";
import ColumnSelector, { ColumnDef } from "@/components/ColumnSelector";

interface Client {
  id: string;
  company_id: string;
  person_type: "fisica" | "juridica";
  full_name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "ativo" | "inativo";
  created_at: string;
}

type SortKey = "full_name" | "person_type" | "document" | "status" | "created_at";
type SortDir = "asc" | "desc";

const CLIENT_COLUMNS: ColumnDef[] = [
  { key: "full_name", label: "Nome", defaultVisible: true },
  { key: "person_type", label: "Tipo", defaultVisible: true },
  { key: "document", label: "Documento", defaultVisible: true },
  { key: "contact", label: "Contato", defaultVisible: true },
  { key: "email", label: "E-mail", defaultVisible: false },
  { key: "whatsapp", label: "WhatsApp", defaultVisible: false },
  { key: "address", label: "Endereço", defaultVisible: false },
  { key: "status", label: "Status", defaultVisible: true },
];

const EMPTY_FORM: Omit<Client, "id" | "company_id" | "created_at"> = {
  person_type: "fisica",
  full_name: "",
  document: "",
  phone: "",
  whatsapp: "",
  email: "",
  address: "",
  notes: "",
  status: "ativo",
};

export default function Clientes() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [sortKey, setSortKey] = useState<SortKey>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(CLIENT_COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key))
  );

  const loadClients = async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*");
    setClients((data as Client[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

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
    let arr = clients.filter((c) => {
      const matchesSearch =
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.document ?? "").includes(search) ||
        (c.email ?? "").toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "todos" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    arr = [...arr].sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return arr;
  }, [clients, search, statusFilter, sortKey, sortDir]);

  const openCreate = () => {
    setEditClient(null);
    setForm({ ...EMPTY_FORM });
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setForm({
      person_type: client.person_type,
      full_name: client.full_name,
      document: client.document ?? "",
      phone: client.phone ?? "",
      whatsapp: client.whatsapp ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
      status: client.status,
    });
    setError(null);
    setDialogOpen(true);
  };

  const openView = (client: Client) => { setViewClient(client); setViewDialogOpen(true); };
  const openDelete = (client: Client) => { setDeleteTarget(client); setBlockMessage(null); setDeleteDialogOpen(true); };

  const handleSave = async () => {
    if (!form.full_name.trim()) { setError("Nome completo é obrigatório."); return; }
    if (!company?.id) return;
    setSaving(true);
    setError(null);
    try {
      if (editClient) {
        const { error: err } = await supabase
          .from("clients")
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq("id", editClient.id);
        if (err) throw err;
        toast.success("Cliente atualizado com sucesso.");
      } else {
        const { error: err } = await supabase
          .from("clients")
          .insert({ ...form, company_id: company.id });
        if (err) throw err;
        toast.success("Cliente criado com sucesso.");
      }
      setDialogOpen(false);
      loadClients();
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
      const { count: propCount } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("client_id", deleteTarget.id);
      if ((propCount ?? 0) > 0) {
        setBlockMessage("Não é possível excluir este cliente pois existem imóveis vinculados.");
        setDeleting(false);
        return;
      }
      const { error: err } = await supabase.from("clients").delete().eq("id", deleteTarget.id);
      if (err) throw err;
      toast.success("Cliente excluído com sucesso.");
      setDeleteDialogOpen(false);
      loadClients();
    } catch (e: any) {
      setBlockMessage(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const f = (key: keyof typeof form, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleDocument = (v: string) => {
    const masked = form.person_type === "fisica" ? maskCPF(v) : maskCNPJ(v);
    f("document", masked);
  };

  const thClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Locadores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gerencie os locadores (proprietários) da sua imobiliária.</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Locador
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF/CNPJ ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <ColumnSelector columns={CLIENT_COLUMNS} visible={visibleCols} onChange={setVisibleCols} />
        </div>

        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                {visibleCols.has("full_name") && <TableHead className={thClass} onClick={() => handleSort("full_name")}>Nome <SortIcon col="full_name" /></TableHead>}
                {visibleCols.has("person_type") && <TableHead className={thClass} onClick={() => handleSort("person_type")}>Tipo <SortIcon col="person_type" /></TableHead>}
                {visibleCols.has("document") && <TableHead className={thClass} onClick={() => handleSort("document")}>Documento <SortIcon col="document" /></TableHead>}
                {visibleCols.has("contact") && <TableHead>Contato</TableHead>}
                {visibleCols.has("email") && <TableHead>E-mail</TableHead>}
                {visibleCols.has("whatsapp") && <TableHead>WhatsApp</TableHead>}
                {visibleCols.has("address") && <TableHead>Endereço</TableHead>}
                {visibleCols.has("status") && <TableHead className={thClass} onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={visibleCols.size + 1} className="text-center py-12 text-muted-foreground text-sm">
                  {search || statusFilter !== "todos" ? "Nenhum locador encontrado com os filtros aplicados." : "Nenhum locador cadastrado ainda."}
                </TableCell></TableRow>
              ) : (
                filtered.map((client) => (
                  <TableRow key={client.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                    {visibleCols.has("full_name") && <TableCell className="font-medium">{client.full_name}</TableCell>}
                    {visibleCols.has("person_type") && <TableCell className="text-muted-foreground text-sm">{client.person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}</TableCell>}
                    {visibleCols.has("document") && <TableCell className="text-muted-foreground text-sm font-mono">{client.document || "—"}</TableCell>}
                    {visibleCols.has("contact") && <TableCell className="text-muted-foreground text-sm">{client.phone || "—"}</TableCell>}
                    {visibleCols.has("email") && <TableCell className="text-muted-foreground text-sm">{client.email || "—"}</TableCell>}
                    {visibleCols.has("whatsapp") && <TableCell className="text-muted-foreground text-sm">{client.whatsapp || "—"}</TableCell>}
                    {visibleCols.has("address") && <TableCell className="text-muted-foreground text-sm truncate max-w-[160px]">{client.address || "—"}</TableCell>}
                    {visibleCols.has("status") && (
                      <TableCell>
                        <Badge variant={client.status === "ativo" ? "default" : "secondary"} className="text-xs">
                          {client.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openView(client)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(client)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => openDelete(client)}><Trash2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" className="h-8 text-xs hidden sm:flex gap-1.5" onClick={() => navigate(`/cadastros/clientes/${client.id}/imoveis`)}>Ver Imóveis</Button>
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
        <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editClient ? "Editar locador" : "Novo locador"}</DialogTitle>
            <DialogDescription>
              {editClient ? "Atualize os dados do locador." : "Preencha os dados para cadastrar um novo locador."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Tipo de pessoa" tooltip="Selecione Pessoa Física para CPF ou Jurídica para CNPJ." required />
                <Select value={form.person_type} onValueChange={(v) => { f("person_type", v); f("document", ""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fisica">Pessoa Física</SelectItem>
                    <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <FieldLabel label="Status" tooltip="Define se este locador está ativo no sistema." required />
                <Select value={form.status} onValueChange={(v) => f("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel label="Nome completo / Razão Social" tooltip="Nome completo da pessoa física ou razão social da empresa." required />
              <Input value={form.full_name} onChange={(e) => f("full_name", e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div className="space-y-2">
              <FieldLabel label={form.person_type === "fisica" ? "CPF" : "CNPJ"} tooltip={form.person_type === "fisica" ? "CPF do proprietário." : "CNPJ da empresa proprietária."} />
              <Input
                value={form.document ?? ""}
                onChange={(e) => handleDocument(e.target.value)}
                placeholder={form.person_type === "fisica" ? "000.000.000-00" : "00.000.000/0000-00"}
                inputMode="numeric"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <FieldLabel label="Telefone" tooltip="Número de telefone fixo para contato." />
                <Input
                  value={form.phone ?? ""}
                  onChange={(e) => f("phone", maskPhone(e.target.value))}
                  placeholder="(00) 0000-0000"
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="WhatsApp" tooltip="Número de WhatsApp para comunicação rápida." />
                <Input
                  value={form.whatsapp ?? ""}
                  onChange={(e) => f("whatsapp", maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel label="E-mail" tooltip="Endereço de e-mail para envio de comunicações e documentos." />
              <Input type="email" value={form.email ?? ""} onChange={(e) => f("email", e.target.value)} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-2">
              <FieldLabel label="Endereço completo" tooltip="Endereço residencial ou comercial do locador." />
              <Input value={form.address ?? ""} onChange={(e) => f("address", e.target.value)} placeholder="Rua, número, bairro, cidade - UF" />
            </div>
            <div className="space-y-2">
              <FieldLabel label="Observações internas" tooltip="Notas internas sobre este locador, visíveis apenas para a equipe." />
              <Textarea value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Informações relevantes sobre este locador..." rows={3} className="resize-none" />
            </div>
            {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editClient ? "Salvar" : "Criar locador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Dados do locador</DialogTitle></DialogHeader>
          {viewClient && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs">Tipo</p><p className="font-medium">{viewClient.person_type === "fisica" ? "Pessoa Física" : "Pessoa Jurídica"}</p></div>
                <div><p className="text-muted-foreground text-xs">Status</p><Badge variant={viewClient.status === "ativo" ? "default" : "secondary"}>{viewClient.status === "ativo" ? "Ativo" : "Inativo"}</Badge></div>
              </div>
              <div><p className="text-muted-foreground text-xs">Nome / Razão Social</p><p className="font-medium">{viewClient.full_name}</p></div>
              {viewClient.document && <div><p className="text-muted-foreground text-xs">{viewClient.person_type === "fisica" ? "CPF" : "CNPJ"}</p><p className="font-mono">{viewClient.document}</p></div>}
              <div className="grid grid-cols-2 gap-3">
                {viewClient.phone && <div><p className="text-muted-foreground text-xs">Telefone</p><p>{viewClient.phone}</p></div>}
                {viewClient.whatsapp && <div><p className="text-muted-foreground text-xs">WhatsApp</p><p>{viewClient.whatsapp}</p></div>}
              </div>
              {viewClient.email && <div><p className="text-muted-foreground text-xs">E-mail</p><p>{viewClient.email}</p></div>}
              {viewClient.address && <div><p className="text-muted-foreground text-xs">Endereço</p><p>{viewClient.address}</p></div>}
              {viewClient.notes && <div><p className="text-muted-foreground text-xs">Observações</p><p className="text-muted-foreground italic">{viewClient.notes}</p></div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Fechar</Button>
            {viewClient && (
              <Button onClick={() => { setViewDialogOpen(false); navigate(`/cadastros/clientes/${viewClient.id}/imoveis`); }}>Ver Imóveis</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir locador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.full_name}</strong>? Esta ação não pode ser desfeita.
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
