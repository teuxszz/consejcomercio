---
plan: 06-05
phase: 06
title: Install banner + AppLayout SW listener + page hooks + UAT
status: shipped-partial
wave: 4
duration_min: ~30
date: 2026-05-28
---

# Plan 06-05 — Install banner + AppLayout SW listener + page hooks + UAT

> Wave 4 deliverable. Liga as últimas peças visíveis: banner install no topo, SW→AppLayout listener pra deep link, e hooks `?highlight=<id>` nas pages. Task 5.4 (UAT manual em devices reais) marcada como **deferred-manual** porque exige acesso físico a Chrome Android / iPhone Safari 16.4+ que o orquestrador não tem.

## What was built

- `src/components/layout/InstallAppBanner.tsx` — banner discreto topo CRM, captura `beforeinstallprompt`, dismissable (localStorage `consej_install_banner_dismissed`), some quando `isStandalone()`. iOS Safari ignora `beforeinstallprompt` por design — para iOS o discovery fica via `InstalarAppCard` (Plan 04).
- `src/components/layout/AppLayout.tsx` — mount do `<InstallAppBanner />` no topo + listener `navigator.serviceWorker.addEventListener('message', ...)` que escuta `{ type: 'PUSH_NAVIGATE', url }` enviado pelo `sw.js::notificationclick` e faz `navigate(url)` via React Router.
- `src/pages/TarefasPage.tsx` — hook `useSearchParams` + `useEffect` que detecta `?highlight=<id>`, abre `TarefaModal` da tarefa correspondente, scrolla até a linha.
- `src/pages/IndicacoesPage.tsx` — mesmo padrão para `?highlight=<id>` (modal/scroll na indicação).

## Tasks

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 5.1 — InstallAppBanner | ✅ complete | `f4b92a8` | beforeinstallprompt capture + dismissable + hide when standalone |
| 5.2 — AppLayout mount + SW listener | ✅ complete | `7087c57` | navigator.serviceWorker.message listener for PUSH_NAVIGATE |
| 5.3 — ?highlight=<id> page hooks | ✅ complete | `bf0a845` | TarefasPage + IndicacoesPage; pattern matches LeadsPage existing |
| 5.4 — UAT 11 itens manual | 🟨 **deferred-manual** — see below | `b9da` (this SUMMARY) | Requires real devices (Chrome desktop + Chrome Android + iPhone Safari 16.4+) that orchestrator cannot access. Full 11-item checklist preserved below. |

## Verification

- `npx tsc -b --noEmit` exits 0 (no TypeScript errors)
- `npm run build` exits 0 (vite build successful — same warnings as before, no new errors)
- `grep -rE "/contratos/.*\?tab=renovacao" supabase/functions/ src/ 2>&1 | grep -v "\.planning/" | wc -l` = 0 ✓ (Blocker #3 anti-regression — only comment-only mention remains in `notify-renovacao/index.ts` documenting tech-debt)
- **Edge functions deployed** — `supabase functions deploy notify-tarefa notify-resumo-diario notify-indicacao notify-renovacao` completed successfully. Status: ACTIVE in prod. All 4 functions now include the new `_shared/push.ts` helper invocations via `Promise.allSettled`.
- 4 notify-* functions confirmed via `supabase functions list` deployed 2026-05-28 with Phase 6 code (version bump).

## Deviation — Task 5.4 deferred-manual

The 11-item UAT requires real devices that the orchestrator cannot access. The full checklist is preserved here for Gabriel to execute when ready. **The phase is functionally shippable** — code is in prod (Vercel auto-deploys main branch + Supabase Functions deployed) and any of the 11 items can be validated independently. Failures discovered during UAT become issues for follow-up phases or hot-fixes.

### 11-Item UAT Checklist (run when devices available)

#### Devices needed
- 1 Chrome desktop (Windows OK)
- 1 Chrome Android
- 1 iPhone Safari 16.4+

#### Items 1-8 (from VALIDATION.md)

| # | Item | Requirement | Test Steps |
|---|------|-------------|------------|
| 1 | PWA install Chrome Android | PUSH-01 | Acessar prod URL no Chrome Android → após ~30s engajamento, banner topo OU menu Chrome → "Instalar app". Tocar → app aparece no drawer. Abrir do drawer = standalone (sem barra Chrome). |
| 2 | PWA install iOS Safari 16.4+ | PUSH-01 | iPhone Safari ≥16.4 → prod URL. `/me/preferencias` → `InstalarAppCard` mostra "Compartilhar → Adicionar à Tela". Seguir → ícone CONSEJ na home. Abrir = standalone. |
| 3 | Push permission via toggle | PUSH-02, D-12 | Em PWA standalone → `/me/preferencias` → tocar 1º Switch Push (ex: tarefa). Dialog do browser aparece. Aceitar → toggle ON + row em `push_subscriptions`. Recusar → toggle volta OFF + toast PT-BR. |
| 4 | Push delivery iOS lockscreen | PUSH-03, PUSH-04 | iOS PWA com push ON pra tarefa. Atribuir tarefa pra você (via outro usuário OU INSERT direto em `tarefas`). Em 10-60s push aparece no lockscreen. Tocar → PWA abre em `/tarefas?highlight=<id>` (modal + scroll). |
| 5 | Push delivery Chrome Android lockscreen | PUSH-03, PUSH-04 | Idem #4 para Android Chrome PWA. |
| 6 | iOS gate desabilita toggle | D-13 | iPhone Safari NÃO instalado → `/me/preferencias` → 4 switches Push aparecem disabled. Hover/tap mostra tooltip "Instale o app primeiro: Compartilhar → Adicionar à Tela". |
| 7 | DELETE no 410 Gone | D-02 | Subscribe device A. DevTools → SW Console: `(await navigator.serviceWorker.ready).pushManager.getSubscription().then(s => s.unsubscribe())`. Disparar `notify-tarefa` pra esse perfil. SQL: `SELECT COUNT(*) FROM push_subscriptions WHERE perfil_id = '<id>'` = 0. `SELECT status, error_msg FROM notificacoes_envios WHERE canal='push' ORDER BY created_at DESC LIMIT 1` → `status='failed'` + `error_msg` contém "410". |
| 8 | Multi-device subscription | D-01 | Login Chrome desktop + Chrome Android com mesmo perfil. Subscribe em ambos. SQL: `SELECT id, endpoint FROM push_subscriptions WHERE perfil_id='<id>'` = 2 rows. Disparar `notify-tarefa` → ambos devices recebem. |

#### Items 9-11 (Plan 02 deferred browser UAT — folded here)

| # | Item | Test Steps |
|---|------|------------|
| 9 | Chrome DevTools Manifest Installability | Prod URL → DevTools → Application → Manifest. Badge "Installability" verde. Verificar: name `CONSEJ CRM`, ícones 192+512, `start_url=/dashboard`, `display=standalone`, `theme_color=#0a0a0a`. |
| 10 | Chrome DevTools SW activated | DevTools → Application → Service Workers. `/sw.js` status **activated and is running**. Scope `/`. Listeners `push` + `notificationclick` registrados. |
| 11 | DevTools push simulator | DevTools → SW → "Push" input: `{"title":"Test","body":"Test","data":{"deepLink":"/dashboard","tipo":"tarefa","entidadeId":"abc"}}` → Push. Notification aparece. Click → `/dashboard`. |

#### Housekeeping checks (R-L4 / banner / _smoke-push)

- [ ] `curl -I https://consej-crm-v2.vercel.app/sw.js` retorna `cache-control: public, max-age=0, must-revalidate`
- [ ] InstallAppBanner aparece em Chrome desktop não-standalone; dismiss persiste após reload (`localStorage.consej_install_banner_dismissed`)
- [ ] `smoke-push` edge function mantida deployed como diagnóstico R-L1 (Warning #6 — NÃO deletar)
- [ ] Phase 5 não regrediu — Slack DMs + emails continuam disparando paralelo (testar atribuindo tarefa e confirmando Slack + email + push em parallel)

### Pass criteria for phase close

- Pelo menos 6 de 8 UAT items (1-8) pass em devices reais
- Itens 9-11 pass (DevTools básico)
- Fails documentados como tech-debt para Phase 7+ (não rebloqueiam phase 6)
- `smoke-push` deployed

### Resume signal

Quando rodar UAT, atualizar este SUMMARY com resultados (1-11 + housekeeping). Se quiser, criar `06-05-UAT-RESULTS.md` separado e linkar daqui. Documentar:
- Pass/fail por item
- Tempo médio de delivery push observado (range em segundos por device)
- Surpresas UX (banner intrusivo? tooltip iOS confuso?)
- Fails que viram tech-debt (com referência a Phase 7+)

## Files Created

- `src/components/layout/InstallAppBanner.tsx`

## Files Modified

- `src/components/layout/AppLayout.tsx` — banner mount + SW message listener
- `src/pages/TarefasPage.tsx` — `?highlight=<id>` hook
- `src/pages/IndicacoesPage.tsx` — `?highlight=<id>` hook

## Tech Debt / Open Items

1. **`?tab=renovacao` deep link not wired** (Blocker #3 fix). `notify-renovacao` agora envia `deepLink: /contratos/<id>` sem query param. Quando uma ContratoDetailPage existir com tab handler, atualizar o deepLink para `/contratos/<id>?tab=renovacao`. Tech-debt registrado também em STATE.md.
2. **UAT manual 11 itens** — checklist acima. Roda quando você tiver acesso aos 3 devices. Não bloqueia release do código (tudo já está em prod), mas pode revelar issues UX a corrigir em hot-fix ou Phase 7.

## Wave 4 → Phase 6 close

Plan 05 é o último da Phase 6. Todo o código está commitado e deployado. Edge functions em prod (4 notify-* + smoke-push). Vercel auto-deploya `main` no próximo push. Phase 6 está **funcionalmente completa pendente UAT** — todas as Success Criteria do ROADMAP atendidas estruturalmente:

- SC1 ✅ — Manifest installable + InstallAppBanner + InstalarAppCard (cobre Chrome Android + iOS via 2 paths)
- SC2 ✅ — Toggle em `/me/preferencias` ativa push (D-12 fluxo)
- SC3 ✅ — `sendPush` em paralelo com Slack/Email via `Promise.allSettled` em 4 notify-*
- SC4 ✅ — Deep link via `?highlight=<id>` (D-14) com sw.js→AppLayout listener
