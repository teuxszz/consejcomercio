-- Migration 043: pg_cron scan de lead_sla — cron_sla_scan() (Phase 999.1 Plan 04)
--
-- Fecha o loop cron → notify-sla-evento → Slack/Google Calendar. A cada
-- 15 minutos, varre `lead_sla` (idx_lead_sla_scan — migration 041) e
-- dispara UM POST por linha que cruzou o limiar de aviso (<=2h antes do
-- deadline) ou o próprio deadline (escalação).
--
-- Espelha 1:1 o padrão de cron_disparar_aprovacoes_stale() (migration 038):
-- Vault secret lookup → RAISE WARNING + RETURN se ausente (fail-closed,
-- nunca fail-open) → loop com net.http_post fire-and-forget.
--
-- O secret Bearer (webhook_sla_secret) NÃO fica neste arquivo — é gravado
-- manualmente no Vault pelo usuário (ver user_setup do Plan 04):
--   SELECT vault.create_secret('<hex-aleatorio>', 'webhook_sla_secret', 'Bearer do cron SLA');
-- O MESMO valor deve estar setado como Edge secret WEBHOOK_SLA_SECRET
-- (Plan 03 — supabase/functions/notify-sla-evento).
--
-- Idempotência de envio NÃO vive aqui — vive no CAS atômico dentro da edge
-- function (sendNotificacaoSla / _shared/sla.ts), que reivindica a linha via
-- `UPDATE lead_sla SET x_sent_at = now() WHERE x_sent_at IS NULL RETURNING`
-- como primeiro statement. Os filtros `WHERE ... IS NULL` abaixo são defesa
-- em profundidade contra ticks de 15min sobrepostos (Pitfall 4 do RESEARCH),
-- não a garantia de idempotência em si.
--
-- Threats mitigadas (999.1-CONTEXT threat register):
--   T-999.1-13 Spoofing: cron dispara sem secret configurado — RAISE WARNING
--              + RETURN se webhook_sla_secret ausente no Vault (fail-closed).
--   T-999.1-14 Information Disclosure: secret Bearer só em vault.decrypted_secrets,
--              nunca neste arquivo de migration nem em log SQL.
--   T-999.1-05 Denial of Service (noise): filtros WHERE ... IS NULL nos dois
--              loops + CAS no edge function — defesa em profundidade contra
--              disparo duplicado sob ticks sobrepostos.

-- ─── Extensões (defensivo — já presentes desde migration 038) ────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── cron_sla_scan() — 2 loops fail-closed (aviso + escalação) ───────────────
CREATE OR REPLACE FUNCTION public.cron_sla_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
  v_url    TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-sla-evento';
  r        RECORD;
BEGIN
  -- Vault secret lookup (T-999.1-14 mitigation — pattern migration 038).
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_sla_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_sla_scan: secret webhook_sla_secret ausente no Vault';
    RETURN;
  END IF;

  -- Loop de AVISO: deadline dentro da janela de 2h, ainda não avisado,
  -- ainda não resolvido.
  FOR r IN
    SELECT ls.lead_id
      FROM public.lead_sla ls
     WHERE ls.resolved_at IS NULL
       AND ls.warning_sent_at IS NULL
       AND ls.deadline_at - now() <= interval '2 hours'
       AND ls.deadline_at > now()
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'evento',  'warning',
                   'lead_id', r.lead_id
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_secret
                 )
    );
  END LOOP;

  -- Loop de ESCALAÇÃO: deadline já passou, ainda não escalado, ainda não
  -- resolvido.
  FOR r IN
    SELECT ls.lead_id
      FROM public.lead_sla ls
     WHERE ls.resolved_at IS NULL
       AND ls.escalated_at IS NULL
       AND ls.deadline_at <= now()
  LOOP
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
                   'evento',  'escalonamento',
                   'lead_id', r.lead_id
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_secret
                 )
    );
  END LOOP;
END;
$$;

-- ─── cron.schedule — a cada 15 minutos, idempotente por jobname ─────────────
SELECT cron.schedule(
  'sla-scan',
  '*/15 * * * *',
  'SELECT public.cron_sla_scan()'
);
