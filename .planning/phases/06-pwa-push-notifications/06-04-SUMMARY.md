---
phase: 06-pwa-push-notifications
plan: 04
subsystem: pwa-push-ui
tags: [pwa, push, notifications, ui, hooks, tdd, ios-gate]
dependency_graph:
  requires:
    - 06-01  # types CanalNotif/PreferenciasNotif/PushSubscriptionRow + migration 036 push_subscriptions
    - 06-02  # SW registration + manifest (display-mode standalone funcionando)
    - 06-03  # backend sendPush helper integrado em 4 notify-* functions
  provides:
    - src/lib/pwa.ts                       # 7 helpers PWA puros + type PushBlockReason
    - src/hooks/usePushSubscriptions.ts    # query + subscribe + unsubscribe mutations
    - src/components/me/NotificacoesPanel.tsx (estendido)  # matriz 4x3 + iOS gate + permission flow
    - src/components/me/InstalarAppCard.tsx                # card "porta sempre aberta" (D-09)
  affects:
    - src/pages/MeEspacoPage.tsx           # mount InstalarAppCard acima de NotificacoesPanel
    - src/lib/query-keys.ts                # bloco pushSubscriptions { all, byPerfil }
tech_stack:
  added: []
  patterns:
    - "TanStack Query hook trio: query + 2 mutations (subscribe/unsubscribe) com invalidate centralizado"
    - "Permission flow inline com R-L5 rollback (handlePushToggle async)"
    - "iOS gate via canSubscribePush() helper puro retornando discriminated union {ok, reason}"
    - "vi.stubEnv para testar VITE_VAPID_PUBLIC_KEY ausente sem afetar bundle"
key_files:
  created:
    - src/lib/pwa.ts
    - src/lib/__tests__/pwa.test.ts (21 tests GREEN)
    - src/hooks/usePushSubscriptions.ts
    - src/hooks/__tests__/usePushSubscriptions.test.tsx (12 tests GREEN)
    - src/components/me/InstalarAppCard.tsx
  modified:
    - src/lib/query-keys.ts (+ pushSubscriptions block)
    - src/components/me/NotificacoesPanel.tsx (matriz 4x2 -> 4x3 + iOS gate + permission flow)
    - src/components/me/__tests__/NotificacoesPanel.test.tsx (12 switches + iOS gate test)
    - src/pages/MeEspacoPage.tsx (mount InstalarAppCard)
decisions:
  - "Permission flow inline NO componente, NÃO no hook (R-L5 rollback precisa acesso ao draft local)"
  - "useSubscribePush.mutationFn NÃO chama requestPermission — caller (NotificacoesPanel) cuida disso"
  - "applicationServerKey passa ArrayBuffer explícito ao subscribe() — TS 5.9 não aceita Uint8Array<ArrayBufferLike>"
  - "iOS gate via canSubscribePush() é avaliado UMA vez no mount com useMemo — re-render natural após install captura novo state"
metrics:
  duration: "~45min"
  completed_date: 2026-05-28
  tasks_completed: 4/4
  files_changed: 8
  commits: 4
  tests_added: 33 (pwa.ts: 21; usePushSubscriptions: 12)
  tests_modified: 3 (NotificacoesPanel: 4x2 -> 4x3 + iOS gate)
requirements: [PUSH-01, PUSH-02]
---

# Phase 6 Plan 04: Subscribe Flow UI Summary

Matriz `NotificacoesPanel` cresceu de 4×2 (Slack/Email) para 4×3 (+ Push) com permission flow inline (D-12), iOS gate via tooltip (D-13), R-L5 rollback no recusar permission, e `InstalarAppCard` "porta sempre aberta" em `/me/preferencias` para Chrome (`beforeinstallprompt`) e iOS Safari (instruções manuais).

## What Shipped

**Helpers PWA puros (`src/lib/pwa.ts` — Task 4.1):**
- `isStandalone()` — combo `matchMedia(display-mode: standalone)` + iOS legacy `navigator.standalone`
- `isIOS()` — UA `/iPad|iPhone|iPod/` + guard `MSStream`
- `canSubscribePush(): {ok, reason?}` — gate ordem: unsupported → ios-not-standalone → denied
- `urlBase64ToUint8Array()` + `arrayBufferToBase64Url()` — round-trip helpers
- `subscribePush(vapidPublicKey)` → `{endpoint, p256dh, auth} | null`
- `unsubscribePush()` → `{endpoint} | null`
- Tipo exportado: `PushBlockReason = 'ios-not-standalone' | 'unsupported' | 'denied'`

**Hook TanStack Query (`src/hooks/usePushSubscriptions.ts` — Task 4.2):**
- `usePushSubscriptions(perfilId)` — query lista subscriptions do perfil
- `useSubscribePush()` — UPSERT com `onConflict: 'perfil_id,endpoint'` (Pitfall 7)
- `useUnsubscribePush()` — chama `pwa.unsubscribePush()` + DELETE; aceita endpoint manual para cleanup de row órfã
- Lê VAPID public key de `import.meta.env.VITE_VAPID_PUBLIC_KEY` (D-07); throw com mensagem clara se ausente

**`InstalarAppCard` (`src/components/me/InstalarAppCard.tsx` — Task 4.3):**
- 3 branches conditional:
  - Caso A (Chrome com `beforeinstallprompt` capturado): botão "Instalar app" que chama `deferredPrompt.prompt()`
  - Caso B (iOS Safari não-standalone): instruções numeradas "Compartilhar → Adicionar à Tela → Adicionar"
  - Caso C (Chrome sem prompt + não-iOS): instrução genérica "Use o menu do navegador → Instalar app"
- 2 listeners no useEffect: `beforeinstallprompt` (preventDefault + setDeferredPrompt) e `appinstalled` (setInstalled=true)
- **Early-return `null` quando `isStandalone() === true`** (D-09 Pitfall 9 — não polui UI de quem já instalou)
- Mount em `MeEspacoPage` tab Notificações acima de `NotificacoesPanel` (space-y-6)

**`NotificacoesPanel` 4×3 (Task 4.4):**
- Grid template-columns: `[1fr_auto_auto_auto]` — adicionada 3ª coluna Push
- `pushGate = useMemo(canSubscribePush(), [])` no mount
- `handlePushToggle(tipo, next)` async com 4 casos:
  - OFF → atualiza draft (rows em DB permanecem — D-03)
  - ON com `permission=default` → `requestPermission()` → granted=subscribe+draft ON; denied=rollback+toast.error('Permissão negada')
  - ON com `permission=granted` → se 0 subs no DB, cria; draft ON
  - `permission=denied` → switch já está disabled via gate (não chega aqui)
- **Tooltip nos switches Push quando `pushGate.ok=false`** com mensagem PT-BR contextual por reason:
  - ios-not-standalone: "Instale o app primeiro: toque em Compartilhar → Adicionar à Tela na barra do Safari."
  - denied: "Você bloqueou notificações. Reative em Configurações do navegador → Notificações."
  - unsupported: "Seu navegador não suporta notificações push."
- Botão Salvar mantém UX existente: persiste prefs JSONB inteiro em `perfis.preferencias_notif` (Phase 5 D-08 atomicidade)

## Tests Status (Scaffold → GREEN)

| Test File | Wave 0 (scaffold) | Plan 04 (this) | Δ |
|-----------|------------------|----------------|---|
| `src/lib/__tests__/pwa.test.ts` | 21 `it.todo()` | 21 ✅ GREEN | +21 |
| `src/hooks/__tests__/usePushSubscriptions.test.tsx` | 17 `it.todo()` | 12 ✅ GREEN | +12 (consolidated/dedup) |
| `src/components/me/__tests__/NotificacoesPanel.test.tsx` | 2 ✅ (Phase 5) | 3 ✅ GREEN | +1 (iOS gate) |

**Full suite:** `281 passed | 10 failed | 15 skipped | 21 todo (327 total)`.

**10 failures pre-existing** em `supabase/functions/notify-*/__tests__/*.test.ts` (refs Deno `https://esm.sh/...` que Node ESM loader rejeita — falhas existem desde commit `ffa4c49` da Phase 5 Plan 01). Fora do scope deste plan.

## Verification Run

```
$ npx tsc -b --noEmit
(exit 0 — zero errors)
```

```
$ npm test -- src/lib/__tests__/pwa.test.ts
Test Files  1 passed (1) | Tests  21 passed (21)
```

```
$ npm test -- src/hooks/__tests__/usePushSubscriptions.test.tsx
Test Files  1 passed (1) | Tests  12 passed (12)
```

```
$ npm test -- src/components/me/__tests__/NotificacoesPanel.test.tsx
Test Files  1 passed (1) | Tests  3 passed (3)
```

Grep counts (per `<verify>`):
- Task 4.1: 11 ≥ 7 ✅
- Task 4.2: 7 ≥ 4 ✅
- Task 4.3: 22 ≥ 5 ✅
- Task 4.4: 12 ≥ 5 ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `applicationServerKey` type error TS 5.9**
- **Found during:** Task 4.3 (`npx tsc -b --noEmit` após implementação)
- **Issue:** `Uint8Array<ArrayBufferLike>` returned by `urlBase64ToUint8Array` not assignable to `BufferSource` expected by `pushManager.subscribe({ applicationServerKey })`. TS 5.9 distingue ArrayBuffer vs SharedArrayBuffer via tag.
- **Fix:** Em `subscribePush`, criar ArrayBuffer explícito e copiar bytes antes de passar para `subscribe()`:
  ```ts
  const keyBytes = urlBase64ToUint8Array(vapidPublicKey)
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength)
  new Uint8Array(keyBuffer).set(keyBytes)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBuffer,
  })
  ```
- **Files modified:** src/lib/pwa.ts (Task 4.1 — fix re-commitado junto com Task 4.3)
- **Commit:** 75730c3

**2. [Rule 1 - Bug] Teste pre-existente NotificacoesPanel ainda esperava 8 Switches (4×2)**
- **Found during:** Task 4.4 (suite final)
- **Issue:** Após mudança 4×2 → 4×3, `expect(switches).toHaveLength(8)` quebrou.
- **Fix:** Atualizar para 12 + adicionar mocks de `usePushSubscriptions`/`useSubscribePush`/`useUnsubscribePush` + novo teste de iOS gate (4 switches Push disabled em jsdom sem PushManager).
- **Commit:** a4ff341

**3. [Rule 1 - Bug] vi.stubEnv para testar VITE_VAPID_PUBLIC_KEY ausente**
- **Found during:** Task 4.2 (primeiro run de teste falhou)
- **Issue:** Atribuir diretamente `import.meta.env.VITE_VAPID_PUBLIC_KEY = ''` não funciona pois Vite substitui estaticamente. Real VAPID key do projeto vazava para o teste.
- **Fix:** Trocar para `vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')` + `vi.unstubAllEnvs()` no final.
- **Commit:** 2337ad3 (incorporado no commit do hook)

### Architectural Adjustments

**Permission flow inline no componente vs hook.** O Plan 04 sugeria 2 caminhos possíveis (D-12 pode ser implementado no caller OU dentro do hook). Optei pelo caller (`NotificacoesPanel.handlePushToggle`) porque R-L5 rollback precisa acesso ao `draft` local do componente — colocar dentro do hook exigiria callback para sinalizar rollback, mais cerimônia. Hook fica focado em "subscribe to push + persist", caller decide quando chamar e como integrar com UI state.

## Manual UAT (Subscribe via UI)

**Não executado nesta wave** — deferido para Plan 05 (UAT consolidado) conforme combinação Wave 4 do plano. Backend (Plan 03) e infra subscribe (este Plan 04) prontos; smoke manual end-to-end (browser → push delivered → notification click → deep-link) acontece junto com smoke do `InstallAppBanner` e validação de iOS quando dispositivo físico disponível.

**Cenários esperados:**
- ✅ Chrome desktop standalone: toggle Push tarefa → prompt OS → aceitar → row em `push_subscriptions`
- ✅ Chrome OFF → DB row mantida (D-03) → re-ON → sem novo prompt (permission cached)
- ✅ iOS Safari não-standalone: 4 switches Push disabled + tooltip "Instale o app primeiro"
- ✅ iOS PWA standalone (após Compartilhar→Adicionar): switches enabled

## Surprises

- **TS 5.9 nova checagem `ArrayBuffer` vs `SharedArrayBuffer`:** afeta qualquer código que constrói `Uint8Array` localmente e passa para Web API que pede `BufferSource`. Snippet do RESEARCH funcionava no TS 5.4 mas não no 5.9 do projeto.
- **`vi.stubEnv` é a forma canônica para mockar `import.meta.env` em Vitest.** Atribuição direta ao objeto `env` parece funcionar mas Vite captura snapshot em bundle-time para keys conhecidas.
- **Push aparece como label em vários lugares (header + aria-labels nos switches),** exigindo `getAllByText('Push')` em vez de `getByText('Push')` no teste.

## Known Stubs

Nenhum stub — todas as funcionalidades estão wireadas a dados reais (Supabase `push_subscriptions` table + VAPID key real via env).

## Threat Flags

Nenhum threat flag novo. Threats T-06-04 (Spoofing INSERT alheio), T-06-16 (Repudiation), T-06-17 (VAPID mismatch), T-06-18 (XSS user_agent), T-06-19 (R-L5 inconsistência) — todos mitigados conforme plano:
- T-06-04 + T-06-16: RLS migration 036 (Plan 01) — usuário só insere `perfil_id = auth.uid()`
- T-06-17: erro runtime claro se `VITE_VAPID_PUBLIC_KEY` ausente
- T-06-18: `user_agent.slice(0, 500)` antes de persistir
- T-06-19: `handlePushToggle` faz rollback explícito do draft quando permission != 'granted'

## Self-Check: PASSED

**Files created/modified — exist on disk:**
- ✅ src/lib/pwa.ts
- ✅ src/lib/__tests__/pwa.test.ts
- ✅ src/hooks/usePushSubscriptions.ts
- ✅ src/hooks/__tests__/usePushSubscriptions.test.tsx
- ✅ src/components/me/InstalarAppCard.tsx
- ✅ src/lib/query-keys.ts (modified)
- ✅ src/components/me/NotificacoesPanel.tsx (modified)
- ✅ src/components/me/__tests__/NotificacoesPanel.test.tsx (modified)
- ✅ src/pages/MeEspacoPage.tsx (modified)

**Commits exist in git log:**
- ✅ b94d004 — feat(06-04-4.1): pwa.ts helpers + query-keys
- ✅ 2337ad3 — feat(06-04-4.2): usePushSubscriptions hook
- ✅ 75730c3 — feat(06-04-4.3): InstalarAppCard + mount
- ✅ a4ff341 — feat(06-04-4.4): NotificacoesPanel 4x3 + iOS gate
