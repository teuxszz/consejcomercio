---
phase: 5
slug: multi-channel-notifications-email
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-27
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.x (already in use) |
| **Config file** | `vitest.config.ts` (jsdom env, globals enabled) |
| **Quick run command** | `npm test` (vitest run, single pass) |
| **Full suite command** | `npm test && npm run test:rls` |
| **RLS regression** | `npm run test:rls` (vitest in `tests/rls/`) |
| **Estimated runtime** | ~25 seconds (vitest run only); ~45s with RLS suite |

---

## Sampling Rate

- **After every task commit:** Run subset — `npm test -- <related-file>.test.ts`
- **After every plan wave:** Run `npm test && npm run test:rls`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke (3 itens em §Manual-Only)
- **Max feedback latency:** 25s for subset; 45s for full

---

## Per-Requirement Verification Map

> Task IDs are filled by the planner; the rows below pre-allocate the automated coverage
> required for each requirement so the planner can wire `<automated>` blocks per task.

| Requirement | Behavior | Test Type | Automated Command | Test File (Wave 0) | Status |
|-------------|----------|-----------|-------------------|--------------------|--------|
| EMAIL-01 | Matriz 4×2 grava `preferencias_notif` no banco com optimistic update + invalidate | unit | `npm test -- src/hooks/__tests__/usePreferenciasNotif.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-01 | Smart default aplicado em `handle_new_user` (slack OFF sem `slack_user_id`) | rls | `npm run test:rls -- tests/rls/preferencias_notif.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-02 | Helper `sendEmail` retorna `skipped_idempotent` quando UNIQUE colide (ON CONFLICT) | unit | `npm test -- supabase/functions/_shared/__tests__/email.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-02 | Pre-check quota retorna `dropped_quota` sem chamar Resend quando ≥100/dia ou ≥3000/mês | unit | `npm test -- supabase/functions/_shared/__tests__/email.quota.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-02 | Template renderiza com placeholders substituídos (`{{var}}` → valor) por tipo | unit | `npm test -- supabase/functions/_shared/__tests__/templates.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-03 | `notify-tarefa` suprime self-loop (`criado_por_id == atribuido_a_id`) | unit | `npm test -- supabase/functions/notify-tarefa/__tests__/self-loop.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-03 | `notify-tarefa` dispara Slack + Email em paralelo quando ambos opt-in | unit (mock fetch) | `npm test -- supabase/functions/notify-tarefa/__tests__/parallel.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-03 | Fallback diretor quando `responsavel_id` NULL → todos com `role='diretor'` recebem | unit | `npm test -- supabase/functions/_shared/__tests__/email.fallback.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-03 | Hand-off — função cron-driven lê `responsavel_id` atual no momento do disparo | unit | `npm test -- supabase/functions/notify-renovacao/__tests__/handoff.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-04 | Histórico — RLS: consultor vê só os seus; coord+ vê todos via `is_at_least('coordenador')` | rls | `npm run test:rls -- tests/rls/notificacoes_envios.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-04 | Botão "Reenviar" insere nova linha em `notificacoes_envios` com `reenviado_por_id/em` | unit | `npm test -- src/hooks/__tests__/useReenviarNotificacao.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-04 | Webhook Resend — signature HMAC inválida retorna 401 (constant-time compare) | unit | `npm test -- supabase/functions/resend-webhook/__tests__/verify.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-04 | Webhook `email.opened` atualiza `opened_at` via match `data.email_id` ↔ `resend_id` | unit | `npm test -- supabase/functions/resend-webhook/__tests__/handler.test.ts` | ❌ W0 | ⬜ pending |
| EMAIL-04 | Webhook replay protection — `svix-id` repetido é idempotente | unit | `npm test -- supabase/functions/resend-webhook/__tests__/replay.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All 14 test files acima são **Wave 0** — nenhum existe no momento. Plano da Wave 0 (primeiro plan ou primeira task de cada plan):

- [ ] `src/hooks/__tests__/usePreferenciasNotif.test.ts` — mutation + optimistic update + invalidação
- [ ] `supabase/functions/_shared/__tests__/email.test.ts` — sendEmail mock Resend fetch
- [ ] `supabase/functions/_shared/__tests__/email.quota.test.ts` — pre-check quota diária/mensal
- [ ] `supabase/functions/_shared/__tests__/email.fallback.test.ts` — diretor fallback
- [ ] `supabase/functions/_shared/__tests__/templates.test.ts` — placeholder substitution
- [ ] `supabase/functions/notify-tarefa/__tests__/self-loop.test.ts` — D-06 regression
- [ ] `supabase/functions/notify-tarefa/__tests__/parallel.test.ts` — D-03 dual dispatch
- [ ] `supabase/functions/notify-renovacao/__tests__/handoff.test.ts` — D-07 atual responsável
- [ ] `supabase/functions/resend-webhook/__tests__/verify.test.ts` — HMAC verificação
- [ ] `supabase/functions/resend-webhook/__tests__/handler.test.ts` — event → status update
- [ ] `supabase/functions/resend-webhook/__tests__/replay.test.ts` — svix-id dedup
- [ ] `src/hooks/__tests__/useReenviarNotificacao.test.ts` — re-envio mutation
- [ ] `tests/rls/preferencias_notif.test.ts` — RLS na nova coluna
- [ ] `tests/rls/notificacoes_envios.test.ts` — RLS role-aware na nova tabela

**Framework já instalado** — sem `npm install` adicional. Vitest + jsdom + testing-library + @vitest/coverage-v8 disponíveis.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Template HTML renderiza limpo em Gmail Web + Outlook Web + Apple Mail | EMAIL-02 | Cross-client rendering não tem mock confiável; precisa de visualização real | Enviar e-mail de teste para `araujon2000@gmail.com` (Gabriel), confirmar layout em pelo menos Gmail Web mobile + desktop |
| UX do magic link (clicar do e-mail → abrir CRM já logado na tab Notificações) | EMAIL-04 | Auth flow real do Supabase + browser session — não automatizável em vitest | Disparar e-mail teste, abrir no celular, clicar link, confirmar landing direto na tab |
| Warning UI aparece em `/adocao` quando contador de quota > 80% | EMAIL-02 | Trigger por estado real do banco; UI gate visual | Em ambiente staging, simular 80+ envios em 1 dia (via seed script), abrir `/adocao` como coord, ver banner |
| R1 — verificar e-mails CONSEJ pré-cadastrados na Resend Audience (sender `onboarding@resend.dev`) | EMAIL-02 | Setup operacional, não código | Antes do merge de Plan 1: abrir Resend Dashboard → Audiences, garantir todos os internos CONSEJ listados |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (14 test files acima)
- [ ] No watch-mode flags (vitest sempre rodado com `vitest run` via `npm test`)
- [ ] Feedback latency < 45s (full suite + RLS)
- [ ] `nyquist_compliant: true` set in frontmatter
- [ ] R1 (sender verification) confirmed before Plan 1 merge

**Approval:** pending
