-- Migration 035: Notificações multi-canal (e-mail + Slack)
--
-- Phase 5 Plan 1 — fundação para envio de e-mail via Resend + log unificado de
-- notificações. Cobre EMAIL-01 (parcial: schema/RLS de preferências), EMAIL-02
-- (helper sendEmail em Plan 2 depende deste schema), EMAIL-03 (parcial:
-- notify-tarefa em Task 3 deste plano).
--
-- Conteúdo:
--   1. Coluna perfis.preferencias_notif (jsonb) com default seguro
--   2. Tabela notificacoes_envios (histórico unificado e-mail + Slack)
--   3. Índice parcial de idempotência (reenvios ficam fora — sempre criam linha)
--   4. Índices auxiliares (quota / perfil / resend lookup)
--   5. Helper SQL is_at_least(role) — primeira ocorrência no schema
--   6. RLS em notificacoes_envios — SELECT próprio OU coord+ via is_at_least
--      (INSERT/UPDATE só via service_role nas Edge Functions — sem policy
--       permissiva propositadamente, conforme R6 do RESEARCH)
--   7. RPC quota_resend_atual() — retorna { hoje, mes } para checagem pré-envio
--   8. Atualização do trigger handle_new_user (smart default condicional ao
--      slack_user_id, conforme D-04)
--   9. Backfill de perfis existentes (mesma regra do smart default)
--
-- ⚠️ INSERT/UPDATE em notificacoes_envios feitos APENAS via service_role
-- (Edge Functions). Sem policy permissiva propositadamente (R6 do RESEARCH).

-- ─── 1. perfis.preferencias_notif ────────────────────────────────────────────

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS preferencias_notif jsonb NOT NULL DEFAULT jsonb_build_object(
    'tarefa',    jsonb_build_object('slack', false, 'email', true),
    'cadencia',  jsonb_build_object('slack', false, 'email', true),
    'renovacao', jsonb_build_object('slack', false, 'email', true),
    'indicacao', jsonb_build_object('slack', false, 'email', true)
  );

-- ─── 2. Tabela notificacoes_envios ───────────────────────────────────────────
-- CREATE TABLE notificacoes_envios (canonical declaration — wrapped IF NOT
-- EXISTS for re-run safety without changing the schema fingerprint).

CREATE TABLE IF NOT EXISTS notificacoes_envios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id       uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao')),
  entidade_id     uuid,
  entidade_tipo   text CHECK (entidade_tipo IN ('lead','cliente','contrato','tarefa') OR entidade_tipo IS NULL),
  canal           text NOT NULL CHECK (canal IN ('email','slack')),
  subject         text,
  status          text NOT NULL CHECK (status IN (
                    'queued','delivered','opened','bounced','complained',
                    'dropped_quota','skipped_no_recipient','fallback_diretor','failed'
                  )),
  resend_id       text,
  slack_ts        text,
  error_msg       text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  opened_at       timestamptz,
  bounced_at      timestamptz,
  complained_at   timestamptz,
  reenviado_por_id uuid REFERENCES perfis(id),
  reenviado_em    timestamptz,
  -- IMMUTABLE cast via timezone(text, timestamptz) — direto `sent_at::date`
  -- não é immutable (depende de TimeZone session var) e Postgres rejeita em
  -- GENERATED column (erro 42P17). Fixamos UTC para consistência com pg_cron.
  dia             date GENERATED ALWAYS AS ((timezone('UTC', sent_at))::date) STORED
);

-- ─── 3. Índice parcial de idempotência ───────────────────────────────────────
-- COALESCE evita o pitfall do NULL em UNIQUE (Pitfall 4); WHERE
-- reenviado_por_id IS NULL deixa reenvios fora do índice (R8) — sempre criam
-- nova linha (audit trail).
CREATE UNIQUE INDEX IF NOT EXISTS notif_envios_unique_idempotency
  ON notificacoes_envios (
    perfil_id,
    tipo,
    canal,
    dia,
    COALESCE(entidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE reenviado_por_id IS NULL;

-- ─── 4. Índices auxiliares ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notif_envios_quota
  ON notificacoes_envios (canal, dia, status);

CREATE INDEX IF NOT EXISTS idx_notif_envios_perfil_sent
  ON notificacoes_envios (perfil_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_envios_resend
  ON notificacoes_envios (resend_id) WHERE resend_id IS NOT NULL;

-- ─── 5. Helper SQL is_at_least(role) ─────────────────────────────────────────
-- Hierarquia: diretor > gerente > coordenador > consultor. Primeira ocorrência
-- no schema (referenciada pelo PLAN.md mas ainda não existia — adicionada aqui
-- como pré-requisito do RLS de notificacoes_envios).
CREATE OR REPLACE FUNCTION public.is_at_least(min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH r AS (
    SELECT CASE current_role_consej()
      WHEN 'diretor'     THEN 4
      WHEN 'gerente'     THEN 3
      WHEN 'coordenador' THEN 2
      WHEN 'consultor'   THEN 1
      ELSE 0
    END AS lvl
  ),
  m AS (
    SELECT CASE min_role
      WHEN 'diretor'     THEN 4
      WHEN 'gerente'     THEN 3
      WHEN 'coordenador' THEN 2
      WHEN 'consultor'   THEN 1
      ELSE 0
    END AS lvl
  )
  SELECT (SELECT lvl FROM r) >= (SELECT lvl FROM m)
$$;

GRANT EXECUTE ON FUNCTION public.is_at_least(text) TO authenticated;

-- ─── 6. RLS em notificacoes_envios ───────────────────────────────────────────
ALTER TABLE notificacoes_envios ENABLE ROW LEVEL SECURITY;

-- INSERT/UPDATE feitos APENAS via service_role (Edge Functions).
-- Sem policy permissiva propositadamente (R6 do RESEARCH).
DROP POLICY IF EXISTS notif_envios_read ON notificacoes_envios;
CREATE POLICY notif_envios_read ON notificacoes_envios
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));

-- ─── 7. RPC quota_resend_atual ───────────────────────────────────────────────
-- Conta apenas envios que "consumiram quota Resend" — dropados/skipped não
-- chegaram a chamar a API e portanto não contam (Q8 do RESEARCH).
CREATE OR REPLACE FUNCTION public.quota_resend_atual()
RETURNS TABLE (hoje int, mes int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT count(*)::int FROM notificacoes_envios
       WHERE canal = 'email'
         AND dia = CURRENT_DATE
         AND status NOT IN ('dropped_quota','skipped_no_recipient','fallback_diretor')
    ) AS hoje,
    (
      SELECT count(*)::int FROM notificacoes_envios
       WHERE canal = 'email'
         AND dia >= date_trunc('month', CURRENT_DATE)::date
         AND status NOT IN ('dropped_quota','skipped_no_recipient','fallback_diretor')
    ) AS mes
$$;

GRANT EXECUTE ON FUNCTION public.quota_resend_atual() TO authenticated;

-- ─── 8. Atualizar trigger handle_new_user com smart default (D-04) ───────────
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
  -- antes do INSERT (cenário comum: backfill manual de slack_user_id já feito).
  -- Em fluxo normal de signup, slack_user_id é NULL → Slack=OFF.
  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',    jsonb_build_object('slack', has_slack, 'email', true),
       'cadencia',  jsonb_build_object('slack', has_slack, 'email', true),
       'renovacao', jsonb_build_object('slack', has_slack, 'email', true),
       'indicacao', jsonb_build_object('slack', has_slack, 'email', true)
     )
   WHERE id = new.id;

  RETURN new;
END;
$$;

-- ─── 9. Backfill de perfis existentes ────────────────────────────────────────
-- Mesma regra do smart default — perfis com slack_user_id ganham Slack=ON,
-- resto fica com Slack=OFF (default seguro). E-mail sempre ON (D-04).
UPDATE perfis
   SET preferencias_notif = jsonb_build_object(
     'tarefa',    jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
     'cadencia',  jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
     'renovacao', jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
     'indicacao', jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true)
   );
