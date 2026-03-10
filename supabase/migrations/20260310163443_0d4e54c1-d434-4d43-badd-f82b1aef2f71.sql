
-- Create document_templates table
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome_modelo TEXT NOT NULL,
  descricao TEXT,
  conteudo_markdown TEXT NOT NULL DEFAULT '',
  entidades_utilizadas JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view templates of their company"
  ON public.document_templates FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users insert templates for their company"
  ON public.document_templates FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users update templates of their company"
  ON public.document_templates FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins delete templates of their company"
  ON public.document_templates FOR DELETE
  USING (company_id = get_user_company_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
