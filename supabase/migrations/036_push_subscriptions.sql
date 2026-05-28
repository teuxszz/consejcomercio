-- Migration 036: Push Subscriptions + canal 'push' — Phase 6 fundação para
-- Web Push notifications (D-01, D-08, D-15).
--
-- Conteúdo:
--   1. Tabela push_subscriptions (multi-device 1:N, UNIQUE perfil_id+endpoint)
--   2. RLS role-aware espelhando pattern Phase 5 (4 policies)
--   3. ALTER CHECK notificacoes_envios.canal incluindo 'push' (D-08)
--   4. CREATE OR REPLACE handle_new_user — preserva lookup `slack_user_id IS
--      NOT NULL INTO has_slack` da migration 035 (anti-regressão D-04 Phase 5)
--      e adiciona `push: false` em cada um dos 4 tipos.
--   5. Backfill idempotente — `jsonb_set` aninhado adiciona push:false em
--      perfis existentes sem destruir slack/email.
--
-- ⚠️ INSERT/UPDATE em push_subscriptions feitos via cliente authenticated (RLS);
-- DELETE em 410 via service_role nas edge functions (bypassa RLS legitimamente
-- para cleanup, D-02).

-- ─── 1. Tabela push_subscriptions (D-01) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id     uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_perfil ON push_subscriptions (perfil_id);

-- ─── 2. RLS (mirror padrão Phase 5 — migration 035 linhas 130-133 + 029) ─────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê só as suas; coord+ vê todas (debug operacional)
DROP POLICY IF EXISTS push_subs_select ON push_subscriptions;
CREATE POLICY push_subs_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));

-- INSERT: usuário insere só para si (subscribe flow do D-12)
DROP POLICY IF EXISTS push_subs_insert ON push_subscriptions;
CREATE POLICY push_subs_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (perfil_id = auth.uid());

-- UPDATE: usuário atualiza só as suas — necessário para upsert ON CONFLICT
-- atualizar last_seen_at (Pitfall 7)
DROP POLICY IF EXISTS push_subs_update ON push_subscriptions;
CREATE POLICY push_subs_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (perfil_id = auth.uid())
  WITH CHECK (perfil_id = auth.uid());

-- DELETE: usuário pode unsubscribe; service_role nas edge functions bypassa
-- RLS para cleanup 410/404 (D-02)
DROP POLICY IF EXISTS push_subs_delete ON push_subscriptions;
CREATE POLICY push_subs_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (perfil_id = auth.uid());

-- ─── 3. ALTER CHECK notificacoes_envios.canal (D-08) ─────────────────────────
-- Postgres não suporta ALTER CONSTRAINT CHECK para mudar expressão — pattern
-- canônico é DROP + ADD no mesmo statement transacional.
ALTER TABLE notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_canal_check;
ALTER TABLE notificacoes_envios
  ADD CONSTRAINT notificacoes_envios_canal_check
  CHECK (canal IN ('email','slack','push'));

-- ─── 4. Atualiza handle_new_user (D-04, D-15) ────────────────────────────────
-- Corpo copiado LITERALMENTE de migration 035 linhas 163-199 — só adicionada
-- a chave 'push' em cada jsonb_build_object do default.
-- ⚠️ Anti-regressão D-04 Phase 5: o lookup `SELECT slack_user_id IS NOT NULL
-- INTO has_slack` (linha ~885) DEVE ser preservado — sem ele o smart-default
-- condicional de Slack regride. NÃO copiar de 011_auto_profile_trigger.sql
-- (versão antiga sem esse lookup).
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
  -- ⚠️ ESTA LINHA herdada de migration 035 — não remover (anti-regressão D-04).
  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',    jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'cadencia',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'renovacao', jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'indicacao', jsonb_build_object('slack', has_slack, 'email', true, 'push', false)
     )
   WHERE id = new.id;

  RETURN new;
END;
$$;

-- Trigger on_auth_user_created continua apontando para handle_new_user() —
-- CREATE OR REPLACE FUNCTION não requer DROP TRIGGER.

-- ─── 5. Backfill perfis existentes (D-15) ────────────────────────────────────
-- jsonb_set aninhado adiciona push: false em cada um dos 4 tipos sem destruir
-- slack/email originais. Backfill idempotente — re-run safe via cláusula WHERE
-- que só executa em perfis ainda sem a chave push.
UPDATE perfis
   SET preferencias_notif =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(preferencias_notif,
               '{tarefa,push}', 'false'::jsonb, true),
             '{cadencia,push}', 'false'::jsonb, true),
           '{renovacao,push}', 'false'::jsonb, true),
         '{indicacao,push}', 'false'::jsonb, true)
 WHERE NOT (preferencias_notif #> '{tarefa,push}') IS NOT NULL;
