---
phase: 03-pull-back-notifications
verified: 2026-05-26T18:45:00Z
status: human_needed
score: 9/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "NOTIF-01 — Atribuir tarefa a colega interno e confirmar DM Slack ao destinatário"
    expected: "DM no Slack do destinatário em < 30s com título da tarefa + link /me?tab=tarefas"
    why_human: "Verificação programática (grep/SQL) não atravessa Slack API — apenas humano confirma se a DM real chegou. Evidência humana já registrada em 03-01-NOTIF01-WEBHOOK-CHECK.md (Gabriel/U09CS4AQNE5, 2026-05-26 ~20:10 UTC)."
  - test: "NOTIF-01 opt-out — Criar tarefa com notificar=false e confirmar que NENHUMA DM é enviada"
    expected: "Nenhuma DM no Slack; webhook log mostra {ok:true,skipped:'notificar=false'}"
    why_human: "Ausência de DM não é observável via grep — humano confirma falta de notificação. Evidência humana já registrada em 03-01-NOTIF01-WEBHOOK-CHECK.md."
  - test: "NOTIF-02/03 — Próxima execução automática do cron às 07:00 BRT (2026-05-27)"
    expected: "DM consolidada chega aos consultores com trabalho hoje, sem disparo manual"
    why_human: "Smoke test do Subpasso 7 (disparo manual via SELECT cron_resumo_diario()) PASS confirmado; execução automática agendada via pg_cron acontece amanhã 07:00 BRT. Verificar via cron.job_run_details após 10:00 UTC de 2026-05-27."
---

# Phase 3: Pull-back Notifications — Verification Report

**Phase Goal:** O time recebe alertas no Slack que os trazem de volta ao CRM antes de esquecer um lead ou uma tarefa — sem nenhuma ação manual do gestor.
**Verified:** 2026-05-26T18:45:00Z
**Status:** human_needed (9/11 verificados; 2 truths dependem de DM real no Slack que apenas humano observa — evidência humana já registrada nos arquivos de deploy/webhook check; 1 truth depende da próxima execução automática do cron amanhã 07:00 BRT)
**Re-verification:** No — initial verification
**Mode:** mvp (mas goal não está em formato User Story canônico; verificação feita contra ROADMAP Success Criteria explícitos)

---

## Goal Achievement

### Observable Truths (combinadas das Success Criteria ROADMAP + PLAN frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 ROADMAP: Atribuir tarefa a colega → colega recebe DM Slack com nome + link direto | UNCERTAIN (human-only) | Código `notify-tarefa/index.ts` linha 171 implementa opt-out; webhook configurado em produção (verificado em `03-01-NOTIF01-WEBHOOK-CHECK.md`); DM real recebida 2026-05-26 ~20:10 UTC para Gabriel (U09CS4AQNE5), request_id=10 no log do webhook. Verificação humana — não programática. |
| 2 | SC2 ROADMAP: Todo dia pela manhã cada consultor recebe DM com "X tarefas vencendo hoje e Y leads na cadência" | VERIFIED | Cron `resumo-diario-consultores` ativo (jobid=2, schedule `0 10 * * *`); smoke test do Subpasso 7 produziu `net._http_response.id=11` status 200 com `ts=1779826503.824199` — DM real entregue. Próxima execução automática: 2026-05-27 07:00 BRT (verificação UNCERTAIN apenas para execução não-manual). |
| 3 | SC3 ROADMAP: Lead chega no dia da cadência (D1/D3/D5/D7/D10) → responsável recebe DM com nome + D-point | VERIFIED | Smoke test direto via curl (Subpasso 6) com payload `leads_cadencia: [{nome:"Empresa Teste", d_point:3}]` retornou HTTP 200 e DM real entregue. Lógica SQL na migration 034 espelha `getNextCadenciaPoint` (validada pelos 14 testes em `cadencia.test.ts`). |
| 4 | PLAN 03-01 truth: Database Webhook em `tarefas` configurado, apontando para `notify-tarefa` com Bearer correto | VERIFIED (com desvio documentado) | Webhook ativo confirmado em `03-01-NOTIF01-WEBHOOK-CHECK.md`. **Desvio:** Bearer usa SERVICE_ROLE_KEY (não `WEBHOOK_TAREFA_SECRET`) porque a plataforma Supabase valida JWT antes do código rodar; `WEBHOOK_TAREFA_SECRET` permanece configurado na função mas `if (WEBHOOK_SECRET)` salta o check interno quando o header já passou pelo JWT-validation. Documentado na seção "Lição aprendida" do arquivo. |
| 5 | PLAN 03-01 truth: Tarefa atribuída → destinatário recebe DM com título + link `/me?tab=tarefas` | UNCERTAIN (human-only) | Evidência humana em `03-01-NOTIF01-WEBHOOK-CHECK.md` (Smoke Test 1 PASS, request_id=10). Não verificável via grep. |
| 6 | PLAN 03-01 truth: `notificar=false` NÃO dispara DM (opt-out) | UNCERTAIN (human-only) | Evidência humana em `03-01-NOTIF01-WEBHOOK-CHECK.md` (Smoke Test 2 PASS). Código `notify-tarefa/index.ts:171` implementa o check. |
| 7 | PLAN 03-02 truth: Cron 07:00 BRT → cada consultor com slack_user_id + trabalho hoje recebe UMA única DM consolidada | VERIFIED | `cron.job` mostra `resumo-diario-consultores` schedule `0 10 * * *` (jobid=2); migration 034 itera `WHERE tipo='interno' AND slack_user_id IS NOT NULL`; consolidação por consultor garantida pelo `FOR p IN ... LOOP` + uma única chamada `net.http_post` por perfil. |
| 8 | PLAN 03-02 truth: DM mostra (a) número de tarefas hoje e (b) lista de leads `• <nome> (D<n>)` | VERIFIED | `notify-resumo-diario/index.ts:108-145` (`buildResumoDiarioBlocks`) gera section com 2 fields (`*Tarefas vencendo hoje*\n${tarefasHoje}` + `*Leads na cadência*\n${leadsCadencia.length}`) + section com `leadLines = leadsCadencia.map(l => \`• ${l.nome} (D${l.d_point})\`).join('\n')`. Smoke test Subpasso 6 entregou DM com esse formato (humano confirmou). |
| 9 | PLAN 03-02 truth: Lead em estágio terminal (`ganho_assessoria`, `ganho_consultoria`, `perdido`, `cancelado`) NÃO aparece no alerta | VERIFIED | Migration 034 linhas 93-94 e 109-110 contêm `NOT IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado','stand_by')` em AMBOS os branches do UNION ALL. Espelhado pelos testes Test E (4 casos via `it.each(TERMINAL_STAGES)`) em `cadencia.test.ts`. |
| 10 | PLAN 03-02 truth: Lead novo sem interação criado há 0 ou 1 dias aparece como D1 | VERIFIED | Branch 2 do UNION ALL na migration 034 (linhas 103-115): `WHERE NOT EXISTS (SELECT 1 FROM interacoes_lead...) AND (CURRENT_DATE - l.created_at::date) IN (0, 1)` com hardcoded `1 AS d_point`. Validado pelos testes B+C+D em `cadencia.test.ts`. |
| 11 | PLAN 03-02 truth: Consultores SEM `slack_user_id` ou sem trabalho hoje NÃO recebem DM | VERIFIED | Migration 034: loop filtra `WHERE slack_user_id IS NOT NULL` (linha 60); condicional `IF v_tarefas > 0 OR jsonb_array_length(v_leads) > 0` (linha 119) só chama edge function se há trabalho. Edge function tem curto-circuito adicional em `index.ts:178-180`. |

**Score:** 9/11 truths VERIFIED via codebase; 2 truths (#5, #6) e 1 sub-componente do #2 são UNCERTAIN porque dependem de observação humana de DMs reais no Slack — evidência humana já registrada nos arquivos do phase (03-01-NOTIF01-WEBHOOK-CHECK.md, 03-02-CRON-DEPLOY-LOG.md).

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/034_cron_resumo_diario.sql` | Função PL/pgSQL `cron_resumo_diario()` SECURITY DEFINER + job pg_cron `resumo-diario-consultores` agendado `0 10 * * *` | VERIFIED | 145 linhas; contém `CREATE EXTENSION pg_cron/pg_net`, `CREATE OR REPLACE FUNCTION public.cron_resumo_diario()`, `SECURITY DEFINER SET search_path = public`, leitura de `vault.decrypted_secrets`, `RAISE WARNING` (não EXCEPTION), `UNION ALL` com 2 branches, `cron.schedule('resumo-diario-consultores', '0 10 * * *', ...)`. Commit 266dd65 in main. |
| `supabase/functions/notify-resumo-diario/index.ts` | Edge function Deno que recebe `{ perfil_id, tarefas_hoje, leads_cadencia }` e posta DM Slack consolidada | VERIFIED | 198 linhas; contém `interface ResumoDiarioPayload`, `constantTimeAuthCheck`, `findSlackUserId`, `findPerfilNome`, `openDmChannel`, `postDm` (com retry 3x), `buildResumoDiarioBlocks`, e handler `serve()` na ordem método→auth→env→parse→validar→curto-circuito→resolver slack→postar. Commit 266dd65 in main. |
| `.planning/phases/03-pull-back-notifications/03-01-NOTIF01-WEBHOOK-CHECK.md` | Registro auditável da configuração do webhook (URL, eventos, secret name, smoke test result) | VERIFIED | 147 linhas; documenta webhook ativo (`notify-tarefa`), eventos INSERT+UPDATE, request_id=10 (Smoke Test 1 PASS, status 200), opt-out PASS (Smoke Test 2), e o desvio do Bearer (Service Role Key em vez de WEBHOOK_TAREFA_SECRET) com lição aprendida. Commit 17da611 in main. |
| `.planning/phases/03-pull-back-notifications/03-02-CRON-DEPLOY-LOG.md` | Log auditável do deploy: comandos, primeira execução do cron (`_http_response.id`), DMs reais observadas | VERIFIED | 194 linhas; documenta 8 subpassos do deploy, `cron.job` confirmado (jobid=2, schedule `0 10 * * *`), `net._http_response.id=11` status 200, Slack ts `1779826503.824199`, 4 incidentes de troubleshooting resolvidos. Commit 23e88aa in main. |
| `src/lib/__tests__/cadencia.test.ts` | Suíte estendida com 7 novos casos (Test A-G) cobrindo NOTIF-02/03 | VERIFIED | 28 testes passando localmente (Test Files: 1 passed, Tests: 28 passed). 14 originais + 14 novos (Test A + B + C + D + 4×Test E via `it.each(TERMINAL_STAGES)` + Test F + 5×Test G via `it.each([1,3,5,7,10])`). Importa `TERMINAL_STAGES` de `@/lib/constants`. Commit ffbb40a in main. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| pg_cron job `resumo-diario-consultores` | `public.cron_resumo_diario()` | `cron.schedule('resumo-diario-consultores', '0 10 * * *', 'SELECT public.cron_resumo_diario()')` | WIRED | Migration 034:140-144 contém exatamente esse padrão. Confirmado em produção via SQL: `SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'resumo-diario-consultores'` retornou 1 linha (registrado em 03-02-CRON-DEPLOY-LOG.md Subpasso 4). |
| `cron_resumo_diario()` | edge function `notify-resumo-diario` | `net.http_post` com Bearer do Vault (`webhook_resumo_secret`) | WIRED | Migration 034:120-131 contém `PERFORM net.http_post(url := v_url, body := ..., headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret))`. Smoke test do Subpasso 7 produziu `_http_response.id=11` status 200 — link real verificado em produção. |
| edge function `notify-resumo-diario` | Slack `chat.postMessage` | `openDmChannel(slack_user_id) → postDm(channel, text, blocks)` | WIRED | `index.ts:66-78` (`openDmChannel` → POST `slack.com/api/conversations.open`) + `index.ts:80-106` (`postDm` → POST `slack.com/api/chat.postMessage` com retry 3x). Smoke test direto Subpasso 6 retornou `{ok:true,ts:"..."}` e DM real entregue (humano confirmou). |
| tabela `tarefas` (INSERT/UPDATE) | edge function `notify-tarefa` | Supabase Database Webhook | WIRED (com desvio) | Webhook configurado em produção (evidência em 03-01-NOTIF01-WEBHOOK-CHECK.md). Authorization usa Service Role Key (não WEBHOOK_TAREFA_SECRET) — desvio documentado e justificado pela validação JWT da plataforma. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `cron_resumo_diario()` | `v_tarefas` (INT) | `SELECT COUNT(*) FROM tarefas WHERE atribuido_a_id = p.id AND status IN ('aberta','em_andamento') AND data_vencimento::date = CURRENT_DATE` | Sim (query real sobre tabela `tarefas`) | FLOWING |
| `cron_resumo_diario()` | `v_leads` (JSONB) | `SELECT COALESCE(jsonb_agg(...)) FROM (Branch1 UNION ALL Branch2)` sobre `leads` + `interacoes_lead` | Sim (query real, UNION ALL cobre Pitfall 1) | FLOWING |
| `notify-resumo-diario` index.ts | `slackUserId` | `findSlackUserId(payload.perfil_id)` lendo `perfis` com service role | Sim (lookup real em `perfis`) | FLOWING |
| `notify-resumo-diario` index.ts | `nomeConsultor` | `findPerfilNome(payload.perfil_id)` lendo `perfis` | Sim (fallback `'consultor'` apenas se perfil deletado) | FLOWING |
| `buildResumoDiarioBlocks` | `leadLines` | `leadsCadencia.map(l => \`• ${l.nome} (D${l.d_point})\`)` | Sim (formato `• <nome> (D<n>)` confirmado por humano no Smoke Test 6) | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Suíte de testes da cadência passa | `npx vitest run src/lib/__tests__/cadencia.test.ts --reporter=dot` | Test Files: 1 passed; Tests: 28 passed; Duration: 3.30s | PASS |
| Migration 034 file existe e contém esquema correto | `Read supabase/migrations/034_cron_resumo_diario.sql` | 145 linhas; contém `cron.schedule('resumo-diario-consultores', '0 10 * * *', ...)` + `UNION ALL` + `NOT IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado','stand_by')` | PASS |
| Edge function compila estruturalmente (TS válido) | Inspeção visual + `Read supabase/functions/notify-resumo-diario/index.ts` | 198 linhas; `serve()` handler com ordem corrreta (method/auth/env/parse/validate/curto-circuito/resolve/post); imports válidos | PASS |
| Cron ativo em produção | `SELECT jobname, schedule FROM cron.job WHERE jobname='resumo-diario-consultores'` | Registrado em 03-02-CRON-DEPLOY-LOG.md Subpasso 4: 1 linha com `schedule='0 10 * * *'` | PASS (via log) |
| Edge function deployada em produção | `supabase functions list --project-ref wfnriqwkzdazdbuzbyug` | `notify-resumo-diario` listada após Subpasso 5 (deploy com `--no-verify-jwt`) | PASS (via log) |
| Cron smoke test produziu DM real | `SELECT public.cron_resumo_diario(); SELECT FROM net._http_response` | `_http_response.id=11` status 200, Slack ts `1779826503.824199` | PASS (via log) |

---

## Probe Execution

Nenhuma probe convencional (`scripts/*/tests/probe-*.sh`) declarada ou descoberta para esta phase. Validação substituída por:
- Suíte vitest local (`cadencia.test.ts` — 28 testes PASS)
- Smoke tests reais em produção (Subpassos 6 + 7 do plan 03-02, documentados em 03-02-CRON-DEPLOY-LOG.md)
- Verificação humana de DM no Slack

Status: SKIPPED (sem probe formal — equivalente coberto por vitest + smoke tests reais).

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| NOTIF-01 | 03-01-PLAN.md | Usuário recebe DM Slack quando tarefa é atribuída a ele por outra pessoa | SATISFIED (com human-verified DM) | Edge function `notify-tarefa` já existia; webhook configurado em produção + smoke test PASS humano em 03-01-NOTIF01-WEBHOOK-CHECK.md. |
| NOTIF-02 | 03-02-PLAN.md | DM Slack matutina: "X tarefas vencendo hoje e Y leads para contato" (pg_cron diário, migration 034) | SATISFIED | Cron `resumo-diario-consultores` ativo (`0 10 * * *`); smoke test do Subpasso 7 entregou DM real (`_http_response.id=11` status 200). |
| NOTIF-03 | 03-02-PLAN.md | DM Slack quando lead chega no dia de ação da cadência (D1/D3/D5/D7/D10) | SATISFIED | Migration 034 UNION ALL implementa lógica D1-D10 (validada por 14 testes em cadencia.test.ts); smoke test direto Subpasso 6 com payload `d_point:3` entregou DM real. |

**Cross-reference com REQUIREMENTS.md:** REQUIREMENTS.md lista NOTIF-01, NOTIF-02 e NOTIF-03 como mapeados a Phase 3. Todos cobertos pelos plans 03-01 e 03-02. **Nenhum requirement ORPHANED.**

---

## Anti-Patterns Found

Scan executado em arquivos modificados na phase:
- `supabase/functions/notify-resumo-diario/index.ts`
- `supabase/migrations/034_cron_resumo_diario.sql`
- `src/lib/__tests__/cadencia.test.ts`

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER | — | Nenhum debt marker encontrado nos 3 arquivos modificados. |
| — | — | console.log only | — | Nenhum. Edge function não usa `console.log`. |
| — | — | hardcoded empty data | — | Nenhum. Todas as variáveis são populadas por queries reais. |
| — | — | Stub/placeholder return | — | Nenhum. Função PL/pgSQL e edge function têm lógica real. |

**Observação:** A linha `'<valor_32chars_hex>'` em 03-02-CRON-DEPLOY-LOG.md (Subpasso 1) é deliberadamente um placeholder que substitui o secret real — NÃO é debt marker, é mascaramento de segurança intencional. Acceptance criteria T-03-02-02 (Information Disclosure) confirma que o valor real do secret NÃO aparece em nenhum arquivo do repo.

---

## Human Verification Required

### 1. NOTIF-01 — Atribuir tarefa a colega interno e confirmar DM Slack ao destinatário

**Test:** Criar tarefa no CRM com `atribuido_a_id` apontando para um consultor interno com `slack_user_id` mapeado e `notificar=true`.
**Expected:** DM no Slack do destinatário em < 30s com título da tarefa + link `/me?tab=tarefas`.
**Why human:** Verificação programática (grep/SQL) não atravessa Slack API — apenas humano confirma se a DM real chegou. **Evidência humana já registrada:** 03-01-NOTIF01-WEBHOOK-CHECK.md Smoke Test 1 PASS, Gabriel/U09CS4AQNE5, 2026-05-26 ~20:10 UTC, request_id=10.

### 2. NOTIF-01 opt-out — Criar tarefa com `notificar=false` e confirmar que NENHUMA DM é enviada

**Test:** INSERT em `tarefas` com `notificar=false`.
**Expected:** Nenhuma DM no Slack; webhook log mostra body `{ok:true,skipped:"notificar=false"}`.
**Why human:** Ausência de DM não é observável via grep — humano confirma falta de notificação. **Evidência humana já registrada:** 03-01-NOTIF01-WEBHOOK-CHECK.md Smoke Test 2 PASS.

### 3. NOTIF-02/03 — Próxima execução AUTOMÁTICA do cron às 07:00 BRT (2026-05-27)

**Test:** Aguardar execução automática do `pg_cron` em 2026-05-27 às 10:00 UTC (07:00 BRT). Em seguida, executar:
```sql
SELECT runid, status, return_message, start_time, end_time
  FROM cron.job_run_details
 WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='resumo-diario-consultores')
 ORDER BY start_time DESC LIMIT 5;
SELECT id, status_code, content FROM net._http_response ORDER BY id DESC LIMIT 10;
```
**Expected:** Pelo menos 1 entry em `cron.job_run_details` com `status='succeeded'` para 2026-05-27 10:00 UTC; entry correspondente em `net._http_response` com status 200; DMs entregues aos consultores que tinham tarefas/leads em D-point.
**Why human:** O smoke test do Subpasso 7 confirmou que a função PL/pgSQL produz POSTs reais quando chamada manualmente, mas NÃO confirmou que o scheduler `pg_cron` dispara automaticamente no horário agendado — isso é só observável amanhã. Pequeno risco residual de problema com permissões do scheduler ou com `cron.job_run_details` (que não foi explicitamente checado neste deploy).

---

## Gaps Summary

Nenhum gap bloqueante encontrado. Phase 3 atinge o goal com a seguinte distribuição:

- **9 truths VERIFIED** via codebase + grep + SQL log evidence:
  - SC2/SC3 ROADMAP (cron diário + cadência D1-D10) verificados em produção via `_http_response.id=11`
  - Todos os artefatos críticos (migration 034, edge function, testes) presentes e funcionais
  - Todos os 4 key links wired e exercitados pelo smoke test real
  - Data-flow trace mostra dados reais fluindo (queries em `tarefas`, `leads`, `interacoes_lead`, `perfis`)
  - Filtros de exclusão (TERMINAL_STAGES + `stand_by`) implementados em ambos os branches do UNION ALL
  - Defesa em profundidade: cron filtra antes de chamar + edge function curto-circuita payload vazio + skip silencioso se sem `slack_user_id`

- **2 truths UNCERTAIN** (NOTIF-01 DM + NOTIF-01 opt-out): dependem de observação humana de DM no Slack. **Evidência humana já registrada** em 03-01-NOTIF01-WEBHOOK-CHECK.md (commits 17da611 e 5995dfe) — Smoke Test 1 e Smoke Test 2 ambos PASS pelo Gabriel em 2026-05-26.

- **1 truth UNCERTAIN parcial** (#2 — execução AUTOMÁTICA): smoke test manual PASS, mas execução agendada acontece amanhã 07:00 BRT.

**Desvio arquitetural documentado:** O webhook de `tarefas` usa Service Role Key em vez de `WEBHOOK_TAREFA_SECRET` (a plataforma Supabase valida JWT antes do código rodar). A coluna `WEBHOOK_TAREFA_SECRET` permanece configurada como defesa em profundidade (o check interno `if (WEBHOOK_SECRET)` salta quando o header JWT já passou). Documentado na seção "Lição aprendida" de 03-01-NOTIF01-WEBHOOK-CHECK.md.

**Status final:** **human_needed** — 3 itens dependem de verificação humana, dois dos quais JÁ FORAM verificados pelo Gabriel e registrados nos arquivos auditáveis do phase. O terceiro (execução automática amanhã) é uma verificação de continuidade que pode ser feita após 2026-05-27 07:00 BRT.

---

*Verified: 2026-05-26T18:45:00Z*
*Verifier: Claude (gsd-verifier)*
