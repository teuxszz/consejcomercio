---
plan: 07-02
phase: 07
title: Helper aprovacoes.ts + 2 edge functions + triggers + cron
status: complete
wave: 2
duration_min: ~30
date: 2026-05-28
---

# Plan 07-02 — Backend multi-canal (aprovações)

> Wave 2 deliverable. Backend infrastructure pronta para disparar notificação multi-canal (Phase 5+6 stack) nos 4 eventos de aprovação D-07.

## What was built

**Helper compartilhado:**
- `supabase/functions/_shared/aprovacoes.ts` — `sendNotificacaoAprovacao(supabase, { perfilId, evento, docId, clienteNome, docNomeArquivo, comentarioCliente, skipSlack? })` retorna `{ slack, email, push }` com results por canal
- Espelha `_shared/email.ts` 1:1 (signature + idempotency via UNIQUE em notificacoes_envios + Promise.allSettled fanout)
- **Blocker #3 fix:** parâmetro `skipSlack?: boolean` pula `sendSlack` quando true (D-12: lembrete cliente → só email+push)
- 4 eventos suportados: `cliente_aprovou`, `cliente_revisao_solicitada`, `cliente_subiu_doc`, `aprovacao_pendente_stale`

**Edge functions:**
- `notify-aprovacao-evento` (trigger-driven, eventos a/b/c) — recebe payload do trigger, faz lookup do destinatario_perfil_id, chama `sendNotificacaoAprovacao()`. **Implementa Blocker #3:** lê `payload.skip_slack` → passa `skipSlack: payload.skip_slack ?? false` adiante
- `notify-aprovacoes-stale` (cron-driven + per-doc) — chamada pelo cron-function `cron_disparar_aprovacoes_stale` que faz SELECT em cliente_docs (`status='pending' AND requer_aprovacao=true AND created_at < now() - interval '<dias> days'`) e POSTa per-row

**Schema + automação (migration 038):**
- `cliente_docs_after_change()` PLPGSQL function — chama `pg_net.http_post` para `notify-aprovacao-evento` no `Authorization: Bearer <vault.webhook_aprovacao_secret>` quando:
  - INSERT com autor_tipo='cliente' (evento c)
  - UPDATE com status DISTINCT FROM (cliente aprovou/pediu revisão = a/b)
- 2 triggers separadas (`trg_cliente_docs_after_insert` filtering autor_tipo='cliente'; `trg_cliente_docs_after_update` filtering OLD.status DISTINCT FROM NEW.status) — Pitfall §4 (não usar AFTER INSERT OR UPDATE com OLD)
- `cron_disparar_aprovacoes_stale()` function + pg_cron job `disparar-aprovacoes-stale` schedule `'0 11 * * *'` (08:00 BRT)

## Tasks

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 2.1 — `_shared/aprovacoes.ts` helper | ✅ complete | `2e44606` | 7 tests passing (Promise.allSettled isolates failure, skipSlack works, idempotency, 4 events PT-BR) |
| 2.2 — `notify-aprovacao-evento` edge function | ✅ complete | `0afe088` | AprovacaoEventoPayload.skip_slack passthrough (Blocker #3 verified) |
| 2.3 — `notify-aprovacoes-stale` edge function | ✅ complete | `35ee0f1` | per-doc, called by cron fan-out |
| 2.4 — Migration 038 (triggers + cron) | ✅ complete | `4d8b159` | 2 funcs + 2 triggers + 1 cron job |
| 2.5 — Deploy + smoke (BLOCKING checkpoint) | ✅ complete | (this SUMMARY) | Executed inline via orchestrator (SUPABASE_DB_PASSWORD now set) |

## Verification

**Migration 038 applied via CLI:**
```
SELECT proname FROM pg_proc WHERE proname IN ('cliente_docs_after_change','cron_disparar_aprovacoes_stale')
→ 2 rows ✓

SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_cliente_docs_%'
→ trg_cliente_docs_after_insert, trg_cliente_docs_after_update ✓

SELECT jobname, schedule FROM cron.job WHERE jobname = 'disparar-aprovacoes-stale'
→ jobname='disparar-aprovacoes-stale', schedule='0 11 * * *' ✓
```

**Edge functions deployed:**
```
supabase functions deploy notify-aprovacao-evento --no-verify-jwt → OK
supabase functions deploy notify-aprovacoes-stale --no-verify-jwt → OK
```

(Note: `--no-verify-jwt` necessário porque a auth boundary é o HMAC interno via `constantTimeAuthCheck(WEBHOOK_APROVACAO_SECRET)` — não Supabase's outer JWT layer. Pattern alinhado com Phase 5+6.)

**Smoke curl:**

| Endpoint | Sem auth | Bearer válido |
|---|---|---|
| `notify-aprovacao-evento` | 401 ✓ | 404 (doc fake) — auth passou ✓ |
| `notify-aprovacoes-stale` | 401 ✓ | 400 (input vazio rejected) — auth passou ✓ |

## Deviation — `--no-verify-jwt` no deploy

Plano inicial deploy sem `--no-verify-jwt` resultou em 401 (Supabase outer JWT layer rejeitou). Solução: redeploy com `--no-verify-jwt`. Justificativa: nossa auth boundary é o HMAC interno `constantTimeAuthCheck` que valida formato `Bearer <WEBHOOK_APROVACAO_SECRET>` — não precisa do outer JWT layer Supabase, e o outer layer iria conflitar com o header que pg_net usa. Pattern já estabelecido em Phase 5+6 (smoke-push também usa `--no-verify-jwt`).

## Files Created

- `supabase/functions/_shared/aprovacoes.ts` (helper canonical 3-canal)
- `supabase/functions/_shared/__tests__/aprovacoes.test.ts` (7 tests GREEN)
- `supabase/functions/notify-aprovacao-evento/index.ts`
- `supabase/functions/notify-aprovacoes-stale/index.ts`
- `supabase/migrations/038_cron_aprovacoes_stale.sql`

## Files Modified (live DB only — no source files)

- `cliente_docs_after_change()` function created
- `cron_disparar_aprovacoes_stale()` function created
- `trg_cliente_docs_after_insert` + `trg_cliente_docs_after_update` triggers created
- `cron.job` row `disparar-aprovacoes-stale` schedule `'0 11 * * *'`
- 2 edge functions deployed em prod (`--no-verify-jwt`)

## Wave 2 → Wave 3 handoff

Backend completo para disparar notificação multi-canal nos 4 eventos D-07. Plan 07-03 (upload UI bidirecional) pode prosseguir — usa o backend para event c (cliente subiu doc no portal automaticamente disparado pela trigger D-10).
