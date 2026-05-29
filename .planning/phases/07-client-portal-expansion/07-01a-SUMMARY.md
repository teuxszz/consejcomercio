---
plan: 07-01a
phase: 07
title: Schema + Bucket + Storage RLS + Vault
status: complete
wave: 1
duration_min: ~15
date: 2026-05-28
---

# Plan 07-01a — Schema + Bucket + Storage RLS + Vault

> Wave 1 manual-gate slice. Cria fundação de infraestrutura: tabela `cliente_docs` (migration 037) + bucket Supabase Storage privado `cliente-docs` + storage.objects RLS policies + Vault secret para HMAC do webhook trigger.

## What was built

**Schema (migration 037):**
- Tabela `cliente_docs` (id, cliente_id FK clientes, autor_id FK perfis, autor_tipo enum, tag enum, nome_arquivo, mime_type, tamanho_bytes ≤10MB, storage_path, versao, parent_doc_id FK self, requer_aprovacao, status enum nullable, comentario_cliente, created_at, deleted_at)
- 3 índices parciais (lookup cliente, pending-aprovação, versionamento parent_doc_id)
- 4 RLS policies role-aware (SELECT/INSERT/UPDATE/DELETE)
  - SELECT: cliente vê própria pasta; consultor vê responsavel; coord+ tudo
  - INSERT: cliente sobe própria (autor_tipo='cliente' + requer_aprovacao=false); interno sobe nos seus
  - UPDATE: cliente só muda status para 'aprovado'/'revisao_solicitada' em docs `autor_tipo='interno' AND requer_aprovacao=true` (D-01); interno muda storage_path/deleted_at/status incl. 'superseded' (D-02)
  - DELETE: DENY usuários comuns (service_role bypassa para auditoria)
- ALTER CHECK `notificacoes_envios.tipo` expandido para incluir `'documentos'` (D-08)
- `handle_new_user` CREATE OR REPLACE — preserva lookup `slack_user_id IS NOT NULL INTO has_slack` (anti-regressão D-04 Phase 5) + adiciona 5ª chave `'documentos'` no JSONB
- Backfill perfis existentes com `documentos: { slack: false, email: true, push: false }` (slack false conservador no bulk; usuários ajustam em /me/preferencias)
- UPDATE `configuracoes.metas.dias_para_aprovacao_pendente = 5` (D-13, RESEARCH Q1 RESOLVED)

**Bucket + Storage RLS (Dashboard SQL):**
- `cliente-docs` bucket (privado, 10MB max, whitelist 7 MIME types: pdf, docx, doc, odt, jpg, jpeg, png, webp)
- 2 storage.objects policies (`cliente_docs_select`, `cliente_docs_insert`) com lógica path-based via `storage.foldername(name)[1] = cliente_id`
- UPDATE/DELETE intencionalmente sem policy → DENY default (path imutável; service_role bypassa)

**Vault + Edge Function secret:**
- `vault.secrets` entry `webhook_aprovacao_secret` (32 bytes hex random, para HMAC do trigger pg_net.http_post → notify-aprovacao-evento)
- `WEBHOOK_APROVACAO_SECRET` setado nos Supabase Edge Function secrets (espelho do Vault)

## Tasks

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 1a-1 — Write migration 037 SQL | ✅ complete | `9dfe04d` | 231 linhas, todas as 16 decisões D-* tocadas no schema |
| 1a-2 — Apply manual (migration + bucket + RLS + Vault) | ✅ complete | (this SUMMARY) | Aplicado via `supabase db query --linked -f` após Gabriel destravar SUPABASE_DB_PASSWORD tech-debt |

## Verification

Queries executadas via `supabase db query --linked`:
- `SELECT count(*) FROM pg_policies WHERE tablename = 'cliente_docs'` = **4** ✓
- `SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'cliente-docs'` = `{cliente-docs, false, 10485760}` ✓
- `SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname LIKE 'cliente_docs_%'` = `cliente_docs_insert, cliente_docs_select` ✓
- `SELECT name FROM vault.secrets WHERE name = 'webhook_aprovacao_secret'` = 1 row ✓
- `supabase secrets list` confirma `WEBHOOK_APROVACAO_SECRET` ✓
- `SELECT preferencias_notif->'documentos' FROM perfis LIMIT N` = `{slack: false, email: true, push: false}` em todas as rows ✓
- `SELECT metas->>'dias_para_aprovacao_pendente' FROM configuracoes WHERE id='default'` = `"5"` ✓

## Tech-debt resolved (collateral)

**SUPABASE_DB_PASSWORD env permanente.** STATE.md listava como tech-debt do Phase 5 — CLI `supabase db push` falhava com `42501: permission denied to alter role cli_login_postgres` porque o DB user padrão não tem CREATEROLE. Gabriel forneceu a senha + setado via `[Environment]::SetEnvironmentVariable("SUPABASE_DB_PASSWORD", ..., "User")`. Resultado: Phases 8, 9, 10 daqui em diante conseguem aplicar migrations sem precisar abrir Studio SQL Editor. Tech-debt destravado.

## Deviation — bucket criado via SQL ao invés de CLI

Plano previa `supabase storage buckets create cliente-docs --public false ...` mas CLI v2.101.0 não suporta `storage buckets` subcommand (apenas `ls/cp/mv/rm` para objects). Workaround: `INSERT INTO storage.buckets (...)` direto via SQL no mesmo arquivo de Storage RLS + Vault. Funciona — mesmo efeito.

## Files Created

- `supabase/migrations/037_cliente_docs.sql` (231 linhas — schema + RLS + JSONB extend + configuracoes.metas)
- `C:\Users\Gabriel\Documents\consej-secrets\phase-7-bucket-rls-vault.sql` (out-of-repo, 100 linhas — bucket + storage RLS + Vault secret)

## Files Modified (live DB only — no source files)

- `storage.buckets` row criada
- `storage.objects` policies (2)
- `vault.secrets` row criada
- `public.cliente_docs` table criada (4 policies + 3 indexes)
- `public.notificacoes_envios` CHECK expanded
- `public.handle_new_user` function recreated
- `public.perfis.preferencias_notif` backfilled
- `public.configuracoes.metas` updated

## Wave 1 → Wave 2 handoff

Plan 07-01b (types + scaffolds) já completo. Plan 07-02 (helper aprovacoes.ts + 2 edge functions + triggers + cron) pode prosseguir — depends_on satisfeito.
