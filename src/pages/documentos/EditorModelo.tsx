import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, ChevronLeft, Plus, X, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Entity definitions ────────────────────────────────────────────────────────

interface EntityField {
  key: string;
  label: string;
  tag: string;
}

interface EntityDef {
  key: string;
  label: string;
  fields: EntityField[];
}

const AVAILABLE_ENTITIES: EntityDef[] = [
  {
    key: "contrato",
    label: "Contrato",
    fields: [
      { key: "codigo", label: "Código", tag: "{{contrato.codigo}}" },
      { key: "valor_aluguel", label: "Valor do Aluguel", tag: "{{contrato.valor_aluguel}}" },
      { key: "data_inicio", label: "Data de Início", tag: "{{contrato.data_inicio}}" },
      { key: "dia_vencimento", label: "Dia de Vencimento", tag: "{{contrato.dia_vencimento}}" },
      { key: "duracao_meses", label: "Duração (meses)", tag: "{{contrato.duracao_meses}}" },
      { key: "taxa_administracao", label: "Taxa de Administração (%)", tag: "{{contrato.taxa_administracao}}" },
      { key: "valor_taxa", label: "Valor da Taxa", tag: "{{contrato.valor_taxa}}" },
      { key: "valor_repasse", label: "Valor do Repasse", tag: "{{contrato.valor_repasse}}" },
      { key: "status", label: "Status", tag: "{{contrato.status}}" },
    ],
  },
  {
    key: "locatario",
    label: "Locatário",
    fields: [
      { key: "nome", label: "Nome Completo", tag: "{{locatario.nome}}" },
      { key: "documento", label: "CPF/CNPJ", tag: "{{locatario.documento}}" },
      { key: "email", label: "E-mail", tag: "{{locatario.email}}" },
      { key: "telefone", label: "Telefone", tag: "{{locatario.telefone}}" },
      { key: "whatsapp", label: "WhatsApp", tag: "{{locatario.whatsapp}}" },
      { key: "endereco", label: "Endereço", tag: "{{locatario.endereco}}" },
    ],
  },
  {
    key: "locador",
    label: "Locador (Proprietário)",
    fields: [
      { key: "nome", label: "Nome Completo", tag: "{{locador.nome}}" },
      { key: "documento", label: "CPF/CNPJ", tag: "{{locador.documento}}" },
      { key: "email", label: "E-mail", tag: "{{locador.email}}" },
      { key: "telefone", label: "Telefone", tag: "{{locador.telefone}}" },
      { key: "whatsapp", label: "WhatsApp", tag: "{{locador.whatsapp}}" },
      { key: "endereco", label: "Endereço", tag: "{{locador.endereco}}" },
    ],
  },
  {
    key: "imovel",
    label: "Imóvel",
    fields: [
      { key: "codigo", label: "Código", tag: "{{imovel.codigo}}" },
      { key: "endereco", label: "Endereço", tag: "{{imovel.endereco}}" },
      { key: "tipo", label: "Tipo do Imóvel", tag: "{{imovel.tipo}}" },
      { key: "area_m2", label: "Área (m²)", tag: "{{imovel.area_m2}}" },
      { key: "matricula", label: "Matrícula", tag: "{{imovel.matricula}}" },
      { key: "inscricao_municipal", label: "Inscrição Municipal", tag: "{{imovel.inscricao_municipal}}" },
      { key: "valor_aluguel", label: "Valor do Aluguel", tag: "{{imovel.valor_aluguel}}" },
    ],
  },
  {
    key: "imobiliaria",
    label: "Imobiliária",
    fields: [
      { key: "nome", label: "Nome", tag: "{{imobiliaria.nome}}" },
      { key: "cnpj", label: "CNPJ", tag: "{{imobiliaria.cnpj}}" },
      { key: "email", label: "E-mail", tag: "{{imobiliaria.email}}" },
      { key: "telefone", label: "Telefone", tag: "{{imobiliaria.telefone}}" },
      { key: "endereco", label: "Endereço", tag: "{{imobiliaria.endereco}}" },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditorModelo() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "novo";
  const navigate = useNavigate();
  const { company } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome_modelo: "",
    descricao: "",
    conteudo_markdown: "",
  });
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [expandedEntities, setExpandedEntities] = useState<string[]>([]);

  useEffect(() => {
    if (!isNew && id) {
      supabase
        .from("document_templates")
        .select("*")
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data) {
            setForm({
              nome_modelo: data.nome_modelo,
              descricao: data.descricao ?? "",
              conteudo_markdown: data.conteudo_markdown,
            });
            const entities = (data.entidades_utilizadas as string[]) ?? [];
            setSelectedEntities(entities);
            setExpandedEntities(entities);
          }
          setLoading(false);
        });
    }
  }, [id, isNew]);

  const toggleEntity = (key: string) => {
    setSelectedEntities((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]
    );
    setExpandedEntities((prev) =>
      prev.includes(key) ? prev : [...prev, key]
    );
  };

  const toggleExpand = (key: string) => {
    setExpandedEntities((prev) =>
      prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]
    );
  };

  const insertTag = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = form.conteudo_markdown;
    const newContent = content.slice(0, start) + tag + content.slice(end);
    setForm((p) => ({ ...p, conteudo_markdown: newContent }));
    // Restore cursor after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    toast.success("Tag copiada!");
  };

  const handleSave = async () => {
    if (!form.nome_modelo.trim()) {
      toast.error("Informe o nome do modelo.");
      return;
    }
    if (!company?.id) return;
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from("document_templates").insert({
          company_id: company.id,
          nome_modelo: form.nome_modelo.trim(),
          descricao: form.descricao.trim() || null,
          conteudo_markdown: form.conteudo_markdown,
          entidades_utilizadas: selectedEntities,
        });
        if (error) throw error;
        toast.success("Modelo criado com sucesso.");
      } else {
        const { error } = await supabase
          .from("document_templates")
          .update({
            nome_modelo: form.nome_modelo.trim(),
            descricao: form.descricao.trim() || null,
            conteudo_markdown: form.conteudo_markdown,
            entidades_utilizadas: selectedEntities,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id!);
        if (error) throw error;
        toast.success("Modelo atualizado com sucesso.");
      }
      navigate("/documentos/modelos");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar modelo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const activeEntities = AVAILABLE_ENTITIES.filter((e) => selectedEntities.includes(e.key));

  return (
    <DashboardLayout>
      <div className="space-y-4 h-full">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documentos/modelos")} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              {isNew ? "Novo Modelo" : "Editar Modelo"}
            </h1>
            <p className="text-xs text-muted-foreground">
              Use as tags{" "}
              <code className="bg-muted px-1 rounded text-xs">{"{{entidade.campo}}"}</code>{" "}
              para inserir dados dinâmicos.
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Modelo
          </Button>
        </div>

        {/* Meta fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome do modelo *</label>
            <Input
              value={form.nome_modelo}
              onChange={(e) => setForm((p) => ({ ...p, nome_modelo: e.target.value }))}
              placeholder="Ex: Contrato de Locação Residencial"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descrição</label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              placeholder="Breve descrição do uso deste modelo"
            />
          </div>
        </div>

        {/* Editor layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4" style={{ minHeight: "500px" }}>
          {/* Main editor */}
          <div className="space-y-2 flex flex-col">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Conteúdo do documento</label>
              <span className="text-xs text-muted-foreground">Suporta Markdown</span>
            </div>
            <Textarea
              ref={textareaRef}
              value={form.conteudo_markdown}
              onChange={(e) => setForm((p) => ({ ...p, conteudo_markdown: e.target.value }))}
              className="flex-1 font-mono text-sm resize-none min-h-[460px] leading-relaxed"
              placeholder={`# Contrato de Locação\n\nEu, **{{locatario.nome}}**, portador do documento **{{locatario.documento}}**, declaro que...\n\nImóvel: **{{imovel.codigo}}** — {{imovel.endereco}}\n\nValor do aluguel: R$ {{contrato.valor_aluguel}}\nVencimento: Dia {{contrato.dia_vencimento}} de cada mês\n\nAssinatura: ___________________________`}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">Entidades disponíveis</p>
              <p className="text-xs text-muted-foreground mb-3">
                Marque as entidades que deseja usar. Clique em um campo para inserir a tag no editor.
              </p>
              <div className="space-y-1.5">
                {AVAILABLE_ENTITIES.map((entity) => {
                  const isSelected = selectedEntities.includes(entity.key);
                  const isExpanded = expandedEntities.includes(entity.key);
                  return (
                    <div key={entity.key} className={cn(
                      "rounded-lg border transition-colors",
                      isSelected ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/20"
                    )}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEntity(entity.key)}
                          className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                        />
                        <button
                          className="flex-1 flex items-center justify-between text-sm font-medium text-left"
                          onClick={() => toggleExpand(entity.key)}
                        >
                          <span>{entity.label}</span>
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                            : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border/30 px-2 py-1 space-y-0.5">
                          {entity.fields.map((field) => (
                            <div
                              key={field.key}
                              className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50 group cursor-pointer"
                              title={`Clique para inserir: ${field.tag}`}
                              onClick={() => insertTag(field.tag)}
                            >
                              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate flex-1">
                                {field.label}
                              </span>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  title="Copiar tag"
                                  onClick={(e) => { e.stopPropagation(); copyTag(field.tag); }}
                                  className="p-0.5 rounded hover:bg-muted"
                                >
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <Plus className="h-3 w-3 text-primary" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick reference */}
            {activeEntities.length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <p className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Tags selecionadas</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {activeEntities.flatMap((e) =>
                    e.fields.map((f) => (
                      <button
                        key={f.tag}
                        className="block w-full text-left text-xs font-mono text-primary/80 hover:text-primary px-1 py-0.5 rounded hover:bg-muted transition-colors truncate"
                        onClick={() => insertTag(f.tag)}
                        title={`Inserir: ${f.tag}`}
                      >
                        {f.tag}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dicas Markdown</p>
              {[
                ["**negrito**", "Texto em negrito"],
                ["# Título", "Título grande"],
                ["## Subtítulo", "Subtítulo"],
                ["- item", "Lista"],
                ["---", "Linha separadora"],
              ].map(([syntax, desc]) => (
                <div key={syntax} className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-1 rounded shrink-0">{syntax}</code>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
