
ALTER TABLE public.accounts_receivable
  ADD COLUMN document_number text NOT NULL DEFAULT '';

ALTER TABLE public.accounts_receivable
  ALTER COLUMN document_number DROP DEFAULT;

CREATE UNIQUE INDEX accounts_receivable_document_number_key
  ON public.accounts_receivable (document_number);
