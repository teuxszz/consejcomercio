-- Migration 034: Cron de resumo diário (NOTIF-02 + NOTIF-03)
--
-- Agenda um job diário que, para cada consultor interno com slack_user_id,
-- agrega tarefas vencendo hoje (NOTIF-02) e leads em D-point da cadência
-- (NOTIF-03) e chama a edge function notify-resumo-diario.
--
-- O segredo Bearer (WEBHOOK_RESUMO_SECRET) NÃO fica neste arquivo — é lido
-- do Supabase Vault em runtime. Para gravá-lo (uma vez, fora do git):
--   SELECT vault.create_secret('<secret>', 'webhook_resumo_secret', 'Bearer p/ notify-resumo-diario');
--
-- PRÉ-REQUISITO: criar o secret no Vault via SQL Editor ANTES de aplicar esta
-- migration. Sem o secret, a função retorna WARNING silencioso (não EXCEPTION)
-- e o pg_cron marca o job como success para evitar rollback do scheduler.
--
-- ─── Verificação de status 'stand_by' em produção ───────────────────────────
-- Consulta recomendada para verificar antes do deploy:
--   SELECT DISTINCT status FROM leads ORDER BY status;
--
-- DECISÃO (2026-05-26): 'stand_by' existe em PIPELINE_STAGES (src/lib/constants.ts)
-- mas NÃO em TERMINAL_STAGES. Porém, ACTIVE_LEAD_STAGES (constants.ts:28) já
-- exclui 'stand_by' explicitamente (decisão da diretoria CONSEJ — 2026).
-- Leads em stand_by estão pausados e não devem receber alerta de cadência.
-- Por isso, 'stand_by' é incluído no NOT IN (...) de ambos os branches do UNION ALL.
-- Alinhado com ACTIVE_LEAD_STAGES — embora não seja terminal por definição,
-- leads pausados não devem ser cobrados na cadência.

-- ─── Extensões ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Função disparadora ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_resumo_diario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret  TEXT;
  v_url     TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario';
  p         RECORD;
  v_tarefas INT;
  v_leads   JSONB;
BEGIN
  -- Ler secret do Vault (nunca hardcoded)
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_resumo_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_resumo_diario: secret webhook_resumo_secret ausente no Vault';
    RETURN;
  END IF;

  -- Iterar sobre cada perfil interno com slack_user_id mapeado
  FOR p IN
    SELECT id, slack_user_id
      FROM perfis
     WHERE tipo = 'interno'
       AND slack_user_id IS NOT NULL
  LOOP

    -- NOTIF-02: contar tarefas abertas/em_andamento vencendo hoje
    SELECT COUNT(*) INTO v_tarefas
      FROM tarefas
     WHERE atribuido_a_id = p.id
       AND status IN ('aberta', 'em_andamento')
       AND data_vencimento::date = CURRENT_DATE;

    -- NOTIF-03: agregar leads em D-point da cadência hoje
    -- UNION ALL resolve o Pitfall 1 (leads sem interação não aparecem com JOIN simples,
    -- pois NULL IN (1,3,5,7,10) é sempre false).
    -- NOT IN inclui 'stand_by' além dos TERMINAL_STAGES — leads pausados não recebem alerta.
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',      sub.id,
          'nome',    sub.nome,
          'd_point', sub.d_point
        )
      ),
      '[]'::jsonb
    ) INTO v_leads
    FROM (
      -- Branch 1: leads COM interação — conta dias desde última interação enviada
      SELECT
        l.id,
        l.nome,
        (CURRENT_DATE - MAX(i.enviada_em)::date)::int AS d_point
      FROM leads l
      JOIN interacoes_lead i ON i.lead_id = l.id
      WHERE l.responsavel_id = p.id
        AND l.status NOT IN (
          'ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado', 'stand_by'
        )
      GROUP BY l.id, l.nome
      HAVING (CURRENT_DATE - MAX(i.enviada_em)::date) IN (1, 3, 5, 7, 10)

      UNION ALL

      -- Branch 2: leads SEM interação — D1 se criado hoje (0) ou ontem (1)
      -- Espelha a lógica TS: getNextCadenciaPoint → daysUntil = dia(1) - diasDesdeCriacao
      SELECT
        l.id,
        l.nome,
        1 AS d_point
      FROM leads l
      WHERE l.responsavel_id = p.id
        AND l.status NOT IN (
          'ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado', 'stand_by'
        )
        AND NOT EXISTS (
          SELECT 1 FROM interacoes_lead i WHERE i.lead_id = l.id
        )
        AND (CURRENT_DATE - l.created_at::date) IN (0, 1)
    ) sub;

    -- Só chama a edge function se há algo para notificar (defesa em profundidade)
    IF v_tarefas > 0 OR jsonb_array_length(v_leads) > 0 THEN
      PERFORM net.http_post(
        url     := v_url,
        body    := jsonb_build_object(
                     'perfil_id',      p.id,
                     'tarefas_hoje',   v_tarefas,
                     'leads_cadencia', v_leads
                   ),
        headers := jsonb_build_object(
                     'Content-Type',  'application/json',
                     'Authorization', 'Bearer ' || v_secret
                   )
      );
    END IF;

  END LOOP;
END;
$$;

-- ─── Agendamento — diário às 10:00 UTC (07:00 BRT) ───────────────────────────
-- cron.schedule com mesmo jobname atualiza o job existente (idempotente).
SELECT cron.schedule(
  'resumo-diario-consultores',
  '0 10 * * *',
  'SELECT public.cron_resumo_diario()'
);
