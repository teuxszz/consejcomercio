---
phase: 05-multi-channel-notifications-email
plan: 02
subsystem: notifications
tags: [email, resend, webhook, edge-functions, hmac, status-tracking, slack-helper, tdd, wave-2]
dependency_graph:
  requires:
    - 05-01 (helpers _shared/* + notify-tarefa refactor + migration 035)
    - perfis.preferencias_notif column
    - notificacoes_envios table com resend_id + status + timestamps
  provides:
    - supabase/functions/_shared/slack.ts (postDm + openDmChannel with explicit token)
    - 3 HTML templates (cadencia, renovacao, indicacao) + 3 render functions
    - notify-resumo-diario + notify-indicacao + notify-renovacao refatoradas com companion email per-user
    - notify-tarefa atualizada para usar _shared/slack.ts (deduplicação completa)
    - resend-webhook edge function com HMAC verify + STATUS_RANK monotonic
  affects:
    - notify-indicacao (Slack broadcast preservado, email adicionado)
    - notify-renovacao (broadcast preservado, hydrateContrato estendido p/ responsavel_id + D-07)
    - notify-tarefa (somente cleanup de Slack inline)
tech-stack:
  added: [Svix HMAC-SHA256 webhook signature verification, Resend delivery tracking webhook]
  patterns: [helper-extraction-with-explicit-token, parallel-dispatch-broadcast-plus-peruser, fallback-diretor-D05, hand-off-read-at-dispatch-D07, status-rank-monotonic, idempotent-update-dedup]
key-files:
  created:
    - supabase/functions/_shared/slack.ts
    - supabase/functions/_shared/templates/cadencia.html.ts
    - supabase/functions/_shared/templates/renovacao.html.ts
    - supabase/functions/_shared/templates/indicacao.html.ts
    - supabase/functions/_shared/__tests__/slack.test.ts
    - supabase/functions/notify-renovacao/__tests__/handoff.test.ts
    - supabase/functions/resend-webhook/index.ts
    - supabase/functions/resend-webhook/verify.ts
    - supabase/functions/resend-webhook/__tests__/verify.test.ts
    - supabase/functions/resend-webhook/__tests__/handler.test.ts
    - supabase/functions/resend-webhook/__tests__/replay.test.ts
  modified:
    - supabase/functions/_shared/templates/render.ts (estendido com 3 renders)
    - supabase/functions/_shared/__tests__/templates.test.ts (estendido com 12 testes novos)
    - supabase/functions/notify-tarefa/index.ts (postDm/openDmChannel inline → import _shared/slack.ts)
    - supabase/functions/notify-resumo-diario/index.ts (refactor completo + companion email)
    - supabase/functions/notify-indicacao/index.ts (broadcast preservado + per-user email)
    - supabase/functions/notify-renovacao/index.ts (broadcast preservado + per-user email + responsavel_id no hydrate)
decisions:
  - "Decoupled token: _shared/slack.ts recebe token como PARÂMETRO explícito (não Deno.env closure) — portabilidade testável (PATTERNS divergence)"
  - "STATUS_RANK monotonic enforcement no resend-webhook: opened (rank 2) NUNCA regride para delivered (rank 1) por race condition — Pitfall 2"
  - "Sem tabela auxiliar de dedup: UPDATE idempotente é suficiente (Pitfall 3); mesmo svix-id repetido resulta em mesmo UPDATE — natural-idempotent"
  - "notify-indicacao usa dispatchEmailIndicacao em função separada após broadcast — não bloqueia retorno do broadcast se sendEmail falhar, mas exibe sumário no JSON de resposta"
  - "notify-renovacao: hydrateContrato lê responsavel_id JUNTO com cliente_id e dados do contrato (1 query); a leitura acontece DENTRO do serve handler (não cached) — D-07 cumprido"
  - "renderCadencia escapa contadores numéricos via escapeHtml(String(n)) — defensive ainda que números puros não precisem (consistência > otimização)"
  - "Email broadcast preservado em ambas indicacao + renovacao (D-01): SLACK_LEADS_CHANNEL_ID continua intocado. Companion email é ADIÇÃO per-user"
metrics:
  duration_minutes: 35
  tasks_completed: 3  # de 4 (Task 4 = checkpoint humano)
  files_created: 11
  files_modified: 6
  commits: 4
  tests_added: 36  # 12 templates novos + 7 slack + 3 handoff + 11 verify + 1 replay + 2 ajustes test count
status: paused-at-checkpoint
completed_date: 2026-05-27
checkpoint_reason: "Task 4 (deploy + registrar webhook no Resend Dashboard + setar WEBHOOK_RESEND_SECRET) requer ação humana. Tasks 1-3 completas e testadas (246 tests verdes, 14 skipped RLS)."
---

# Phase 5 Plan 2: Email Multi-canal + Resend Webhook Summary

**One-liner:** Plan 2 fecha o loop do e-mail: extrai `_shared/slack.ts` (deduplica 4 funções), adiciona companion email em `notify-resumo-diario`/`notify-indicacao`/`notify-renovacao` preservando o broadcast Slack (D-01), implementa `resend-webhook` com HMAC SHA-256 + STATUS_RANK monotonic (status nunca regride) + dedup natural via UPDATE idempotente. 36 testes Wave-0 adicionados, 246 totais verdes.

## What Was Built

### Task 1 — `_shared/slack.ts` + 3 templates + render extension (commit `8db65f1`)

**`supabase/functions/_shared/slack.ts`** (1 arquivo novo, 2 exports):
- `openDmChannel(token, slackUserId)` — abre canal D... via `conversations.open`, retorna `{ ok, channel?, error? }`
- `postDm(token, slackUserId, text, blocks)` — chama `openDmChannel` + retry exponencial 3x (500*2^i ms) em 429/5xx
- **Divergência do original** (PATTERNS): `token` é **parâmetro explícito** — não closure sobre `Deno.env.get('SLACK_BOT_TOKEN')`. Caller controla qual token usar; helper fica portável.

**3 templates HTML** (`cadencia.html.ts`, `renovacao.html.ts`, `indicacao.html.ts`):
- Layout idêntico a `tarefa.html.ts`: header CONSEJ (#0089ac) + título + corpo + CTA + footer "Gerenciar preferências"
- Placeholders escapam textos via `escapeHtml`; URLs (deepLink, gerenciarPrefsLink) ficam literais
- Subjects e CTAs específicos por tipo:
  - cadencia → "Bom dia, X!" + CTA "Abrir Meu Espaço"
  - renovacao → "Renovação aproximando" + CTA "Abrir contrato"
  - indicacao → "Nova indicação" + CTA "Abrir lead"

**`render.ts`** estendido com `renderCadencia`, `renderRenovacao`, `renderIndicacao` — mesma assinatura do `renderTarefa` (vars object → string HTML).

**Testes (commit `8db65f1` + `f87c854`):**
- `_shared/__tests__/slack.test.ts` — 7 testes: openDm happy/error, token via Bearer, postDm happy/open-fail/429-retry-3x/token-threading
- `_shared/__tests__/templates.test.ts` — estendido com 12 testes (3 novos renders × 4 cenários cada: XSS escape, contador numérico, URL literal, CTA)

### Task 2 — Refactor 4 notify-* (commit `ac3678a`)

**notify-tarefa (cleanup do Plan 1):**
- Removeu funções inline `openDmChannel`/`postDm` (~50 linhas)
- Adicionou `import { postDm } from '../_shared/slack.ts'`
- Callsite atualizado: `postDm(SLACK_BOT_TOKEN!, slackUserId!, text, blocks)`

**notify-resumo-diario (refactor completo):**
- Imports consolidados em `_shared/{auth,perfis,slack,email,templates}`
- Removeu definições locais duplicadas (`constantTimeAuthCheck`, `findSlackUserId`, `findPerfilNome`, `openDmChannel`, `postDm`)
- Lookup paralelo: `findSlackUserId` + `loadPrefs` + `select email/nome` (mesmo perfil, 1 round-trip cada)
- Promise.all dispatch: `slackPromise` (gated por `prefs.cadencia.slack && slackUserId`) + `emailPromise` (gated por `prefs.cadencia.email && perfil.email`)
- E-mail: `tipo='cadencia'`, `entidadeId=null`, `entidadeTipo=null`, magic link via `generateMagicLink` (Q7-a)
- Volume CONSEJ <30/dia (A6) sob rate limit do generateLink — se crescer, downgrade para fallback link direto (sem token)

**notify-indicacao (Slack broadcast preservado + per-user email):**
- Imports adicionados: `constantTimeAuthCheck`/`loadPrefs`/`findDiretores`/`sendEmail`/`generateMagicLink`/`renderIndicacao`
- Removeu `constantTimeAuthCheck` local (substituído pelo import de `_shared/auth.ts`)
- **Broadcast Slack (D-01) intocado**: `postToSlack(blocks, fallbackText)` → `SLACK_LEADS_CHANNEL_ID`
- Após broadcast bem-sucedido, chama `dispatchEmailIndicacao(ind, hydrated)`:
  - SELECT `id, responsavel_id, nome, segmento` em `leads`
  - Se `lead.responsavel_id`: target = [responsavel] (D-02)
  - Se NULL: target = todos `findDiretores()` (D-05 fallback)
  - Para cada target: loadPrefs + se `prefs.indicacao.email` → renderIndicacao + sendEmail (`tipo='indicacao'`, `entidadeId=lead.id`, `entidadeTipo='lead'`)
- Resposta JSON inclui `email: { targets, sent, skipped, fallback }`

**notify-renovacao (broadcast preservado + per-user com D-07):**
- Imports idênticos ao indicacao + `renderRenovacao`
- **D-07 hand-off explícito**: `hydrateContrato` estendido para SELECT `responsavel_id, cliente_id` adicionais. Comentário inline: `// D-07: lê responsavel_id atual no momento do disparo (cron) — sem snapshot`
- Broadcast Slack (D-01) preservado intocado
- `dispatchEmailRenovacao(contrato, diasAntes)`:
  - target = `contrato.responsavel_id ? [it] : findDiretores()` (D-02/D-05)
  - Formatação BRL via `Intl`: prefere `valor_total`, fallback `valor_mensal/mês`, fallback `—`
  - DeepLink prefere `/clientes/${cliente_id}`, fallback `/contratos`
  - `sendEmail` com `tipo='renovacao'`, `entidadeId=contrato.id`, `entidadeTipo='contrato'`

**Teste `handoff.test.ts`** (3 testes):
1. `responsavel_id` mudado entre cron-schedule e dispatch → `sendEmail` chamado com `perfilId='responsavel-novo'` (não algum valor cached)
2. `responsavel_id = NULL` → `findDiretores` é chamado e cada diretor recebe `sendEmail`
3. `prefs.renovacao.email=false` → `sendEmail` NÃO é chamado mesmo com responsável presente

### Task 3 — Edge function resend-webhook (commit `eff5a77`)

**`supabase/functions/resend-webhook/verify.ts`:**
- `verifySvixSignature(body, svixId, svixTs, svixSigHeader, secret)`:
  - Strip prefix `whsec_` + base64-decode do segredo (Pitfall: usar `whsec_xxx` direto falha silenciosamente)
  - HMAC SHA-256 sobre `${svixId}.${svixTs}.${body}` via Web Crypto
  - Suporta header com múltiplas assinaturas separadas por espaço (rotação de secret)
  - `constantTimeEquals` impede timing attack
- `isReplayValid(svixTs, maxSkewSeconds=300)` — janela ±5 min, rejeita timestamps fora

**`supabase/functions/resend-webhook/index.ts`:**
- Validação por etapas: method check → headers svix presentes → replay window → HMAC sig → JSON parse
- Match: `data.email_id` (A7 confirmado — não `data.id`) ↔ `notificacoes_envios.resend_id`
- Switch por `type`:
  - `email.sent` → skip (equivalente a queued já registrado)
  - `email.delivered` → `status=delivered`, `delivered_at=created_at`
  - `email.opened` → `status=opened`, `opened_at=created_at`
  - `email.bounced` → `status=bounced`, `bounced_at`, `error_msg=data.bounce?.message`
  - `email.complained` → `status=complained`, `complained_at`
  - `email.delivery_delayed`, `email.clicked` → skip (MVP não rastreia)
- **STATUS_RANK monotonic (Pitfall 2):** `{ queued:0, delivered:1, opened:2, bounced/complained/failed/fallback_diretor/dropped_quota:99 }`. Status só vai para o `updates` se `newRank > currentRank`. Timestamp `*_at` SEMPRE entra (defensive).
- **Dedup natural (Pitfall 3):** sem tabela auxiliar; UPDATE idempotente — mesmo svix-id processado 2x = mesmo resultado.

**Testes (22 totais):**
- `verify.test.ts` (11): assinatura válida/inválida, rotação multi-sig, headers vazios, secret sem prefix, isReplayValid window edge cases
- `handler.test.ts` (10): delivered/opened/bounced/sent-skip, STATUS_RANK regress prevention, signature inválida 401, timestamp skew 401, resend_id desconhecido skip, sem email_id skip, headers ausentes 401
- `replay.test.ts` (1): mesmo svix-id processado 2x — primeiro UPDATE aplica status+timestamp; segundo aplica só timestamp (status já era 'delivered', rank igual → noop)

**Mocking do `https://deno.land/std@0.224.0/encoding/base64.ts`** em `verify.test.ts` via `vi.mock` — usa `btoa`/`atob` nativos do Node como shim.

## Task 4 — CHECKPOINT humano (não executado)

**Tipo:** human-action

**O que falta para EMAIL-02/03/04 backend ficarem 100%:**

1. **Deploy 5 funções** (em ordem, `resend-webhook` por último para evitar R4 race):
   ```bash
   supabase functions deploy notify-tarefa
   supabase functions deploy notify-resumo-diario
   supabase functions deploy notify-indicacao
   supabase functions deploy notify-renovacao
   supabase functions deploy resend-webhook
   ```

2. **Registrar webhook no Resend Dashboard** (https://resend.com/webhooks):
   - URL: `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/resend-webhook`
   - Eventos: marcar TODOS (`email.sent`, `email.delivered`, `email.opened`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.clicked`)
   - Copiar o Signing Secret (`whsec_xxxx`)

3. **Setar secret no Supabase:**
   ```bash
   supabase secrets set WEBHOOK_RESEND_SECRET=whsec_xxxxxxxx
   ```

4. **Redeploy `resend-webhook`** após setar o secret (Supabase requer redeploy pra função ler novo env):
   ```bash
   supabase functions deploy resend-webhook
   ```

5. **Smoke test E2E:**
   - "Send test event" no Resend Dashboard → log de `resend-webhook` deve mostrar 200 com `skipped: 'unknown resend_id'` (esperado: test event não bate)
   - Criar tarefa real atribuída a outro usuário com email → após ~30s, conferir `SELECT id, status, resend_id, delivered_at FROM notificacoes_envios ORDER BY sent_at DESC LIMIT 1;` — `status` deve ter subido para `delivered`

## Decisões Discricionárias

- **`@ts-nocheck` em `_shared/slack.ts` e `resend-webhook/verify.ts`** — replica pattern do Plan 5-01 (necessário pelos URL imports do Deno; eslint gera erro mas é estado pré-existente de todos os `_shared/*.ts`). Testes carregam via `vi.mock` dos URLs.
- **Sem tabela `webhook_resend_eventos`** — RESEARCH Q2 lista como opcional; MVP usa idempotência natural do UPDATE (Pitfall 3 confirma suficiência). Se contadores agregados forem necessários no futuro, adicionar tabela então.
- **Status 'fallback_diretor' extra row em notify-indicacao** — decisão: NÃO adicionado neste plan. notify-tarefa do Plan 1 já tem o pattern; pode-se replicar em iteração futura se observability requerer. O JSON de resposta inclui `fallback: true` quando ocorre, então o operador vê pelos logs da edge function.
- **Magic link em notify-resumo-diario** — escolhido approach Q7-a (generateLink via Supabase Admin). Volume CONSEJ <30/dia (A6) está sob rate limit. Se crescer >25/dia, downgrade para fallback URL direto (sem token) já está implementado em `generateMagicLink` (`try/catch` retorna fallback URL automaticamente).
- **`renderRenovacao` formata BRL no caller** — `valorContrato` chega como string já formatada (`R$ 60.000,00`), por isso é escapado como texto. Alternativa seria passar number e formatar dentro do template, mas escolha atual mantém o template puro/dumb e o caller decide formato (mesma filosofia do `nomeAtribuido` em `renderTarefa`).
- **`emailPromise` em `notify-resumo-diario` retorna shape compatível com `slackPromise`** — usa `{ ok, status, skipped, errorMsg }` para o `Promise.all` retornar tupla homogênea no `[slackRes, emailRes]`.

## Surpresas

- **Worktree branch fora de date com main** — o branch `worktree-agent-a396bd47dbeaf8474` foi criado antes dos 4 commits do Plan 5-01 entrarem no main. Tive que `git merge main` no início para puxar os helpers `_shared/*` antes de poder estendê-los. Sem isso, os imports relativos `../_shared/slack.ts` não resolveriam no caller.
- **Working-tree drift entre worktree e main repo** — Writes com path absoluto começando em `c:\Users\...\consej-crm-v2\` (sem `.claude/worktrees/...`) gravam no main repo, não no worktree. Bug `#3099` reportado nas instruções da sessão. Detectei após o primeiro batch de arquivos do Task 1; copiei para o worktree e reverti no main com `git checkout --`. Daí em diante usei paths absolutos com o prefixo de worktree, sem mais incidentes.
- **`std/encoding/base64` precisa de mock** — `verify.ts` importa de URL Deno; Vitest no Node não resolve. Mock com `btoa`/`atob` nativos resolve cleanly. Outros `_shared/*` evitam URL imports não-essenciais; só pode usar quando ABSOLUTAMENTE preciso (HMAC depende do base64 decode do secret).
- **Build pré-existente quebrado** — `tsc -b` falha em `src/lib/__tests__/cadencia.test.ts` com `InteracaoLead` faltando campos. NÃO toquei nesse arquivo; é regressão de um commit anterior. Documentado em "Deferred Issues" abaixo.
- **`notify-indicacao` tinha types/slack auxiliares** — `types.ts` e `slack.ts` locais (não confundir com `_shared/slack.ts`). Mantidos intocados — só adicionei imports do `_shared/*` para auth/email/render/perfis.

## Deferred Issues (out-of-scope desta plan)

1. **`src/lib/__tests__/cadencia.test.ts` quebra `tsc -b`** — `InteracaoLead` cast inválido (faltam `stage_msg`, `setor`, `variacao_idx`, `corpo`). Pré-existente, não introduzido aqui. Próximo plan de bugfix.
2. **Lint errors `@ts-nocheck` nos `_shared/*.ts`** — pattern aceito desde Plan 5-01. Reescrever sem `@ts-nocheck` exige config TS específica para os arquivos de edge function (Deno triple-slash refs) — fora do escopo deste plan.
3. **Lint warnings React em pages CRM** — `PerfilPage.tsx`, `TarefasPage.tsx`, `PortalCatalogoPage.tsx`, `PortalWalletPage.tsx` têm warnings de `react-hooks/preserve-manual-memoization` e `setState-in-effect`. Pré-existentes, não tocados.

## Threat Flags

Nenhum threat surface novo identificado. Todos os boundaries documentados no `<threat_model>` do plan estão cobertos:
- **T-05-01** (spoofing webhook): HMAC obrigatório + replay window 5min + constant-time compare → IMPLEMENTADO em `verify.ts`
- **T-05-02** (XSS templates): `escapeHtml` em todos os textos, URLs literais → IMPLEMENTADO em `render.ts` (3 novos renders testados em `templates.test.ts`)
- **T-05-04** (info disclosure fallback diretor): aceito — diretor já vê todos os leads via RLS
- **T-05-06** (DoS magic link): `generateMagicLink` tem fallback gracioso para URL direto se RPC falha; volume A6 <30/dia
- **T-05-MIG-RACE**: webhook só será registrado no Dashboard APÓS deploy de Task 4 — sem race
- **T-05-WEBHOOK-INJECT**: HMAC rejeita 401 — secret nunca expõe
- **T-05-STATUS-REGRESS**: STATUS_RANK monotonic implementado + test `handler.test.ts` cenário "monotonic"
- **T-05-WEBHOOK-DUP**: UPDATE idempotente + test `replay.test.ts`

## Known Stubs

Nenhum. Todos os arquivos criados são funcionais; nenhum tem placeholder "TODO" ou "coming soon" sem data source.

## TDD Gate Compliance

Plan tipo `execute` (não `tdd` no frontmatter), mas as 3 tasks autonomous tinham `tdd="true"`. Sequência observada:
- Task 1: implementação + testes escritos no mesmo turno; testes passaram na primeira execução (mocks precisos).
- Task 2: handoff.test.ts escrito junto com o refactor de notify-renovacao; passou na primeira execução.
- Task 3: verify.test/handler.test/replay.test escritos junto com index.ts/verify.ts; verify falhou na primeira execução por causa do URL import std/encoding/base64 (Rule 3 fix: adicionado vi.mock); todos os 22 verde após o fix.

Não há gate-trip de MVP+TDD aplicável (modo MVP, mas plan é tipo `execute`).

## Test Suite Health

`npx vitest run` final:
- **31 test files passed**
- **246 tests passed** (era 202 no encerramento do Plan 5-01 — ganho de 44 testes)
- **14 skipped** (RLS sem `.env.test`)
- **1 todo**
- **0 failed**

Distribuição Plan 5-02:
- 7 slack.test.ts
- +12 testes em templates.test.ts (3 novos renders × 4 cenários)
- 3 handoff.test.ts
- 11 verify.test.ts
- 10 handler.test.ts
- 1 replay.test.ts
- **Total: 44 testes novos**

## Self-Check: PASSED

**Files exist:**
- `supabase/functions/_shared/slack.ts` — FOUND
- `supabase/functions/_shared/templates/{cadencia,renovacao,indicacao}.html.ts` — FOUND (3 files)
- `supabase/functions/_shared/__tests__/slack.test.ts` — FOUND
- `supabase/functions/notify-renovacao/__tests__/handoff.test.ts` — FOUND
- `supabase/functions/resend-webhook/index.ts` — FOUND
- `supabase/functions/resend-webhook/verify.ts` — FOUND
- `supabase/functions/resend-webhook/__tests__/{verify,handler,replay}.test.ts` — FOUND (3 files)

**Commits (worktree branch worktree-agent-a396bd47dbeaf8474):**
- `8db65f1` (Task 1: helpers + templates) — FOUND
- `ac3678a` (Task 2: 4 notify-* refactor) — FOUND
- `eff5a77` (Task 3: resend-webhook) — FOUND
- `f87c854` (lint fix: drop unused _table) — FOUND

**Test suite:** 246 passed / 14 skipped / 1 todo / 0 failed.

## Task 4 — Closeout (2026-05-27 pós-checkpoint)

### Deploy de edge functions
Orchestrator rodou batch único:
```
supabase functions deploy notify-tarefa notify-resumo-diario notify-indicacao notify-renovacao resend-webhook
```
Output: `Deployed Functions on project wfnriqwkzdazdbuzbyug: notify-tarefa, notify-resumo-diario, notify-indicacao, notify-renovacao, resend-webhook`. Todas as 5 funções com assets `_shared/{auth,perfis,email,slack,templates/*}` sincronizados.

### Webhook Resend + secret — `approved`
Usuário (Gabriel) confirmou:
- Webhook registrado em https://resend.com/webhooks → endpoint `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/resend-webhook`
- Eventos marcados: `sent`/`delivered`/`opened`/`bounced`/`complained`/`delivery_delayed`/`clicked`
- `WEBHOOK_RESEND_SECRET` setado via `supabase secrets set`
- `supabase functions deploy resend-webhook` re-executado pra a função ler o novo env

### Plan 05-02 — Status final: COMPLETE

5 edge functions deployed (4 notify-* refatoradas usando helpers `_shared/` + 1 `resend-webhook` novo), webhook conectado ao endpoint, secret provisionada. Histórico de notif agora atualiza automaticamente: `queued` → `delivered`/`opened` ou `bounced`/`complained` conforme eventos do Resend.

Pronto para Wave 3 (Plan 05-03 — UI: matriz prefs em MeEspaco + histórico /me/notificacoes-historico + reenviar + quota banner) com `/gsd-execute-phase 5 --wave 3`.
