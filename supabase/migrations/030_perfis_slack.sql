-- Migration 030: perfis.slack_user_id
--
-- ⚠️ ADITIVA. Sem mudança de comportamento.
--
-- Permite mapear cada perfil interno ao seu user_id no Slack (U0XXXXXX).
-- Usado por:
--   - supabase/functions/slack-commands → identifica autor do /lead como responsavel
--   - supabase/functions/notify-tarefa  → DM quando tarefa é atribuída (P3.3)

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS slack_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_perfis_slack_user_id
  ON perfis(slack_user_id)
  WHERE slack_user_id IS NOT NULL;
