-- Migration 039: bucket_usage_bytes function para banner > 80% (D-06)
-- Phase 7 — Plan 04b — Dashboard aprovações pendentes + monitoramento.
--
-- A função soma `(metadata->>'size')::bigint` dos objetos no bucket informado.
-- `storage.objects` não é acessível diretamente por usuários `authenticated` em
-- Supabase (só admins / service_role / policies storage), então este SQL roda
-- como SECURITY DEFINER e expõe APENAS o agregado — não vaza nomes de arquivo,
-- paths, ou metadata individual.
--
-- O banner que consome essa função fica gated por RequireRole atLeast='coordenador'
-- no client (T-07-13 mitigation), mas a função em si é callable por qualquer
-- authenticated — isso é seguro porque o retorno é apenas um único bigint agregado.
--
-- search_path explícito (storage, public) evita ataques de shadowing por search_path
-- mutável (boas práticas SECURITY DEFINER PostgreSQL).
--
-- RESEARCH §10 (Open Q5 RESOLVED): `metadata->>'size'` está populado em todos os
-- objetos do bucket cliente-docs subidos via supabase-js storage.upload (autor).

CREATE OR REPLACE FUNCTION public.bucket_usage_bytes(p_bucket TEXT)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = storage, public
AS $$
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
  FROM storage.objects
  WHERE bucket_id = p_bucket
$$;

GRANT EXECUTE ON FUNCTION public.bucket_usage_bytes(TEXT) TO authenticated;
