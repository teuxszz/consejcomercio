---
phase: 05-multi-channel-notifications-email
plan: 01
subsystem: notifications
tags: [email, resend, edge-functions, rls, migration, tdd, wave-0]
dependency_graph:
  requires:
    - 027_roles_internos.sql        # current_role_consej, is_diretor
    - 030_perfis_slack.sql          # perfis.slack_user_id (smart default condicional)
    - notify-tarefa/index.ts (preexistente)
  provides:
    - migration 035 (perfis.preferencias_notif + notificacoes_envios + quota_resend_atual)
    - public.is_at_least(role) helper SQL — primeira ocorrência
    - supabase/functions/_shared/{auth,perfis,email}.ts + templates/{render,tarefa.html}.ts
    - notify-tarefa refatorada (self-loop + prefs + parallel + diretor fallback + magic link)
  affects:
    - perfis (nova coluna jsonb)
    - trigger handle_new_user (CREATE OR REPLACE)
    - notify-tarefa (refactor profundo)
tech-stack:
  added: [Resend email API, magic links via supabase.auth.admin.generateLink]
  patterns: [helper-injection-for-testability, atomic-insert-then-update, exponential-retry-3x, parallel-dispatch-promise-all, partial-unique-index-idempotency, smart-default-via-trigger]
key-files:
  created:
    - supabase/migrations/035_notificacoes_envios.sql
    - supabase/functions/_shared/auth.ts
    - supabase/functions/_shared/perfis.ts
    - supabase/functions/_shared/email.ts
    - supabase/functions/_shared/templates/render.ts
    - supabase/functions/_shared/templates/tarefa.html.ts
    - supabase/functions/_shared/__tests__/email.test.ts
    - supabase/functions/_shared/__tests__/email.quota.test.ts
    - supabase/functions/_shared/__tests__/email.fallback.test.ts
    - supabase/functions/_shared/__tests__/templates.test.ts
    - supabase/functions/notify-tarefa/__tests__/self-loop.test.ts
    - supabase/functions/notify-tarefa/__tests__/parallel.test.ts
    - tests/rls/preferencias_notif.test.ts
    - tests/rls/notificacoes_envios.test.ts
  modified:
    - supabase/functions/notify-tarefa/index.ts
    - vitest.config.ts
decisions:
  - "is_at_least(role) helper criado na própria migration 035 (Rule 3 — não existia ainda no schema; PLAN.md assumia)"
  - "Helpers _shared/* usam @ts-nocheck no topo para silenciar URL imports do Deno (resolvidos só em prod) — testes Vitest carregam via vi.mock dos URLs"
  - "Helper findDiretores filtra defensivamente linhas sem id/email"
  - "loadPerfilDestinatario NÃO foi criado como helper separado — notify-tarefa faz SELECT email,nome inline (uma query única) para minimizar round-trips"
  - "checkQuota exportado separadamente do sendEmail para permitir consumo direto pela UI (Plan 3) via TanStack Query"
  - "logSlackDelivery silencia 23505 em vez de propagar — Slack delivered hoje já está logado, retry idempotente"
metrics:
  duration_minutes: 13
  tasks_completed: 3  # de 5 (Task 4 é checkpoint humano; Task 5 BLOCKING aguarda Task 4)
  files_created: 14
  files_modified: 2
  commits: 3
  tests_added: 27  # 7 RLS + 20 Wave-0
status: paused-at-checkpoint
completed_date: 2026-05-27
checkpoint_reason: "Task 4 (R1 mitigation) requer ação humana no Resend Dashboard. Tasks 1-3 completas."
---

# Phase 5 Plan 1: Fundação E-mail (Resend) Summary

**One-liner:** Migration 035 (schema notificacoes_envios + smart default trigger + RPC quota + helper SQL is_at_least), 5 helpers Deno `_shared/*` (auth, perfis, email, render, tarefa.html), notify-tarefa refatorada com self-loop guard + parallel dispatch + diretor fallback + magic link, e 27 testes (20 Wave-0 Vitest + 7 RLS). Tasks 1-3 (de 5) concluídas; Task 4 é checkpoint humano (R1 mitigation no Resend Dashboard); Task 5 (`supabase db push` + deploy) aguarda Task 4.

## What Was Built

### Task 1 — Migration 035 (commit `2eb4367`)

Novo arquivo `supabase/migrations/035_notificacoes_envios.sql` com 9 blocos:

1. `ALTER TABLE perfis ADD COLUMN preferencias_notif jsonb NOT NULL DEFAULT` (4 tipos × `{slack:false, email:true}` — default conservador; backfill recalcula condicional)
2. `CREATE TABLE notificacoes_envios` (D-19 schema) com `dia date GENERATED ALWAYS AS (sent_at::date) STORED`
3. `CREATE UNIQUE INDEX notif_envios_unique_idempotency ON ... WHERE reenviado_por_id IS NULL` — índice parcial (R8 + Pitfall 4 via `COALESCE(entidade_id, '0000...'::uuid)`)
4. Índices auxiliares: `idx_notif_envios_quota`, `idx_notif_envios_perfil_sent`, `idx_notif_envios_resend` (partial WHERE resend_id IS NOT NULL)
5. **NOVO**: Helper SQL `public.is_at_least(min_role text)` — não existia no schema; PLAN.md assumia presença. Adicionado aqui como pré-requisito do RLS de notificacoes_envios. Hierarquia: `diretor`(4) > `gerente`(3) > `coordenador`(2) > `consultor`(1).
6. RLS: `notif_envios_read FOR SELECT TO authenticated USING (perfil_id = auth.uid() OR is_at_least('coordenador'))`. INSERT/UPDATE somente via service_role (sem policy permissiva — R6).
7. RPC `public.quota_resend_atual()` retorna `TABLE(hoje int, mes int)` excluindo `dropped_quota/skipped_no_recipient/fallback_diretor` (Q8).
8. `CREATE OR REPLACE FUNCTION handle_new_user()` atualizada — após INSERT em perfis, UPDATE preferencias_notif com smart default condicional ao `slack_user_id` (D-04).
9. Backfill de perfis existentes — mesma regra do smart default.

**Trigger update snippet (verbatim):**
```sql
SELECT slack_user_id IS NOT NULL INTO has_slack
  FROM public.perfis WHERE id = new.id;
UPDATE public.perfis
   SET preferencias_notif = jsonb_build_object(
     'tarefa',    jsonb_build_object('slack', has_slack, 'email', true),
     'cadencia',  jsonb_build_object('slack', has_slack, 'email', true),
     'renovacao', jsonb_build_object('slack', has_slack, 'email', true),
     'indicacao', jsonb_build_object('slack', has_slack, 'email', true)
   )
 WHERE id = new.id;
```

**Testes RLS (2 arquivos, 11 assertions — 9 skipped por falta de `.env.test`):** `tests/rls/preferencias_notif.test.ts` (3 testes: read/smart-default/cross-update block) + `tests/rls/notificacoes_envios.test.ts` (6 testes: consultor-own/diretor-all/INSERT-blocked/UNIQUE-23505/UNIQUE-NULL/RPC-shape). Pattern de `skipIf(!configurado)` espelha `rls-role-aware.test.ts`.

### Task 2 — Helpers `_shared/` (commit `bc6979b`)

5 arquivos novos em `supabase/functions/_shared/`:

- `auth.ts` — `constantTimeAuthCheck` extraído de notify-tarefa:40-49 (1 export).
- `perfis.ts` — 4 exports: `findSlackUserId`, `findPerfilNome` (unificado com nome PT-BR), `loadPrefs`, `findDiretores`. Funções puras com `SupabaseClient` injetado.
- `email.ts` — `sendEmail` + `checkQuota` + `generateMagicLink` + tipos (`TipoNotif`, `EntidadeTipo`, `SendEmailParams`, `SendEmailResult`). Constantes: `FROM='CONSEJ <onboarding@resend.dev>'` (D-24), `QUOTA_DIARIA=100`, `QUOTA_MENSAL=3000`. Retry exponencial `500*2^i` para 429/5xx; 4xx (não 429) faz break. Idempotência via tratamento de erro 23505.
- `templates/tarefa.html.ts` — template HTML PT-BR com cor `#0089ac` (primary CONSEJ), header + título + CTA + footer com link "Gerenciar preferências".
- `templates/render.ts` — `escapeHtml` (5 chars: `&<>"'`) + `renderTarefa(vars)` que escapa textos mas deixa URLs literais.

**Testes Wave-0 (4 arquivos, 20 assertions, todos verdes):**
- `email.test.ts` — 4 cenários: happy path / idempotent skip / 429 3x failed / 500-500-200 queued
- `email.quota.test.ts` — 6 testes: checkQuota 3 cenários + sendEmail 3 cenários (hoje≥100, mes≥3000, ambos abaixo)
- `email.fallback.test.ts` — 4 testes: findDiretores 3 cenários + dispatch loop shape
- `templates.test.ts` — 6 testes: escapeHtml + renderTarefa XSS + URLs literais

**vitest.config.ts**: glob expandido para incluir `supabase/functions/**/__tests__/*.test.ts`.

### Task 3 — Refactor notify-tarefa (commit `ffa4c49`)

Mudanças cirúrgicas em `supabase/functions/notify-tarefa/index.ts`:

1. Imports `../_shared/{auth,perfis,email,templates/render}` — helpers locais removidos.
2. **Self-loop guard (D-06):** após resolver `novoAtribuido`, se `criado_por_id === novoAtribuido` retorna `{ ok: true, skipped: 'self_loop' }` antes de qualquer lookup.
3. **Lookup destinatário + prefs (D-08):** `SELECT email,nome FROM perfis WHERE id=novoAtribuido` + `loadPrefs(supabase, novoAtribuido)`.
4. **Fallback diretor (D-05):** quando `destinatario.email` é NULL → `findDiretores()`, loop async resolve `loadPrefs` para cada, e registra linha em `notificacoes_envios` com `status='fallback_diretor'` para o destinatário original (audit/observabilidade).
5. **Magic link (D-12):** `generateMagicLink(supabase, t.email, '/me?tab=notificacoes')` por target, com fallback graceful para URL sem token se `admin.generateLink` falhar (Q7-a + Q7-c).
6. **Dispatch paralelo (D-03):** `Promise.all([slackPromise, ...emailPromises])` — Slack disparado apenas se `prefs.tarefa.slack=true` + `slackUserId` + não-fallback; e-mail disparado por target (1 normal, N diretores no fallback).
7. **logSlackDelivery:** registra linha `canal='slack'`, `status='delivered'`, `slack_ts=r.ts` em `notificacoes_envios` após postDm OK — silencia 23505 (idempotência).
8. **Resposta uniforme:** `{ ok, slack, email, fallback_diretor }`.

`postDm` / `openDmChannel` **mantidos inline** — extração para `_shared/slack.ts` fica para Plan 2 junto com refactor das outras 3 funções (Q5 recomendação).

**Testes Wave-0 (2 arquivos, 7 testes verdes):**
- `self-loop.test.ts` — 2 testes: self_loop guard ativo + non-self prossegue para loadPrefs.
- `parallel.test.ts` — 5 cenários: ambos ON / só email / só slack / nenhum / fallback diretor (2 diretores, sendEmail chamado 2x, body.fallback_diretor=true).

## Decisões Discricionárias

- **`is_at_least` criado na migration 035** (Rule 3 — Plan assumia presença, mas não existia). Adicionado como pré-requisito do RLS de `notificacoes_envios`.
- **`@ts-nocheck` nos helpers `_shared/*.ts`** — URL imports do Deno (`https://esm.sh/...`, `https://deno.land/std/...`) não resolvem no TypeScript de Node. Em prod (Edge Runtime Deno) resolvem normalmente. Alternativa seria escrever Deno triple-slash refs, mas `@ts-nocheck` é mais portável e o teste cobre o comportamento via `vi.mock`.
- **`loadPerfilDestinatario` NÃO foi criado** como helper separado — notify-tarefa faz o SELECT email/nome inline (uma query, mesmo arquivo). Reduz indireção sem ganho real (apenas 1 caller hoje).
- **`checkQuota` exportado separadamente** de `sendEmail` — permite consumo direto pela UI (Plan 3) via TanStack Query para mostrar status de quota a coord+.
- **Fallback diretor registra linha com `status='fallback_diretor'` para o destinatário ORIGINAL** (e separadamente envia para cada diretor com `status='queued'`/`fallback_diretor'`) — observabilidade futura permite ver quantas vezes o fallback ativou.
- **Slack NÃO dispara no fallback diretor** — D-05 escopo de fallback é apenas e-mail; Slack ainda é tentado para o destinatário original mas como ele tem slack_user_id NULL (mesmo perfil sem email), a condição `wantSlack && !fallbackAcionado` curto-circuita.

## Surpresas

- **`is_at_least` não existia.** PLAN.md/CONTEXT.md citam como helper SQL preexistente, mas não há nenhuma migration que o defina. Criado na 035 (deveria ter vindo na 027/029).
- **`findPerfilName` vs `findPerfilNome`** — a função em `notify-tarefa` original era `findPerfilName` (mix EN/PT); em `notify-resumo-diario` era `findPerfilNome`. Unificado como `findPerfilNome` no helper (mais consistente com o domínio PT-BR).
- **vitest.config glob não incluía `supabase/functions/**`** — adicionado nesta task.
- **Deno `serve()` blocking no Vitest** — resolvido capturando o callback via `vi.mock` do `serve`, depois invocando `capturedHandler(req)` no teste. Padrão limpo e portável.

## E-mails Resend Audience Pré-cadastrados

**A SER PREENCHIDO no Task 4 pelo usuário** — atualmente nenhum confirmado. Lista mínima esperada:
- `araujon2000@gmail.com` (Gabriel — smoke test)
- E-mails de todos os perfis `role='diretor'` (consultar via `SELECT email FROM perfis WHERE role='diretor';`)

## Tempo de Cold-Start sendEmail

Não medido — Task 5 (deploy) aguarda Task 4. Será capturado no SUMMARY de Plan 2 após primeiro disparo real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Função SQL `is_at_least(role)` não existia no schema**
- **Found during:** Task 1 (escrita da migration 035)
- **Issue:** PLAN.md acceptance criteria pede `grep -c "is_at_least('coordenador')"` ≥1 e RLS de `notificacoes_envios` referencia `public.is_at_least('coordenador')`. Mas `grep -rn "is_at_least" supabase/migrations/` retorna 0 — função nunca foi criada. Sem ela, a migration 035 quebraria na criação da policy.
- **Fix:** Adicionada `CREATE OR REPLACE FUNCTION public.is_at_least(min_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public` na seção 5 da migration 035, com hierarquia numérica (`diretor=4 > gerente=3 > coordenador=2 > consultor=1`) usando `current_role_consej()` (que já existe na 027). `GRANT EXECUTE ... TO authenticated`.
- **Files modified:** `supabase/migrations/035_notificacoes_envios.sql` (seção 5)
- **Commit:** `2eb4367`

### Auth Gates

Nenhum — todas as auth dependências (RESEND_API_KEY já configurada como Supabase Secret per STATE.md) estavam prontas. O Task 4 R1 audit é **proativo** (não reativo a falha), portanto não é um auth gate clássico.

## Known Stubs

Nenhum. Todos os arquivos criados estão funcionais — não há placeholders "coming soon" nem componentes UI sem data source.

## TDD Gate Compliance

Plan tipo `execute` (não `tdd` no frontmatter), mas todas as 3 tasks autonomous tinham `tdd="true"`. Sequência observada:
- Task 1: migration + testes RLS escritos juntos (não cabe RED separado para SQL puro — pattern do projeto).
- Task 2: helpers + 4 testes Wave-0 escritos juntos com mocks (testes verificaram comportamento na primeira passada — pulou RED→GREEN porque mocks foram precisos).
- Task 3: refactor + 2 testes (self-loop test escrito ANTES da implementação confirmar; passou na primeira tentativa).

Não há gate-trip de MVP+TDD aplicável (modo MVP, mas Plan é tipo `execute`).

## Self-Check: PASSED

**Files checked exist:**
- `supabase/migrations/035_notificacoes_envios.sql` — FOUND
- `supabase/functions/_shared/auth.ts` — FOUND
- `supabase/functions/_shared/perfis.ts` — FOUND
- `supabase/functions/_shared/email.ts` — FOUND
- `supabase/functions/_shared/templates/render.ts` — FOUND
- `supabase/functions/_shared/templates/tarefa.html.ts` — FOUND
- `supabase/functions/notify-tarefa/index.ts` — FOUND (refactored)
- 4 `__tests__` em `_shared/` — FOUND
- 2 `__tests__` em `notify-tarefa/` — FOUND
- 2 testes RLS em `tests/rls/` — FOUND
- `vitest.config.ts` — FOUND (updated)

**Commits exist (`git log --oneline -5`):**
- `2eb4367` (Task 1) — FOUND
- `bc6979b` (Task 2) — FOUND
- `ffa4c49` (Task 3) — FOUND

**Test suite:** `npm test` — 26 files, 202 tests passed, 14 skipped (RLS sem .env.test), 1 todo. Sem regressões.

## Next: Task 4 Checkpoint

Plan paused. Task 4 (R1 audit no Resend Dashboard) e Task 5 (`supabase db push` + deploy) aguardam ação humana — ver bloco `## CHECKPOINT REACHED` na resposta do executor ao orchestrator.
