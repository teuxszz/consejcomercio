-- Migration 038: pg_cron + trigger functions para aprovações de cliente_docs.
-- Phase 7 — Client Portal Expansion (Slice 2 — backend notif multi-canal).
--
-- Conteúdo:
--   1. Function public.cliente_docs_after_change() — chamada por 2 triggers
--      (INSERT + UPDATE) para eventos a (cliente_aprovou), b
--      (cliente_pediu_revisao), c (cliente_subiu_doc).
--      Pitfall §4 RESEARCH: 2 triggers separadas porque OLD não existe em
--      INSERT — uma única trigger AFTER INSERT OR UPDATE quebraria a
--      comparação `OLD.status IS DISTINCT FROM NEW.status`.
--   2. 2 CREATE TRIGGER em cliente_docs (after_insert + after_update).
--   3. Function public.cron_disparar_aprovacoes_stale() — loop sobre docs
--      pending > N dias e chama notify-aprovacoes-stale.
--   4. cron.schedule '0 11 * * *' = 11:00 UTC = 08:00 BRT (1h depois do
--      resumo-diario 10:00 UTC).
--
-- O secret Bearer (webhook_aprovacao_secret) NÃO fica neste arquivo — foi
-- gravado no Vault no Slice 1 (07-01a-1):
--   SELECT vault.create_secret('<hex>', 'webhook_aprovacao_secret', '...');
-- Sem o secret, ambas as funções emitem RAISE WARNING e retornam sem chamar
-- pg_net (não EXCEPTION — evita rollback do trigger/cron).
--
-- Threats mitigadas:
--   T-07-10 Injection: comentario_cliente vai como jsonb parametrizado
--           (jsonb_build_object), nunca concatenado em string.
--   T-07-12 Information Disclosure: Vault secret lookup via
--           vault.decrypted_secrets — secret nunca aparece em log SQL.
--   T-07-13 Tampering: trigger só dispara em status 'aprovado' ou
--           'revisao_solicitada' (CASE explícito). 'superseded' ignora.

-- ─── Extensões ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 1. Trigger function (eventos a/b/c) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cliente_docs_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret       TEXT;
  v_url          TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-aprovacao-evento';
  v_evento       TEXT;
  v_responsavel  UUID;
  v_cliente_nome TEXT;
BEGIN
  -- Decide qual evento disparou (T-07-13: apenas status que importam)
  IF TG_OP = 'INSERT' AND NEW.autor_tipo = 'cliente' THEN
    v_evento := 'cliente_subiu_doc';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'aprovado'
        AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    v_evento := 'cliente_aprovou';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'revisao_solicitada'
        AND OLD.status IS DISTINCT FROM 'revisao_solicitada' THEN
    v_evento := 'cliente_pediu_revisao';
  ELSE
    -- INSERT de interno (sem evento), UPDATE de campos não-status, status
    -- 'superseded' (T-07-13), ou status já estava no valor target.
    RETURN NEW;
  END IF;

  -- Resolve consultor responsável pelo cliente
  SELECT responsavel_id, nome
    INTO v_responsavel, v_cliente_nome
    FROM clientes
   WHERE id = NEW.cliente_id;

  IF v_responsavel IS NULL THEN
    -- Sem responsável → silencioso (notif sem destinatário não faz sentido)
    RETURN NEW;
  END IF;

  -- Vault secret lookup (T-07-12 mitigation — pattern migration 031/034)
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_aprovacao_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cliente_docs_after_change: secret webhook_aprovacao_secret ausente no Vault';
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP POST (pg_net assíncrono — Pitfall §5 RESEARCH).
  -- T-07-10 mitigation: comentario_cliente vai como jsonb_build_object,
  -- não concatenado em string. Postgres parametriza automaticamente.
  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'evento',                  v_evento,
                 'doc_id',                  NEW.id,
                 'cliente_id',              NEW.cliente_id,
                 'destinatario_perfil_id',  v_responsavel,
                 'comentario_cliente',      NEW.comentario_cliente
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               )
  );

  RETURN NEW;
END;
$$;

-- ─── 2. Triggers (Pitfall §4: separadas para INSERT vs UPDATE) ───────────────
DROP TRIGGER IF EXISTS trg_cliente_docs_after_insert ON public.cliente_docs;
CREATE TRIGGER trg_cliente_docs_after_insert
  AFTER INSERT ON public.cliente_docs
  FOR EACH ROW EXECUTE FUNCTION public.cliente_docs_after_change();

DROP TRIGGER IF EXISTS trg_cliente_docs_after_update ON public.cliente_docs;
CREATE TRIGGER trg_cliente_docs_after_update
  AFTER UPDATE ON public.cliente_docs
  FOR EACH ROW EXECUTE FUNCTION public.cliente_docs_after_change();

-- ─── 3. Cron function (evento d — aprovacao_stale) ───────────────────────────
CREATE OR REPLACE FUNCTION public.cron_disparar_aprovacoes_stale()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret       TEXT;
  v_url          TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-aprovacoes-stale';
  v_dias         INT;
  d              RECORD;
BEGIN
  -- Ler threshold dias_para_aprovacao_pendente de configuracoes.metas (D-13).
  -- Default 5 se chave ausente (defesa em profundidade — Slice 1 já populou).
  SELECT COALESCE(
           (metas->>'dias_para_aprovacao_pendente')::int,
           5
         )
    INTO v_dias
    FROM configuracoes
   WHERE id = 'default';

  IF v_dias IS NULL THEN
    v_dias := 5;
  END IF;

  -- Ler secret do Vault (T-07-12)
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_aprovacao_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_disparar_aprovacoes_stale: secret webhook_aprovacao_secret ausente no Vault';
    RETURN;
  END IF;

  -- Loop sobre docs pending > N dias, ainda sem notif hoje.
  -- Idempotência: notificacoes_envios UNIQUE (perfil_id, tipo, canal, dia,
  -- entidade_id=doc_id) — edge function falha gracioso em 23505.
  FOR d IN
    SELECT cd.id              AS doc_id,
           cd.cliente_id      AS cliente_id,
           cd.nome_arquivo    AS nome_arquivo,
           c.responsavel_id   AS destinatario,
           c.nome             AS cliente_nome
      FROM cliente_docs cd
      JOIN clientes c ON c.id = cd.cliente_id
     WHERE cd.status = 'pending'
       AND cd.requer_aprovacao = true
       AND cd.deleted_at IS NULL
       AND cd.created_at < (now() - (v_dias || ' days')::interval)
       AND c.responsavel_id IS NOT NULL
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'doc_id',                  d.doc_id,
                   'cliente_id',              d.cliente_id,
                   'destinatario_perfil_id',  d.destinatario,
                   'cliente_nome',            d.cliente_nome,
                   'doc_nome_arquivo',        d.nome_arquivo
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_secret
                 )
    );
  END LOOP;
END;
$$;

-- ─── 4. Cron schedule ────────────────────────────────────────────────────────
-- 11:00 UTC = 08:00 BRT (1h depois do resumo-diario 10:00 UTC / 07:00 BRT).
-- cron.schedule com mesmo jobname é idempotente (atualiza se existir).
SELECT cron.schedule(
  'disparar-aprovacoes-stale',
  '0 11 * * *',
  'SELECT public.cron_disparar_aprovacoes_stale()'
);
