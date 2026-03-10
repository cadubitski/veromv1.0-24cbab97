import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ActionGear } from "@/components/TableActions";
import { Loader2, Plus, Search, Pencil, Trash2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface DocumentTemplate {
  id: string;
  company_id: string;
  nome_modelo: string;
  descricao: string | null;
  conteudo_markdown: string;
  entidades_utilizadas: string[];
  created_at: string;
  updated_at: string;
}

export default function ModelosDocumentos() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("document_templates")
      .select("*")
      .order("created_at", { ascending: false });
    setTemplates((data as DocumentTemplate[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.nome_modelo.toLowerCase().includes(q) ||
      (t.descricao ?? "").toLowerCase().includes(q)
    );
  });

  const handleDuplicate = async (t: DocumentTemplate) => {
    if (!company?.id) return;
    const { error } = await supabase.from("document_templates").insert({
      company_id: company.id,
      nome_modelo: `${t.nome_modelo} (cópia)`,
      descricao: t.descricao,
      conteudo_markdown: t.conteudo_markdown,
      entidades_utilizadas: t.entidades_utilizadas,
    });
    if (error) { toast.error("Erro ao duplicar modelo."); return; }
    toast.success("Modelo duplicado com sucesso.");
    loadTemplates();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("document_templates").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Erro ao excluir modelo."); }
    else { toast.success("Modelo excluído."); loadTemplates(); }
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Modelos de Documentos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crie e gerencie modelos de contratos, recibos e declarações.
            </p>
          </div>
          <Button onClick={() => navigate("/documentos/modelos/novo")} className="gap-2">
            <Plus className="h-4 w-4" /> Incluir Modelo
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar modelos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="card-premium rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40">
                <TableHead>Nome do Modelo</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead className="hidden lg:table-cell">Entidades</TableHead>
                <TableHead className="hidden md:table-cell">Criado em</TableHead>
                <TableHead className="text-right w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                    {search ? "Nenhum modelo encontrado." : "Nenhum modelo cadastrado ainda. Clique em \"Incluir Modelo\" para começar."}
                  </TableCell>
                </TableRow>
              ) : filtered.map((t) => (
                <TableRow key={t.id} className="border-border/40 hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{t.nome_modelo}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-xs truncate">
                    {t.descricao ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {t.entidades_utilizadas.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.entidades_utilizadas.map((e) => (
                          <span key={e} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground capitalize">
                            {e}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm whitespace-nowrap">
                    {format(parseISO(t.created_at), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionGear
                      legendKeys={[]}
                      actions={[
                        {
                          label: "Editar",
                          icon: <Pencil className="h-3.5 w-3.5" />,
                          onClick: () => navigate(`/documentos/modelos/${t.id}`),
                        },
                        {
                          label: "Duplicar",
                          icon: <Copy className="h-3.5 w-3.5" />,
                          onClick: () => handleDuplicate(t),
                        },
                        {
                          label: "Excluir",
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          onClick: () => setDeleteTarget(t),
                          variant: "destructive",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o modelo <strong>{deleteTarget?.nome_modelo}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
