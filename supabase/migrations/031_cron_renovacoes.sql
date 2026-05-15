-- Migration 031: Cron de renovações via pg_cron (substitui o Vercel Cron)
--
-- Agenda um job diário que identifica contratos ativos a 30/14/7 dias do
-- vencimento e chama a edge function notify-renovacao (que posta no Slack e
-- garante idempotência via tabela notificacoes_renovacao_enviadas).
--
-- O segredo Bearer (WEBHOOK_RENOVACAO_SECRET) NÃO fica neste arquivo — é lido
-- do Supabase Vault em runtime. Para gravá-lo (uma vez, fora do git):
--   SELECT vault.create_secret('<secret>', 'webhook_renovacao_secret', 'Bearer p/ notify-renovacao');
--
-- Idempotência: a edge function já deduplica por (contrato_id, dias_antes); o
-- check abaixo só evita chamadas HTTP redundantes.

-- ─── Extensões ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Função disparadora ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_disparar_renovacoes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_url    TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-renovacao';
  v_janela INT;
  c        RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_renovacao_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_disparar_renovacoes: secret webhook_renovacao_secret ausente no Vault';
    RETURN;
  END IF;

  FOR c IN
    SELECT id, (data_fim::date - CURRENT_DATE) AS dias
      FROM contratos
     WHERE status = 'ativo'
       AND data_fim IS NOT NULL
       AND (data_fim::date - CURRENT_DATE) IN (30, 14, 7)
  LOOP
    v_janela := c.dias;

    -- pula se já notificado nessa janela
    IF EXISTS (
      SELECT 1 FROM notificacoes_renovacao_enviadas
       WHERE contrato_id = c.id AND dias_antes = v_janela
    ) THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object('contrato_id', c.id, 'dias_antes', v_janela),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      )
    );
  END LOOP;
END;
$$;

-- ─── Agendamento — diário às 12:00 UTC (09:00 BRT) ───────────────────────────
-- cron.schedule com mesmo jobname atualiza o job existente (idempotente).
SELECT cron.schedule(
  'disparar-renovacoes',
  '0 12 * * *',
  'SELECT public.cron_disparar_renovacoes()'
);
