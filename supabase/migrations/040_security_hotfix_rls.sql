-- ============================================================================
-- 040 — SECURITY HOTFIX (RLS)
-- ============================================================================
-- Corrige as falhas encontradas na auditoria de 2026-07-13
-- (.planning/audit/REVIEW-RLS.md). Fecha 6 CRITICALs + 3 WARNINGs de alto
-- impacto. Aplicável de forma idempotente (DROP ... IF EXISTS / CREATE OR REPLACE).
--
-- Contexto: o browser fala DIRETO com o Supabase; RLS + RPCs SECURITY DEFINER
-- são a ÚNICA fronteira de autorização. Duas falhas (CR-01, CR-02) permitiam,
-- independentemente, que qualquer pessoa virasse 'interno'/'diretor' e lesse/
-- escrevesse todo o CRM.
--
-- ⚠️ AÇÕES FORA DO SQL (obrigatórias, ver rodapé):
--   1. Desabilitar signup público no Auth (fecha o passo 1 do CR-01).
--   2. Rodar a remediação de dados de perfis já criados como 'interno'.
--   3. Verificar bucket 'cliente-docs' e reconciliar migrations 017/018 (WR-06/07).
-- ============================================================================


-- ─── CR-01 — Todo novo usuário nasce tipo='interno' (regressão do trigger) ───
-- As migrations 035/036/037 recriaram handle_new_user copiando o corpo pré-
-- hardening (011) e omitiram `tipo`/`cliente_id` do INSERT → valia o DEFAULT
-- da coluna ('interno', 015:7). Restaura o hardening da 021 e trava o default.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_name TEXT;
  has_slack    BOOLEAN;
  desired_tipo TEXT;
BEGIN
  default_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'nome'), ''),
    REPLACE(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '), '_', ' '), '-', ' ')
  );

  -- Hardening 021: signup NUNCA cria 'interno' a partir de metadata do cliente.
  -- Interno é promovido depois, manualmente, por diretor (via UPDATE guardado
  -- pelo trigger de colunas abaixo).
  desired_tipo := COALESCE(new.raw_user_meta_data->>'tipo', 'cliente');
  IF desired_tipo <> 'cliente' THEN
    desired_tipo := 'cliente';
  END IF;

  INSERT INTO public.perfis (id, email, nome, tipo, cliente_id)
  VALUES (
    new.id,
    new.email,
    default_name,
    desired_tipo,
    NULLIF(new.raw_user_meta_data->>'cliente_id', '')::uuid
  )
  ON CONFLICT (id) DO NOTHING;

  -- Smart default de Slack preservado (anti-regressão D-04 Phase 5): só liga
  -- Slack se slack_user_id já estava populado antes do INSERT (fluxo normal = NULL).
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

-- Defesa em profundidade: se o INSERT do trigger voltar a omitir `tipo` no
-- futuro, o default seguro passa a ser 'cliente', nunca 'interno'.
ALTER TABLE public.perfis ALTER COLUMN tipo SET DEFAULT 'cliente';


-- ─── CR-02 — Auto-promoção via UPDATE em perfis (policy por linha, não coluna) ─
-- 004:21 permite o dono da linha atualizar o próprio perfil; quando 015/027
-- adicionaram `tipo`/`role`/`gestor_id`, essas colunas ficaram graváveis pelo
-- próprio usuário. Trigger BEFORE UPDATE congela as colunas de privilégio.

CREATE OR REPLACE FUNCTION public.protect_perfil_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER / service_role passam (handle_new_user, creditar_tokens_admin, etc.)
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo       IS DISTINCT FROM OLD.tipo
  OR NEW.role       IS DISTINCT FROM OLD.role
  OR NEW.gestor_id  IS DISTINCT FROM OLD.gestor_id
  OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
  OR NEW.id         IS DISTINCT FROM OLD.id THEN
    -- Só diretor altera privilégio de outros; nunca o próprio (evita auto-
    -- promoção mesmo de um diretor com sessão comprometida).
    IF NOT public.is_diretor() OR NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'colunas de privilegio (tipo/role/gestor_id/cliente_id) so podem ser alteradas por diretor, e nunca no proprio perfil'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_perfil_privilege_columns_trigger ON public.perfis;
CREATE TRIGGER protect_perfil_privilege_columns_trigger
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION public.protect_perfil_privilege_columns();

-- Fecha o self-INSERT: perfis são criados exclusivamente pelo trigger
-- on_auth_user_created (SECURITY DEFINER, bypassa RLS). Sem essa policy, um
-- usuário não pode inserir a própria linha com tipo='interno'.
DROP POLICY IF EXISTS "usuário gerencia próprio perfil" ON public.perfis;


-- ─── CR-03 — interacoes_lead com USING(true): cliente lê/apaga todo histórico ─
DROP POLICY IF EXISTS "authenticated_all" ON public.interacoes_lead;

CREATE POLICY "interno_role_aware_interacoes_lead" ON public.interacoes_lead
  FOR ALL TO authenticated
  USING (
    public.is_interno()
    AND EXISTS (SELECT 1 FROM public.leads l
                 WHERE l.id = interacoes_lead.lead_id
                   AND public.can_see_responsavel(l.responsavel_id))
  )
  WITH CHECK (
    public.is_interno()
    AND EXISTS (SELECT 1 FROM public.leads l
                 WHERE l.id = interacoes_lead.lead_id
                   AND public.can_see_responsavel(l.responsavel_id))
  );


-- ─── CR-04 — configuracoes com USING(true): qualquer autenticado zera o CRM ───
DROP POLICY IF EXISTS configuracoes_auth ON public.configuracoes;

CREATE POLICY "interno_select_configuracoes" ON public.configuracoes
  FOR SELECT TO authenticated USING (public.is_interno());

CREATE POLICY "gerente_update_configuracoes" ON public.configuracoes
  FOR UPDATE TO authenticated
  USING (public.is_at_least('gerente'))
  WITH CHECK (public.is_at_least('gerente'));
-- Sem INSERT/DELETE: a linha id='default' é única e imutável em identidade.


-- ─── CR-05 — pos_juniors com USING(true): PII de ex-membros exposta (LGPD) ────
DROP POLICY IF EXISTS pos_juniors_auth ON public.pos_juniors;

CREATE POLICY "interno_all_pos_juniors" ON public.pos_juniors
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());


-- ─── CR-06 — resgates: INSERT direto contorna a RPC (resgate sem débito) ──────
DROP POLICY IF EXISTS "cliente insere resgates" ON public.resgates;
-- INSERT em resgates passa a ser exclusivamente via solicitar_resgate_portal
-- (SECURITY DEFINER → bypassa RLS legitimamente, com débito atômico e
-- registro em token_transacoes).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'resgates_tokens_positivos'
  ) THEN
    ALTER TABLE public.resgates
      ADD CONSTRAINT resgates_tokens_positivos CHECK (tokens_debitados > 0);
  END IF;
END $$;


-- ─── WR-01 — 033 anulou o escopo por role em tarefas (policies somam com OR) ──
-- A 033 adicionou 4 policies com is_interno() puro sem dropar a role-aware da
-- 029; policies permissivas combinam com OR → escopo por role virou letra morta.
DROP POLICY IF EXISTS "interno_select_tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "interno_insert_tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "interno_update_tarefas" ON public.tarefas;
DROP POLICY IF EXISTS "interno_delete_tarefas" ON public.tarefas;
-- Mantém apenas interno_role_aware_tarefas (029:111), que já cobre FOR ALL
-- com o predicado de escopo correto.


-- ─── WR-04 — economia de tokens gravável por qualquer interno (consultor) ─────
-- regras_tokens e catalogo_recompensas liberavam FOR ALL a qualquer interno;
-- a RPC lê o valor "do servidor" — mas o servidor lia de tabela que o atacante
-- controlava. Restringe a gerente+.
DROP POLICY IF EXISTS "interno gerencia regras" ON public.regras_tokens;
CREATE POLICY "gerente_gerencia_regras" ON public.regras_tokens
  FOR ALL TO authenticated
  USING (public.is_at_least('gerente')) WITH CHECK (public.is_at_least('gerente'));

DROP POLICY IF EXISTS "interno gerencia catálogo" ON public.catalogo_recompensas;
CREATE POLICY "gerente_gerencia_catalogo" ON public.catalogo_recompensas
  FOR ALL TO authenticated
  USING (public.is_at_least('gerente')) WITH CHECK (public.is_at_least('gerente'));


-- ─── WR-03 — cliente_docs: cliente pode adulterar storage_path / soft-delete ──
-- O WITH CHECK do branch do cliente não congela as demais colunas. Trigger
-- restringe o cliente a alterar apenas status e comentario_cliente.
CREATE OR REPLACE FUNCTION public.protect_cliente_docs_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR public.is_interno() THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id       IS DISTINCT FROM OLD.cliente_id
  OR NEW.autor_id         IS DISTINCT FROM OLD.autor_id
  OR NEW.autor_tipo       IS DISTINCT FROM OLD.autor_tipo
  OR NEW.storage_path     IS DISTINCT FROM OLD.storage_path
  OR NEW.nome_arquivo     IS DISTINCT FROM OLD.nome_arquivo
  OR NEW.versao           IS DISTINCT FROM OLD.versao
  OR NEW.parent_doc_id    IS DISTINCT FROM OLD.parent_doc_id
  OR NEW.requer_aprovacao IS DISTINCT FROM OLD.requer_aprovacao
  OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'cliente so pode alterar status e comentario_cliente' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_cliente_docs_cols_trigger ON public.cliente_docs;
CREATE TRIGGER protect_cliente_docs_cols_trigger
  BEFORE UPDATE ON public.cliente_docs
  FOR EACH ROW EXECUTE FUNCTION public.protect_cliente_docs_cols();


-- ============================================================================
-- REMEDIAÇÃO DE DADOS + AÇÕES DE CONFIG (rodar manualmente após aplicar acima)
-- ============================================================================
-- 1. INSPECIONE perfis criados como 'interno' desde a regressão (035+):
--      SELECT id, email, tipo, role, cliente_id, created_at
--        FROM public.perfis WHERE tipo = 'interno' ORDER BY created_at DESC;
--    Rebaixe qualquer linha que não seja membro real da CONSEJ:
--      UPDATE public.perfis SET tipo = 'cliente', role = NULL WHERE id IN (...);
--
-- 2. Auditar resgates criados fora da RPC (sem débito correspondente):
--      SELECT r.* FROM public.resgates r
--       WHERE NOT EXISTS (SELECT 1 FROM public.token_transacoes t
--         WHERE t.referencia_tipo='resgate' AND t.referencia_id=r.id AND t.tipo='debito');
--
-- 3. Auth → Providers → Email: DESABILITAR "Allow new users to sign up".
--    O convite de cliente deve migrar de signInWithOtp (browser) para
--    supabase.auth.admin.inviteUserByEmail numa Edge Function (service_role).
--
-- 4. Verificar bucket cliente-docs (WR-06):
--      SELECT id, public FROM storage.buckets WHERE id = 'cliente-docs';
--    Se public = true → UPDATE storage.buckets SET public=false WHERE id='cliente-docs';
--
-- 5. Reconciliar migrations 017/018 ausentes (WR-07):
--      SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
-- ============================================================================
