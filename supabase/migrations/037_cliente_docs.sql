-- Migration 037: cliente_docs + RLS + JSONB extend + configuracoes.metas
-- Phase 7 — Client Portal Expansion (fluxo bidirecional de documentos).
--
-- Conteúdo:
--   1. Tabela cliente_docs (D-14) + 3 índices parciais (lookup por cliente,
--      pending-aprovação, versionamento parent_doc_id)
--   2. RLS 4 policies role-aware (D-14, D-04):
--        SELECT — cliente vê própria pasta; interno consultor vê dos seus; coord+ tudo
--        INSERT — cliente sobe próprio (autor_tipo='cliente', requer_aprovacao=false);
--                 interno sobe nos seus (responsavel ou coord+)
--        UPDATE — cliente só muda status para 'aprovado'/'revisao_solicitada' em docs
--                 com autor_tipo='interno' E requer_aprovacao=true (D-01);
--                 interno (responsavel/coord+) muda storage_path, deleted_at, status
--                 para 'superseded' (D-02 versionamento)
--        DELETE — DENY usuários comuns (service_role bypassa para auditoria)
--   3. ALTER CHECK notificacoes_envios.tipo incluindo 'documentos' (D-08)
--   4. CREATE OR REPLACE handle_new_user — preserva lookup
--      `slack_user_id IS NOT NULL INTO has_slack` (anti-regressão D-04 Phase 5)
--      e adiciona 5ª chave 'documentos' no jsonb_build_object, mantendo
--      `push: false` adicionado em 036.
--   5. Backfill idempotente — jsonb_set aninhado adiciona documentos:{slack,email,push}
--      em perfis existentes sem destruir tarefa/cadencia/renovacao/indicacao
--      (Pitfall §9 RESEARCH — assume slack:false conservador no backfill bulk)
--   6. UPDATE configuracoes.metas adicionando dias_para_aprovacao_pendente=5
--      (D-13 + RESEARCH Open Q1 RESOLVED — chave dentro JSONB metas, não coluna nova)
--
-- ⚠️ Bucket cliente-docs + storage.objects RLS + Vault secret webhook_aprovacao_secret
-- ficam FORA desta migration (limitação Supabase: exigem Dashboard/CLI). Aplicados
-- manualmente pelo gate `[BLOCKING SCHEMA PUSH]` do plan 07-01a (D-14, D-15).

-- ─── 1. Tabela cliente_docs (D-14) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cliente_docs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  autor_id           uuid NOT NULL REFERENCES public.perfis(id),
  autor_tipo         text NOT NULL CHECK (autor_tipo IN ('interno','cliente')),
  tag                text NOT NULL CHECK (tag IN ('proposta','contrato','relatorio','outro')),
  nome_arquivo       text NOT NULL,
  mime_type          text NOT NULL,
  tamanho_bytes      integer NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760),
  storage_path       text NOT NULL DEFAULT '',
  versao             integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  parent_doc_id      uuid REFERENCES public.cliente_docs(id),
  requer_aprovacao   boolean NOT NULL DEFAULT false,
  status             text CHECK (status IS NULL OR status IN ('pending','aprovado','revisao_solicitada','superseded')),
  comentario_cliente text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cliente_docs_cliente_id
  ON public.cliente_docs(cliente_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_docs_status_pending
  ON public.cliente_docs(status, created_at)
  WHERE status = 'pending' AND requer_aprovacao = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_docs_parent
  ON public.cliente_docs(parent_doc_id)
  WHERE parent_doc_id IS NOT NULL;

-- ─── 2. RLS 4 policies role-aware (D-14, D-04) ───────────────────────────────
ALTER TABLE public.cliente_docs ENABLE ROW LEVEL SECURITY;

-- SELECT: cliente vê só docs do próprio cliente_id (via perfis.cliente_id);
-- interno consultor vê dos clientes onde é responsavel; coord+ vê todos.
DROP POLICY IF EXISTS cliente_docs_select ON public.cliente_docs;
CREATE POLICY cliente_docs_select ON public.cliente_docs
  FOR SELECT TO authenticated
  USING (
    cliente_id = (SELECT cliente_id FROM public.perfis WHERE id = auth.uid())
    OR (public.is_interno() AND cliente_id IN (
      SELECT id FROM public.clientes WHERE responsavel_id = auth.uid()
    ))
    OR public.is_at_least('coordenador')
  );

-- INSERT: cliente sobe só na própria pasta com autor_tipo='cliente' E
-- requer_aprovacao=false (D-01 — cliente nunca marca próprio doc como aprovação).
-- Interno sobe nos clientes onde é responsavel OU coord+, com autor_tipo='interno'.
DROP POLICY IF EXISTS cliente_docs_insert ON public.cliente_docs;
CREATE POLICY cliente_docs_insert ON public.cliente_docs
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      -- cliente subindo próprio doc
      autor_tipo = 'cliente'
      AND autor_id = auth.uid()
      AND requer_aprovacao = false
      AND cliente_id = (SELECT cliente_id FROM public.perfis WHERE id = auth.uid())
    )
    OR
    (
      -- interno subindo doc para um cliente
      autor_tipo = 'interno'
      AND autor_id = auth.uid()
      AND public.is_interno()
      AND (
        cliente_id IN (SELECT id FROM public.clientes WHERE responsavel_id = auth.uid())
        OR public.is_at_least('coordenador')
      )
    )
  );

-- UPDATE: cliente só pode mudar status para 'aprovado'/'revisao_solicitada' em docs
-- com autor_tipo='interno' AND requer_aprovacao=true (D-01: cliente aprova doc do
-- consultor, nunca o próprio). Interno (responsavel/coord+) pode mudar storage_path,
-- deleted_at, status (incl. 'superseded' para versionamento D-02).
DROP POLICY IF EXISTS cliente_docs_update ON public.cliente_docs;
CREATE POLICY cliente_docs_update ON public.cliente_docs
  FOR UPDATE TO authenticated
  USING (
    -- linha alvo deve ser visível ao cliente (próprio cliente_id) OU
    -- ao interno responsavel/coord+
    cliente_id = (SELECT cliente_id FROM public.perfis WHERE id = auth.uid())
    OR (public.is_interno() AND cliente_id IN (
      SELECT id FROM public.clientes WHERE responsavel_id = auth.uid()
    ))
    OR public.is_at_least('coordenador')
  )
  WITH CHECK (
    (
      -- cliente aprovando/solicitando revisão de doc do consultor
      autor_tipo = 'interno'
      AND requer_aprovacao = true
      AND status IN ('aprovado','revisao_solicitada')
      AND cliente_id = (SELECT cliente_id FROM public.perfis WHERE id = auth.uid())
    )
    OR
    (
      -- interno editando (storage_path, deleted_at, status incl. 'superseded')
      public.is_interno()
      AND (
        cliente_id IN (SELECT id FROM public.clientes WHERE responsavel_id = auth.uid())
        OR public.is_at_least('coordenador')
      )
    )
  );

-- DELETE: DENY usuários comuns (soft delete via UPDATE deleted_at é o caminho normal;
-- service_role bypassa RLS para auditoria / cleanup).
DROP POLICY IF EXISTS cliente_docs_delete ON public.cliente_docs;
CREATE POLICY cliente_docs_delete ON public.cliente_docs
  FOR DELETE TO authenticated
  USING (false);

-- ─── 3. ALTER CHECK notificacoes_envios.tipo (D-08) ──────────────────────────
-- Postgres não suporta ALTER CONSTRAINT CHECK para mudar expressão — pattern
-- canônico é DROP + ADD no mesmo statement transacional (espelha 036:63-69).
ALTER TABLE public.notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_tipo_check;
ALTER TABLE public.notificacoes_envios
  ADD CONSTRAINT notificacoes_envios_tipo_check
  CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao','documentos'));

-- ─── 4. Atualiza handle_new_user (D-04, D-08, D-14) ──────────────────────────
-- Corpo copiado LITERALMENTE de migration 036 linhas 78-115 — só adicionada
-- a 5ª chave 'documentos' em jsonb_build_object (com push: false default).
-- ⚠️ Anti-regressão D-04 Phase 5: o lookup `SELECT slack_user_id IS NOT NULL
-- INTO has_slack` DEVE ser preservado — sem ele o smart-default condicional
-- de Slack regride. NÃO copiar de 011_auto_profile_trigger.sql (versão antiga).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_name TEXT;
  has_slack    BOOLEAN;
BEGIN
  default_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    REPLACE(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '), '_', ' '), '-', ' ')
  );

  INSERT INTO public.perfis (id, email, nome)
  VALUES (new.id, new.email, default_name)
  ON CONFLICT (id) DO NOTHING;

  -- Smart default condicional: Slack=ON apenas se slack_user_id já foi populado
  -- antes do INSERT. Em fluxo normal de signup, slack_user_id é NULL → Slack=OFF.
  -- ⚠️ ESTA LINHA herdada de migration 035/036 — não remover (anti-regressão D-04).
  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',     jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'cadencia',   jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'renovacao',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'indicacao',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'documentos', jsonb_build_object('slack', has_slack, 'email', true, 'push', false)
     )
   WHERE id = new.id;

  RETURN new;
END;
$$;

-- Trigger on_auth_user_created continua apontando para handle_new_user() —
-- CREATE OR REPLACE FUNCTION não requer DROP TRIGGER.

-- ─── 5. Backfill perfis existentes (D-14, D-08) ──────────────────────────────
-- jsonb_set aninhado adiciona documentos:{slack,email,push} sem destruir os 4
-- tipos pré-existentes. Backfill idempotente — re-run safe via cláusula WHERE
-- que só executa em perfis ainda sem a chave 'documentos'.
-- Smart default condicional não rola no backfill (não temos has_slack barato
-- em UPDATE bulk) — assume slack:false como conservador; usuários ajustam em
-- /me/preferencias.
UPDATE public.perfis
   SET preferencias_notif = jsonb_set(
         preferencias_notif,
         '{documentos}',
         jsonb_build_object('slack', false, 'email', true, 'push', false),
         true  -- create_if_missing
       )
 WHERE (preferencias_notif->'documentos') IS NULL;

-- ─── 6. UPDATE configuracoes.metas.dias_para_aprovacao_pendente (D-13) ───────
-- RESEARCH Open Q1 RESOLVED — chave dentro JSONB metas, não coluna nova.
-- Idempotente — só seta quando ainda ausente.
UPDATE public.configuracoes
   SET metas = jsonb_set(
         COALESCE(metas, '{}'::jsonb),
         '{dias_para_aprovacao_pendente}',
         '5'::jsonb,
         true
       )
 WHERE id = 'default'
   AND (metas->>'dias_para_aprovacao_pendente') IS NULL;
