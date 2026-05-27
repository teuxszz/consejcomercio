---
phase: 05-multi-channel-notifications-email
plan: 04
subsystem: portal/notifications
tags: [portal, notifications, placeholder, ui, phase-7-prep]
requires:
  - 05-03 (Switch primitive added; PreferenciasNotif interface from Plan 3)
provides:
  - portal/preferences-route (`/portal/preferencias`)
  - portal/preferences-ui-placeholder (disabled Switch + Phase 7 copy)
affects:
  - src/pages/portal/PortalLayout.tsx (nav item added)
  - src/router.tsx (route registered)
tech-stack:
  added: []
  patterns:
    - portal-page-inline-dark-theme (mirrors PortalWalletPage: #00081d bg, #6bd0e7 accents, rgba(0,137,172,0.x) borders — NO shadcn tokens)
    - placeholder-ui-no-mutation (disabled Switch, no hook, no persistence)
key-files:
  created:
    - src/pages/portal/PortalPreferenciasPage.tsx (140 lines)
  modified:
    - src/pages/portal/PortalLayout.tsx (+1 import BellRing, +1 NAV item)
    - src/router.tsx (+1 import, +1 children route)
decisions:
  - "D-10 opt (c): Switch DISABLED — no mutation/persistence. Phase 5 disparas zero notifs ao cliente (RESEARCH Open Q3 confirms); persistir agora exigiria migração desnecessária. Phase 7 plugará disparo real."
metrics:
  duration: ~15min (incluindo recovery de absolute-path drift do worktree)
  tasks_completed: 1
  files_changed: 3
  commits: 1 (Task 1)
completed: 2026-05-27
requirements_closed: [EMAIL-01]
---

# Phase 05 Plan 04: Portal Preferências (Placeholder) Summary

UI placeholder em `/portal/preferencias` com Switch desabilitado preparando o terreno para Phase 7 (Portal Docs) sem criar tech-debt de migração.

## What Was Built

### Task 1 — Portal preferences page + nav + route (commit `88fdacc`)

**Files:**
- `src/pages/portal/PortalPreferenciasPage.tsx` (NEW, 140 lines)
- `src/pages/portal/PortalLayout.tsx` (BellRing import + NAV item)
- `src/router.tsx` (PortalPreferenciasPage import + route children)

**Page structure:**
- **Header:** ícone BellRing + label "Notificações" + H1 "Preferências de notificação" + subtítulo explicativo PT-BR.
- **Info card (Phase 7 explainer):** background `rgba(0,137,172,0.08)` com ícone Info + copy: "Esta seção é preparatória. As notificações para clientes serão ativadas na **Phase 7 (Portal do Cliente — Documentos)**."
- **Documentos × email Switch (disabled):** card com label "Receber e-mails sobre documentos pendentes de aprovação" + Switch desabilitado + nota "Disponível na próxima fase." (`opacity: 0.55`).
- **Footer "Outros canais":** badges informativos para Push e WhatsApp ("em fases futuras").

**Tech-debt header comment** (top of `PortalPreferenciasPage.tsx`) documenta exatamente o que Phase 7 fará:
- Migration 036 adiciona chave `documentos` em `perfis.preferencias_notif`
- Switch passa a ser controlado via `usePreferenciasNotif` + `useSalvarPrefs`
- Edge function `notify-cliente-aprovacao` ativa o disparo real

## Decisões

### D-10 (Plan 4) — Switch DESABILITADO sem persistência (opção c)

Avaliadas 4 opções no PLAN.md:
- **(a) Adicionar chave `documentos`** ao interface + nova migration 036 — limpo mas custoso, e Phase 7 ainda assim teria que fazer a maior parte do wiring.
- **(b) Reusar chave existente como proxy** — viola D-10 ("tipos relevantes pra cliente"); confuso.
- **(c) Placeholder visual sem persistência** ✅ ESCOLHIDA — Switch desabilitado com copy explicativa.
- **(d) Persistência local (localStorage)** — cria tech-debt de migração quando Phase 7 chegar.

**Justificativa:** Specifics + RESEARCH Open Q3 confirmam que Phase 5 NÃO dispara nenhuma notificação real ao cliente. Persistir prefs agora seria UX teatral — o cliente toggleia algo que não tem efeito. Opção (c) documenta visualmente a intenção (Switch existe, copy diz "em breve") sem criar dívida técnica.

Plan 4 portanto NÃO modificou `src/types/index.ts` nem `src/hooks/usePreferenciasNotif.ts`. Escopo mantido enxuto: 1 arquivo novo + 2 modificações pequenas.

## Tech-debt explícito para Phase 7

Comentário no topo de `PortalPreferenciasPage.tsx` lista o roteiro de Phase 7:

```ts
// Phase 7 (Portal Docs) habilitará:
//  - Migration 036 adiciona chave 'documentos' em perfis.preferencias_notif
//  - Switch passa a ser controlado via usePreferenciasNotif + useSalvarPrefs
//    (mesmo pattern de src/components/me/NotificacoesPanel.tsx)
//  - Edge function notify-cliente-aprovacao ativa o disparo real do e-mail
```

Quando Phase 7 entrar:
1. Criar `supabase/migrations/036_documentos_pref_key.sql` — `UPDATE perfis SET preferencias_notif = jsonb_set(preferencias_notif, '{documentos}', '{"email": true}'::jsonb) WHERE NOT preferencias_notif ? 'documentos';`
2. Estender `PreferenciasNotif` em `src/types/index.ts` com chave `documentos: { email: boolean }`.
3. Substituir `<Switch disabled checked={false} />` por `<Switch checked={prefs?.documentos?.email ?? false} onCheckedChange={...} />` com mutation via `useSalvarPrefs` (preservando outras chaves).
4. Criar `supabase/functions/notify-cliente-aprovacao/index.ts` chamado por trigger quando `documentos.status` muda para `pendente_aprovacao_cliente`.

## Deviations from Plan

**Nenhuma deviation de design.** Plan 04 executado exatamente como escrito.

**Recovery operacional (não-deviation):** ao iniciar a execução, edições foram aplicadas inicialmente no repo principal em vez do worktree (caminho absoluto resolvendo via cwd do orchestrator — issue #3099 do system prompt). Recuperação: arquivos copiados main→worktree, alterações no main revertidas (`git checkout --` + `rm`), worktree fez `git merge main` para herdar Switch primitive e demais artefatos das Waves 1-3, depois WIP restaurado e committado normalmente. Repo principal voltou ao estado limpo pré-execução. Nenhum dado perdido. Tempo extra: ~5min.

## Verificação Manual (a executar pelo usuário)

1. `npm run dev` → login como cliente → barra de navegação do Portal mostra **"Preferências"** (ícone BellRing).
2. Clicar → `/portal/preferencias` carrega com:
   - Header "Preferências de notificação".
   - Info card explicando Phase 7.
   - Card "Documentos" com Switch CINZA (não-clicável).
   - Footer com badges Push/WhatsApp.
3. Login como interno → account switcher → Portal → mesma navegação visível, rota acessível, sem erro.
4. Sem regressão: PortalWalletPage, PortalIndicarPage, PortalCatalogoPage, PortalHistoricoPage continuam funcionando.

## Verification

- `npm run build` → ✅ exit 0 (3842 modules, 5.08s, dist/index-*.js 588 kB gzip)
- `npm test` → ✅ 256 passed, 14 skipped, 1 todo (35 test files)
- `npm run lint` → ⚠️  70 erros pré-existentes (todos em arquivos herdados via merge da main: `resend-webhook/`, `tests/rls/`, `cadencia.test.ts`). **Zero erros nos 3 arquivos modificados pelo Plan 4.** Out of scope per executor SCOPE BOUNDARY (deferir para verifier/limpeza futura).
- Acceptance criteria (`grep -c`):
  - `Phase 7` em PortalPreferenciasPage.tsx → **3** (✅ ≥1)
  - `Switch` em PortalPreferenciasPage.tsx → **5** (✅ ≥1)
  - `disabled` em PortalPreferenciasPage.tsx → **2** (✅ ≥1)
  - `/portal/preferencias` em PortalLayout.tsx → **1** (✅ ≥1)
  - `BellRing` em PortalLayout.tsx → **2** (✅ ≥1)
  - `PortalPreferenciasPage` em router.tsx → **2** (✅ ≥1)
  - Total lines PortalPreferenciasPage.tsx → **140** (✅ ≥50)

## Deferred Issues

Os 70 erros de lint pré-existentes (herdados via merge das Waves 1-3) ficam para um plan de limpeza futuro. São fora do escopo desta task UI:
- `supabase/functions/resend-webhook/__tests__/*.test.ts` — `@ts-nocheck` directives em mocks Deno
- `supabase/functions/_shared/*.ts` — idem
- `tests/rls/preferencias_notif.test.ts:55` — variável `diretor` não usada
- `src/lib/__tests__/cadencia.test.ts` — já tem fix em commit `790e867` da main (`fix(cadencia.test): cast via unknown`)

## Self-Check

**Files created:**
- `src/pages/portal/PortalPreferenciasPage.tsx` → ✅ FOUND (140 lines)

**Files modified:**
- `src/pages/portal/PortalLayout.tsx` → ✅ FOUND (BellRing import + NAV item)
- `src/router.tsx` → ✅ FOUND (PortalPreferenciasPage import + route)

**Commits:**
- `88fdacc` → ✅ FOUND in `git log`

## Self-Check: PASSED

## Phase 5 Milestone Status

Com Plan 04 fechado:
- **EMAIL-01** (preferências internas + portal placeholder) → ✅ entregue
- **EMAIL-02** (templates email + edge functions notify-*) → ✅ entregue (Waves 1-2)
- **EMAIL-03** (resend-webhook + STATUS_RANK + dedup) → ✅ entregue (Wave 2)
- **EMAIL-04** (reenviar-notificacao manual interno) → ✅ entregue (Wave 3)

**Phase 05 está completa do ponto de vista de implementação.** Pronto para `/gsd-verify-work` ou `/gsd-ship-milestone`.

**Threat model:** Plan 4 é o mais leve da phase em threat surface — UI estática sem persistência nem queries. Threats reavaliados em Phase 7 quando data flow real for ativado (notify-cliente-aprovacao + migration 036 + mutation real).
