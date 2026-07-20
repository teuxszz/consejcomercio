-- Migration 044: RPC google_calendar_save_token — persistência robusta do token
-- (Phase 999.1 Plan 05 — fix do 42501)
--
-- O upsert direto do browser em google_calendar_tokens falhava com 42501
-- (violação da RLS WITH CHECK) porque o perfil_id enviado pelo cliente podia
-- divergir do auth.uid() real da requisição (session.user.id != JWT sub).
--
-- Correção: a gravação passa a ser via RPC SECURITY DEFINER que usa o
-- auth.uid() DO SERVIDOR como dono — fonte única e confiável. Mantém o escopo
-- seguro (cada usuário só grava a PRÓPRIA linha, nunca a de outro), sem
-- depender do valor mandado pelo browser nem da RLS de INSERT. Mesmo padrão de
-- google_calendar_status()/google_calendar_disconnect() (migration 042).
--
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.google_calendar_save_token(
  p_refresh_token TEXT,
  p_access_token  TEXT,
  p_expires_at    TIMESTAMPTZ,
  p_scope         TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  -- Fail-closed: sem usuário autenticado não há dono — recusa.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  -- refresh_token é obrigatório (Google só o emite com access_type=offline +
  -- prompt=consent). Sem ele, a conexão seria inútil.
  IF p_refresh_token IS NULL OR length(p_refresh_token) = 0 THEN
    RAISE EXCEPTION 'refresh_token ausente';
  END IF;

  INSERT INTO public.google_calendar_tokens (
    perfil_id, refresh_token, access_token, access_token_expires_at, scope
  )
  VALUES (v_uid, p_refresh_token, p_access_token, p_expires_at, p_scope)
  ON CONFLICT (perfil_id) DO UPDATE SET
    refresh_token           = EXCLUDED.refresh_token,
    access_token            = EXCLUDED.access_token,
    access_token_expires_at = EXCLUDED.access_token_expires_at,
    scope                   = EXCLUDED.scope,
    updated_at              = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.google_calendar_save_token(TEXT, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
