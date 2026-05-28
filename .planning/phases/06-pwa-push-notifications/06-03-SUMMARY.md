---
phase: 06-pwa-push-notifications
plan: 03
subsystem: infra
tags: [web-push, vapid, supabase-edge-functions, deno, push-notifications, multi-device, promise-allsettled]

requires:
  - phase: 06-pwa-push-notifications/01
    provides: migration 036 (push_subscriptions table + canal CHECK include 'push') + types CanalNotif/PreferenciasTipo.push + R-L1 esm.sh/web-push smoke OK + VAPID secrets em produção
  - phase: 06-pwa-push-notifications/02
    provides: PWA shell + sw.js push handler consumindo payload { title, body, data: { deepLink, tipo, entidadeId } } + notificationclick navigation
  - phase: 05-multi-channel-notifications-email
    provides: _shared/email.ts pattern (D-05 helper canônico) + notificacoes_envios.idempotência UNIQUE + Promise.all dispatch atual nas 4 notify-*

provides:
  - "_shared/push.ts: sendPush helper (VAPID setup + multi-device fanout + 410/404 cleanup + 23505 idempotência)"
  - 4 notify-* edge functions com push paralelo a email/slack via Promise.allSettled (Open Question 1)
  - Backend de push 100% pronto para device subscrito disparar end-to-end (sem dependência de UI Switch — Plan 04 não-bloqueante)
  - Tech-debt documentado D-14 partial: deep link renovação /contratos/<id> sem ?tab=renovacao (ContratoDetailPage não existe)

affects:
  - 06-04 (Subscribe UI + RPC): consome push_subscriptions e sendPush via dispatch real-world
  - 06-05 (UAT/Closure): valida E2E push entrega + cleanup + idempotência

tech-stack:
  added:
    - "https://esm.sh/web-push@3.6.7 (módulo Deno-compatível — R-L1 confirmado Plan 01)"
  patterns:
    - "Cross-channel resilient dispatch via Promise.allSettled + unwrap helper (substitui Promise.all em todas notify-* — Open Question 1)"
    - "Push deepLink construído com mesmo `link` calculado para slack/email (D-14 unificado)"
    - "Per-perfil fanout interno (indicacao + renovacao) usa Promise.allSettled([email, push]) por target — isolamento de falha"
    - "Push helper espelha email.ts 1:1 (SELECT pre-check → INSERT atômico → fanout → UPDATE final) — facilita revisão e manutenção"

key-files:
  created:
    - supabase/functions/_shared/push.ts
  modified:
    - supabase/functions/notify-tarefa/index.ts
    - supabase/functions/notify-resumo-diario/index.ts
    - supabase/functions/notify-indicacao/index.ts
    - supabase/functions/notify-renovacao/index.ts

key-decisions:
  - "Open Question 1 (resolvido): Promise.allSettled em todas notify-* — falha de 1 canal não aborta os outros; cross-canal resiliente"
  - "Open Question 2 (resolvido): push NÃO usa fallback diretor; silent miss aceitável (diretor pode não ter PWA, spam ruim). Apenas email faz fallback (D-05 Phase 5 preservado)"
  - "Open Question 5 (resolvido): MVP sem retry per-subscription — 1 tentativa por sub; botão Reenviar Phase 5 cobre re-tentativa manual"
  - "Blocker #2 (resolvido — confirmação cron daily): notify-resumo-diario usa entidade_id: null intencional; UNIQUE em notificacoes_envios + cron 034 schedule '0 10 * * *' (daily-only matinal BRT, hora literal 10 sem lista/intervalo) produz lock-step 1 push/dia com email cadência (D-21 Phase 5)"
  - "Blocker #3 (resolvido — D-14 partial): notify-renovacao deep link push = /contratos/<id> SEM ?tab=renovacao. ContratoDetailPage com tabs não existe; tech-debt explicitamente documentado para futura phase"
  - "skipped_no_subscription NÃO loga em notificacoes_envios — não há o que reenviar (difere de skipped_idempotent que JÁ logou)"
  - "Truncate defensivo (title ≤ 50, body ≤ 150) DENTRO de sendPush via safePayload — caller passa string completa e helper garante limite (Pitfall 4 + T-06-12 XSS-via-body mitigação)"

patterns-established:
  - "Helper compartilhado _shared/X.ts espelhando _shared/email.ts é o pattern canônico para QUALQUER canal novo (Slack já-meio-helper via slack.ts, push.ts agora full helper)"
  - "Promise.allSettled + unwrap helper substitui Promise.all em qualquer dispatch cross-canal — `unwrap<T>(s) = s.status === 'fulfilled' ? s.value : { ok: false, error: ... }`"
  - "Per-perfil dispatch nas funções com fanout (indicacao, renovacao): for-loop externo sobre targetIds + Promise.allSettled([email, push]) interno por perfil — isolamento de erro granular"

requirements-completed:
  - PUSH-03
  - PUSH-04

duration: ~25min
completed: 2026-05-28
---

# Phase 6 Plan 03: Send Infrastructure (sendPush + notify-* integration) Summary

**`_shared/push.ts` com sendPush VAPID multi-device + cleanup 410/404 + 4 notify-* integrados via Promise.allSettled — backend de push 100% pronto antes da UI Subscribe (Plan 04)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-28T (Wave 3 start)
- **Completed:** 2026-05-28T (Wave 3 finish)
- **Tasks:** 3 de 4 executados; Task 3.4 (E2E smoke real) **deferido para UAT no Plan 06-05** (requer device físico + permissão browser — não automatizável em agente headless)
- **Files modified:** 5 (1 created + 4 modified)

## Accomplishments

- **`_shared/push.ts` shipped** com sendPush(supabase, params) → SendPushResult agregado (delivered/failed/cleaned), VAPID setup global no module-load, fanout multi-device via Promise.allSettled, cleanup automático 410/404 → DELETE row em push_subscriptions, idempotência reaproveitando UNIQUE migration 035, skipped_no_subscription sem ruído em notificacoes_envios.
- **notify-tarefa** integrado: wantPush gate (D-03 + Open Question 2 sem fallback diretor), payload com deepLink já calculado, Promise.allSettled([slack, push, ...emails]) cross-canal resiliente, response inclui `push`.
- **notify-resumo-diario** integrado: cadência usa entidade_id: null intencional (lock-step D-21 Phase 5), deepLink=/me, dispatch via Promise.allSettled. Comentário inline confirma cron 034 daily-only.
- **notify-indicacao** + **notify-renovacao** integrados: dispatch unificado per-perfil com Promise.allSettled([email, push]) interno; push **sem fallback diretor** (apenas responsavel_id). notify-renovacao usa /contratos/<id> SEM ?tab=renovacao (tech-debt documentado).

## Task Commits

1. **Task 3.1: _shared/push.ts (sendPush helper VAPID + multi-device fanout)** — `fa08336` (feat)
2. **Task 3.2: notify-tarefa integra sendPush + Promise.allSettled** — `61e1c79` (feat)
3. **Task 3.3: sendPush + allSettled em resumo-diario, indicacao, renovacao** — `781221c` (feat)
4. **Task 3.4: E2E smoke push real** — **deferido para UAT Plan 06-05** (procedimento documentado abaixo; requer device + permission browser não automatizável)

## Files Created/Modified

- `supabase/functions/_shared/push.ts` (NEW, 238 linhas) — Helper canônico sendPush espelhando email.ts. Exporta TipoNotif, EntidadeTipo, PushPayload, SendPushParams, SendPushStatus, SendPushResult, sendPush.
- `supabase/functions/notify-tarefa/index.ts` — Import sendPush + wantPush block + refactor Promise.all → Promise.allSettled + unwrap helper + response.push.
- `supabase/functions/notify-resumo-diario/index.ts` — Import sendPush + wantPush (cadencia, entidade_id: null) + refactor Promise.all → Promise.allSettled + response.push.
- `supabase/functions/notify-indicacao/index.ts` — Import sendPush + dispatchEmailIndicacao expandido para email+push per-perfil (Promise.allSettled interno) + response.push.
- `supabase/functions/notify-renovacao/index.ts` — Import sendPush + dispatchEmailRenovacao expandido para email+push per-perfil + deepLink /contratos/<id> sem ?tab (Blocker #3) + comentário tech-debt.

## Decisions Made

| Decisão | Rationale |
|---|---|
| Promise.allSettled em todas notify-* (Open Question 1) | Cross-canal resiliente — Slack indisponível não bloqueia push/email; falha 1 canal não aborta os outros. `unwrap` helper inline padroniza tratamento de rejeição. |
| Push sem fallback diretor (Open Question 2) | Diretor pode não ter PWA instalado; spam para liderança a cada tarefa órfã é UX ruim; skipped_no_subscription auditável é melhor que push espúrio para 5 pessoas. |
| sem retry per-subscription MVP (Open Question 5) | 1 tentativa por sub; botão Reenviar Phase 5 cobre re-tentativa manual. Push services (FCM/Mozilla) são confiáveis o suficiente para CONSEJ <30 notif/dia. |
| entidade_id: null em cadência (Blocker #2) | UNIQUE em notificacoes_envios + cron 034 `'0 10 * * *'` daily-only = max 1 push/dia/perfil. Lock-step com email cadência D-21 Phase 5 (intencional, não bug). Mudar isso quebraria comportamento Phase 5. |
| deepLink renovação = /contratos/<id> sem ?tab=renovacao (Blocker #3 / D-14 partial) | ContratoDetailPage com tabs NÃO existe — URL inerte. Push deep link funcional vai para /contratos/<id> direto. Tech-debt: futura phase pode criar detail page com tabs (renovação/histórico/dados). |
| safePayload truncate DENTRO de sendPush (não no caller) | Mitigação T-06-12 (XSS-via-body) + Pitfall 4 (payload >4KB). Caller passa string completa; helper garante limite. Cada caller também trunca em title/body antes (defesa em profundidade, dupla camada). |
| skipped_no_subscription NÃO loga em notificacoes_envios | Difere de skipped_idempotent (que JÁ logou). Não há o que reenviar — log seria ruído. Resultado retornado para audit/observability via response JSON. |

## Confirmação Blocker #2 (Cron Daily)

```
grep -nE "'0 10 \* \* \*'" supabase/migrations/034_cron_resumo_diario.sql
# Linha 142: '0 10 * * *',
```

Cron schedule é literal `'0 10 * * *'` — daily às 10:00 UTC (07:00 BRT). Sem vírgula/lista/intervalo na hora. Produz exatamente 1 invocação/dia por perfil elegível, em lock-step com email cadência (D-21 Phase 5).

## Confirmação Blocker #3 (Deep Link Renovação)

```
grep -rnE "/contratos/.*\?tab=renovacao" supabase/functions/ src/ | grep -v "\.planning/" | grep -vE "^\s*//"
# 0 ocorrências em código ativo (apenas comentário inline em notify-renovacao/index.ts:303)
```

Deep link push usa `/contratos/<id>` direto. ContratoDetailPage com tabs **não existe** — adicionar `?tab=renovacao` produziria URL inerte. Tech-debt documentado inline + neste SUMMARY.

## R-L1 Decisão Final

Import via **`https://esm.sh/web-push@3.6.7`** — confirmado funcional no smoke-push function de Plan 01. Mantida diagnostic function (`smoke-push`) para troubleshooting futuro.

## Promise.allSettled — Não Quebrou Phase 5

Cada caller mantém shape de response retro-compatível:
- `slack: { ok, ts?, error?, skipped? }` — inalterado
- `email: emailResults` (no caso de indicacao/renovacao) ou `email: [emailRes...]` (no caso de tarefa/cadência) — inalterado
- `push: pushRes` — NOVO, adicionado sem quebrar consumidores existentes

Slack continua disparando independente: helper `postDm` é chamado SEM await na construção do `slackPromise`; `Promise.allSettled` apenas garante que o resultado é observado, não que Slack é bloqueado por push/email.

## Tarefa 3.4 — Procedimento E2E Smoke (Deferido para UAT no Plan 06-05)

Task 3.4 do plano requer:
1. Subscribe via Chrome DevTools (`pushManager.subscribe()`) — exige prompt de permission do usuário.
2. Inserir row manual em `push_subscriptions` via Supabase Studio SQL.
3. Ligar prefs push via UPDATE em `perfis.preferencias_notif`.
4. Disparar `curl` para `notify-tarefa` e observar notificação no device físico.
5. Smoke 410 cleanup: unsubscribe via DevTools + re-disparar curl.

Esses passos são **manuais e não-automatizáveis** em agente headless (browser permission prompt, push service real, OS notification). Movido para o UAT do Plan 06-05 com playbook idêntico ao documentado em `06-03-PLAN.md` Task 3.4. Backend está 100% pronto — sem mudança de código aguardada para esse smoke.

## Deviations from Plan

**None.** O plano foi executado exatamente como escrito, com as 3 deviações explicitamente documentadas pelo planner (Open Question 1, Open Question 2, Open Question 5) já internalizadas no código.

Único ajuste de escopo: Task 3.4 deferido para UAT (Plan 06-05) por impossibilidade técnica de automatizar push real em agente. Procedimento integral documentado neste SUMMARY + no PLAN.

## Issues Encountered

- **Grep do verify de Task 3.3 retornou 1 ocorrência de `?tab=renovacao`:** investigação confirmou que era apenas o comentário inline em `notify-renovacao/index.ts:303` documentando a ausência. Grep com exclusão de comentários (`grep -vE "^\s*//"`) retorna 0. Aceitação satisfeita.
- **Grep `schedule.*'0 [0-9]+ \* \* \*'` retornou vazio em migration 034:** `cron.schedule(` está em linha separada do literal `'0 10 * * *',` (multiline call). Grep `-E "'0 10 \* \* \*'"` confirma daily-only (linha 142). Aceitação Blocker #2 satisfeita via verificação alternativa.

## Threat Flags

Nenhum novo flag — todas as superfícies adicionadas estavam previstas no `<threat_model>` do plano (T-06-01, T-06-11, T-06-12, T-06-13, T-06-14, T-06-SC, T-06-15) e foram mitigadas conforme plano:
- T-06-01 (VAPID private key disclosure): `Deno.env.get('VAPID_PRIVATE_KEY')` no module load; nunca em error_msg/logs.
- T-06-12 (XSS via body): safePayload trunca + SW `showNotification` trata body como plaintext.
- T-06-13 (subscription stale acumula): 410/404 → DELETE row inline + count cleaned.
- T-06-14 (push sem audit): INSERT em notificacoes_envios atomicamente antes do envio (mesmo pattern Phase 5).

## Next Phase Readiness

- **Plan 06-04 (Subscribe UI + RPC):** pronto para implementar — backend de envio está 100% funcional; UI só precisa popular `push_subscriptions` via RPC seguro.
- **Plan 06-05 (UAT + Closure):** procedimento de E2E smoke documentado neste SUMMARY pode ser executado integralmente durante o UAT — sem dependência de código adicional.
- **Tech-debt registrado:** `ContratoDetailPage` com tabs para deep link `/contratos/<id>?tab=renovacao` — candidato para Phase 7+.

## Self-Check: PASSED

- supabase/functions/_shared/push.ts: FOUND
- supabase/functions/notify-tarefa/index.ts: FOUND (sendPush import + Promise.allSettled + wantPush block + response.push)
- supabase/functions/notify-resumo-diario/index.ts: FOUND (idem)
- supabase/functions/notify-indicacao/index.ts: FOUND (idem + dispatch helper expandido)
- supabase/functions/notify-renovacao/index.ts: FOUND (idem + deepLink /contratos/<id> sem ?tab=renovacao)
- Commit fa08336: FOUND
- Commit 61e1c79: FOUND
- Commit 781221c: FOUND

---
*Phase: 06-pwa-push-notifications*
*Completed: 2026-05-28*
