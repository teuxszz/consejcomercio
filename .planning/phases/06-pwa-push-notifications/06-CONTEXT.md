# Phase 6: PWA + Push Notifications - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** MVP (vertical slice — ROADMAP `**Mode:** mvp`)

<domain>
## Phase Boundary

Adicionar **canal Push (3º canal)** ao sistema multi-canal da Phase 5 e tornar o CRM **instalável como PWA** no Chrome Android, Chrome desktop e Safari iOS 16.4+.

**Modelo:** Push é **canal paralelo** a Slack/Email — `CanalNotif` expande de `'email' | 'slack'` para `'email' | 'slack' | 'push'`; `PreferenciasNotif` ganha 3º switch por tipo (`push: boolean`). Cada usuário escolhe quais dos 3 canais ativos por tipo (tarefa/cadência/renovação/indicação).

**Helper compartilhado:** `_shared/push.ts` espelha exatamente o pattern de `_shared/email.ts` (Phase 5 D-20). Cada `notify-tarefa` / `notify-resumo-diario` / `notify-indicacao` / `notify-renovacao` chama `sendPush()` inline após validar prefs — **sem edge function dedicada** (reinterpreta PUSH-03 igual D-20 reinterpretou EMAIL-02).

**Multi-device:** consultor pode instalar no celular Android E no notebook Chrome E no iPhone PWA e receber em todos. Tabela 1:N `push_subscriptions` (não JSONB no perfis).

**iOS-aware UX:** Safari 16.4+ só permite `Notification.requestPermission()` em PWA standalone — UI detecta e desabilita toggles com instrução inline ("Compartilhar → Adicionar à Tela") em vez de quebrar.

**Out of scope (delegado p/ phases futuras ou v2):** offline cache do app shell; offline-first via TanStack persist; rota dedicada `/notif/<id>`; push grouping/coalescing por janela; auto-prompt no first login standalone; page dedicada `/me/instalar` onboarding; iOS splash screen polish; templates push visualmente ricos (badge custom, image attachment, action buttons).

</domain>

<decisions>
## Implementation Decisions

### Subscription Storage

- **D-01:** Nova tabela `push_subscriptions` (multi-device 1:N). Schema: `id uuid PK`, `perfil_id uuid FK perfis ON DELETE CASCADE`, `endpoint text NOT NULL`, `p256dh text NOT NULL`, `auth text NOT NULL`, `user_agent text`, `last_seen_at timestamptz DEFAULT now()`, `created_at timestamptz DEFAULT now()`. **UNIQUE (perfil_id, endpoint)** — mesmo device re-subscribe atualiza last_seen_at via `ON CONFLICT DO UPDATE`.
- **D-02:** Quando web-push retorna **HTTP 410 Gone** (ou 404) o helper **DELETE** a row da `push_subscriptions` E grava `status='failed'` em `notificacoes_envios` para auditoria. Outros erros (5xx, timeout) → `status='failed'` + `error_msg`, mas **não** deletam a row.
- **D-03:** Toggle Push OFF em `/me/preferencias` → **mantém** rows em `push_subscriptions`, apenas suprime no envio (igual pattern Slack/Email D-08 Phase 5). Re-ligar = instantâneo nos devices já instalados, sem novo permission prompt. **Sem master switch** — 4 toggles per-tipo (tarefa/cadência/renovação/indicação) replicando D-08.
- **D-04:** Smart default condicional ao criar perfil (atualizar trigger `handle_new_user` da migration 011 + backfill): Push = OFF em todos os 4 tipos (sem subscription = não há onde mandar). Usuário liga manualmente após instalar PWA. **Reformula D-04 Phase 5** — Slack default condicional ao `slack_user_id`; Email sempre ON; Push sempre OFF até primeira subscription.

### Edge Function Shape

- **D-05:** **Helper compartilhado** `supabase/functions/_shared/push.ts` exporta `sendPush({ perfilId, tipo, entidadeId, payload, deepLink, opts? })`. Cada `notify-tarefa` / `notify-resumo-diario` / `notify-indicacao` / `notify-renovacao` importa e chama inline **após validar prefs**, em paralelo com `sendEmail()` (Phase 5 D-20) via `Promise.allSettled([sendEmail, sendPush])`. **Reinterpreta PUSH-03** "Edge function `notify-push`" como "lógica de push centralizada via helper compartilhado" — mesma justificativa do D-20 Phase 5 (sem round-trip HTTP extra entre funções).
- **D-06:** Biblioteca **`web-push@3.6.7` via esm.sh**: `import webpush from 'https://esm.sh/web-push@3.6.7'`. Battle-tested, VAPID JWT + payload AES-128-GCM. ~30KB no bundle do edge — aceitável (pattern já usado pra `@supabase/supabase-js`).
- **D-07:** VAPID keys gerados localmente (`npx web-push generate-vapid-keys`):
  - `VAPID_PRIVATE_KEY` → Supabase Secret (consumido pelas edge functions)
  - `VAPID_PUBLIC_KEY` → também Supabase Secret (manter simétrico p/ rotação) E exposto no client como `VITE_VAPID_PUBLIC_KEY` no `.env` do Vercel (necessário em `registration.pushManager.subscribe({ applicationServerKey })`)
  - `VAPID_SUBJECT` = `mailto:comunicacao.consej@gmail.com` (contato técnico)
- **D-08:** `notificacoes_envios.canal` CHECK expandir para incluir `'push'` via nova migration 036. Idempotência via UNIQUE existente continua funcionando (perfil_id + tipo + canal + dia + entidade_id). Push **não consome quota Resend** — `quota_resend_atual()` RPC continua filtrando por `canal='email'`, push fica fora dos contadores. Push counter (se houver UI) é separado e não bloqueia envio (gratuito até limite muito alto dos browsers).

### PWA Install Prompt UX

- **D-09:** **Banner topo do CRM** (componente novo `InstallAppBanner` em `src/components/layout/`) + **card persistente em `/me/preferencias`** (componente `InstalarAppCard` em `src/components/me/`). Banner usa `beforeinstallprompt` (Chrome Android/desktop) — captura o event, mostra banner discreto com CTA "Instalar app", dismissable (localStorage `consej_install_banner_dismissed`). iOS Safari não dispara `beforeinstallprompt` — card exibe screenshot/instrução manual "Compartilhar → Adicionar à Tela". Banner some quando `display-mode: standalone` é detectado.
- **D-10:** **PWA assets**: reusar `public/logo.png` existente, gerar **`icon-192.png` e `icon-512.png`** (PNG, maskable + any purpose) dentro da phase via script Node simples (`sharp` lib local OU gerar manualmente e commitar). `public/manifest.json`: `name: "CONSEJ CRM"`, `short_name: "CONSEJ"`, `theme_color: "#0a0a0a"` (alinhado a `--background` do tema dark default), `background_color: "#0a0a0a"`, `display: "standalone"`, `start_url: "/dashboard"`, `scope: "/"`. **Skip iOS splash screens** (fundo branco do Safari aceitável MVP).
- **D-11:** **Service Worker scope = MVP minimal**: `public/sw.js` apenas escuta `push` event (mostra notificação via `self.registration.showNotification(title, options)`) + `notificationclick` (resolve deep link de `event.notification.data.deepLink` e abre via `clients.openWindow`). **Sem cache, sem offline, sem background sync.** ~2KB. Registrado no boot da SPA (`src/main.tsx`) via `navigator.serviceWorker.register('/sw.js')`.

### Permission & iOS Gate

- **D-12:** `Notification.requestPermission()` é chamado **apenas quando usuário liga 1º toggle Push** em `/me/preferencias`. Fluxo: clique no Switch → check Permission.permission → se `default`, requesta → se aceitar, `pushManager.subscribe()` + persiste em `push_subscriptions` → toggle confirma ON. Se recusar, toggle volta a OFF + `toast.error('Permissão negada')`. **Consentimento explícito LGPD-friendly**, sem auto-prompt.
- **D-13:** **iOS Gate**: detectar `(isIOS && isSafari && !window.matchMedia('(display-mode: standalone)').matches)` → renderizar coluna Push com **4 Switches disabled** + tooltip inline "Instale o app primeiro: toque em Compartilhar → Adicionar à Tela na barra do Safari". Helper `src/lib/pwa.ts` exporta `canSubscribePush(): { ok: boolean; reason?: 'ios-not-standalone' | 'unsupported' | 'denied' }`. Detecção via UA + `display-mode` media query. **Chrome Android/desktop não passam por esse gate.**
- **D-14:** **Deep link via query params em rotas existentes** — pattern já estabelecido no CRM (LeadsPage searchParams bookmarkable):
  - Tarefa: `/tarefas?highlight=<id>` — page hook em `useEffect` faz scroll + abre `TarefaModal`
  - Lead: `/leads/<id>` (rota dedicada já existe — `LeadDetailPage`)
  - Indicação: `/indicacoes?highlight=<id>`
  - Renovação: `/contratos/<id>?tab=renovacao`
  - `deepLink` calculado no caller de `sendPush()` e enviado em `payload.data.deepLink`. SW pega de `event.notification.data` no `notificationclick`.

### Schema Extensions

- **D-15:** **Migration 036** (`036_push_subscriptions.sql`):
  - Cria tabela `push_subscriptions` (schema D-01) com RLS: usuário vê/edita só as suas (`perfil_id = auth.uid()`); coord+ vê todas via `is_at_least('coordenador')` (pattern existente Phase 5).
  - `ALTER TABLE notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_canal_check; ADD CONSTRAINT ... CHECK (canal IN ('email','slack','push'))`.
  - `ALTER TABLE perfis` — coluna `preferencias_notif` já existe (Phase 5); apenas atualizar **default JSONB** + **trigger `handle_new_user`** + **backfill** para incluir `push: false` em cada um dos 4 tipos:
    ```
    {
      "tarefa":    { "slack": <conditional>, "email": true, "push": false },
      "cadencia":  { "slack": <conditional>, "email": true, "push": false },
      "renovacao": { "slack": <conditional>, "email": true, "push": false },
      "indicacao": { "slack": <conditional>, "email": true, "push": false }
    }
    ```
  - `GRANT EXECUTE` em RPC nova (se houver) — provavelmente nenhuma RPC nova; envio via service_role nas edge functions.

### Type System Extensions

- **D-16:** `src/types/index.ts`:
  - `CanalNotif` = `'email' | 'slack' | 'push'`
  - `PreferenciasNotif` ganha `push: boolean` em cada um dos 4 tipos
  - Novo `PushSubscription` interface: `{ id, perfil_id, endpoint, p256dh, auth, user_agent, last_seen_at, created_at }`
  - `StatusNotif` continua igual (push usa `queued`, `delivered` quando 201, `failed` quando ≥400)

### Claude's Discretion

- **Forma exata da UA/standalone detection** (D-13) — planner decide entre `navigator.userAgent` parsing (frágil) vs `userAgentData.brands` (moderno mas não universal) vs combo `window.matchMedia + 'standalone' in navigator`. Recomendação: combo `display-mode: standalone` + presence test `'standalone' in window.navigator` para iOS — não depende de UA string.
- **Estrutura exata do payload push** — VAPID payload max 4KB. Recomendado: `{ title: string, body: string, data: { deepLink: string, tipo: TipoNotif, entidadeId: string } }`. Planner decide se inclui `icon`/`badge` URLs.
- **Banner copy + posicionamento** (D-09) — texto, ícone, animation. Visual fica a critério do planner desde que: PT-BR, dismissable, some quando standalone.
- **Geração dos PNGs 192/512** (D-10) — script `sharp` local OU manual via online tool (commitar diretamente). Planner escolhe.
- **Tab order em `MeEspacoPage`** — tab "Notificações" já existe (Phase 5). Coluna Push entra como 3ª na matriz, à direita de Email.
- **Multi-tab push behavior** — quando usuário tem CRM aberto em outro tab/window standalone, browser ainda mostra a notificação? Comportamento default do SW é OK (não suprimir) — não bloqueia MVP.
- **Refactor oportunista** — extrair `findDiretores()` helper se push reusa fallback do D-05 Phase 5 (responsavel_id NULL → todos diretores). Não obrigatório.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 6 entry (goal, mode=mvp, success criteria, requirements PUSH-01..04, dependencies Phase 5)
- `.planning/REQUIREMENTS.md` §PUSH-01..04 — requirements completos. **Atenção à reinterpretação documentada em D-05 (PUSH-03 vira helper, não função dedicada)**.
- `.planning/STATE.md` — pré-requisitos manuais (gerar VAPID + setar Supabase Secrets), tech-debt itens, validated assumptions

### Phase 5 Context (decisões herdadas)
- `.planning/phases/05-multi-channel-notifications-email/05-CONTEXT.md` — fundação multi-canal:
  - **D-04** (smart default condicional) — pattern replicado em D-04 desta phase
  - **D-08** (estrutura JSONB `preferencias_notif`) — Phase 6 estende para 3 canais
  - **D-20** (helper `_shared/email.ts` reinterpreta EMAIL-02) — pattern replicado em D-05/D-06 desta phase
  - **D-19** (schema `notificacoes_envios` + CHECK canal) — Phase 6 expande CHECK em D-08/D-15
- `.planning/phases/05-multi-channel-notifications-email/05-SUMMARY.md` — o que ficou shipped (multi-canal Phase 5)

### Codebase Maps
- `.planning/codebase/INTEGRATIONS.md` — Slack/Resend patterns, env vars já configuradas, webhook auth model
- `.planning/codebase/STACK.md` — versões React/Vite/Supabase/Deno + libs disponíveis
- `.planning/codebase/ARCHITECTURE.md` — edge function topology, pg_cron, layered architecture

### Existing Edge Functions (patterns to extend)
- `supabase/functions/_shared/email.ts` — **canonical pattern** que `_shared/push.ts` deve espelhar (assinatura `sendEmail`, validação de prefs, log em `notificacoes_envios`, idempotência via UNIQUE)
- `supabase/functions/_shared/auth.ts` — `constantTimeAuthCheck` (não precisa nesta phase mas referência)
- `supabase/functions/_shared/perfis.ts` — lookup helpers (`findDiretores`, `findPerfil`) — push reusa esses
- `supabase/functions/_shared/slack.ts` — Slack DM pattern (paralelo de push)
- `supabase/functions/notify-tarefa/index.ts` — **adicionar chamada `await sendPush()` em paralelo com `sendEmail()` via `Promise.allSettled`**
- `supabase/functions/notify-resumo-diario/index.ts` — idem para cadência
- `supabase/functions/notify-indicacao/index.ts` — idem para indicação per-user
- `supabase/functions/notify-renovacao/index.ts` — idem para renovação per-user

### Migrations to reference
- `supabase/migrations/004_perfis.sql` + `030_perfis_slack.sql` — schema `perfis`
- `supabase/migrations/011_auto_profile_trigger.sql` — trigger `handle_new_user` (atualizar smart default em D-04/D-15)
- `supabase/migrations/029_rls_role_aware.sql` — função SQL `is_at_least(role)` (usar nas policies de `push_subscriptions`)
- `supabase/migrations/035_notificacoes_envios.sql` — Phase 5 schema; Phase 6 estende CHECK do `canal` em migration 036
- **Última migration confirmada: `035_notificacoes_envios.sql`. Nova migration nesta phase = `036_push_subscriptions.sql`.**

### Frontend reuse
- `src/pages/MeEspacoPage.tsx` — tab "Notificações" criada na Phase 5; estender com coluna Push
- `src/components/me/NotificacoesPanel.tsx` — matriz `TipoNotif × CanalNotif`. **Phase 6: adicionar 3ª coluna Push**, conectar Switch ao flow do D-12 (request permission inline), respeitar iOS gate D-13
- `src/components/ui/switch.tsx` — primitive shadcn já adicionada na Phase 5 (commit `4da23d0`)
- `src/components/ui/tooltip.tsx` — para tooltips do iOS gate
- `src/router.tsx` — rotas `/me/preferencias` e `/me/notificacoes-historico` já existem (Phase 5)
- `src/hooks/useNotificacoes.ts` (ou nome equivalente Phase 5) — pattern de hook TanStack Query; Phase 6 cria `usePushSubscriptions` e estende `usePreferenciasNotif` para 3 canais
- `src/lib/query-keys.ts` — adicionar `pushSubscriptions`
- `src/types/index.ts` — estender `CanalNotif`, `PreferenciasNotif`, adicionar `PushSubscription` (D-16)
- `src/components/layout/AppLayout.tsx` — montar `InstallAppBanner` no topo (visível em todas as rotas CRM)
- `src/pages/LeadsPage.tsx`, `src/pages/IndicacoesPage.tsx`, etc — pattern de `useSearchParams` para deep-link `?highlight=<id>` (D-14)

### Index / Entry points (novos)
- `public/sw.js` — service worker (D-11)
- `public/manifest.json` — PWA manifest (D-10)
- `public/icon-192.png`, `public/icon-512.png` — ícones PWA (D-10)
- `index.html` — adicionar `<link rel="manifest" href="/manifest.json">` + `<meta name="theme-color" content="#0a0a0a">`
- `src/main.tsx` — registrar SW via `navigator.serviceWorker.register('/sw.js')` no boot (com feature detection)
- `src/lib/pwa.ts` (novo) — helpers: `canSubscribePush()`, `isStandalone()`, `subscribePush(vapidPublicKey)`, `unsubscribePush()`
- `supabase/functions/_shared/push.ts` (novo) — helper `sendPush({ perfilId, tipo, entidadeId, payload, deepLink })`

### External docs
- Web Push Protocol (RFC 8030): https://datatracker.ietf.org/doc/html/rfc8030
- VAPID (RFC 8292): https://datatracker.ietf.org/doc/html/rfc8292
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN Service Worker registration: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
- MDN `beforeinstallprompt`: https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
- Apple Safari Web Push docs: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- `web-push` npm: https://github.com/web-push-libs/web-push
- PWA manifest spec: https://developer.mozilla.org/en-US/docs/Web/Manifest

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`supabase/functions/_shared/email.ts`** — canonical pattern para `sendPush` espelhar. Assinatura idêntica, lookup de prefs, log em `notificacoes_envios` com idempotência via UNIQUE.
- **`supabase/functions/_shared/perfis.ts`** — `findDiretores()` (fallback responsavel_id NULL — pode ser reusado por push), `findPerfil()`.
- **`supabase/functions/notify-tarefa/index.ts`** — já tem `Promise.allSettled([sendEmail])` ou similar; Phase 6 adiciona `sendPush` no array.
- **`src/components/ui/switch.tsx`** — shadcn Switch (adicionada Phase 5, commit `4da23d0`); reusar para 3ª coluna da matriz.
- **`src/components/me/NotificacoesPanel.tsx`** — matriz atual 4×2. Estender para 4×3.
- **`src/pages/LeadsPage.tsx`** — pattern canônico de `useSearchParams` para `?highlight=<id>` bookmarkable (D-14 reusa).
- **`public/logo.png`** — fonte para gerar PNGs 192/512.

### Established Patterns
- **Helper compartilhado para canal** — `_shared/email.ts` é o pattern (D-20 Phase 5). Push segue idêntico em D-05/D-06.
- **`Promise.allSettled` paralelo de canais** — pattern já adotado para Slack+Email; Phase 6 adiciona Push no mesmo array. Falha em um canal não bloqueia outros.
- **Idempotência via UNIQUE em `notificacoes_envios`** — `(perfil_id, tipo, canal, dia, COALESCE(entidade_id))` + `ON CONFLICT DO NOTHING`. Push usa mesma constraint (após CHECK expansion).
- **RLS role-aware** — `is_at_least('coordenador')` da migration 029 aplicada em `push_subscriptions` policies.
- **TanStack Query** — pattern `useXxx` em `src/hooks/`, QUERY_KEYS centralizadas, mutations com `onSuccess` invalidando + `toast` (sonner).
- **Tipos centralizados em `src/types/index.ts`** — estender `CanalNotif`, `PreferenciasNotif`, adicionar `PushSubscription`.
- **Migrations sequenciais e imutáveis** — nova `036_push_subscriptions.sql`. **Não editar 035** (já em prod).
- **searchParams bookmarkable** — pattern de filtros e drill-down em LeadsPage / IcpDinamicoPage (D-14).
- **Vault para secrets de cron** — não aplicável aqui (sem cron novo).
- **Smart default condicional no trigger `handle_new_user`** — Phase 5 D-04 pattern; Phase 6 reaplica (Push sempre false até primeira subscription).

### Integration Points
- **`NotificacoesPanel`** (`src/components/me/`): adicionar 3ª coluna Push; conectar Switch ao flow D-12 (request permission inline) com loading state durante `subscribePush`.
- **`AppLayout`** (`src/components/layout/`): montar `InstallAppBanner` no topo (visível em todas as rotas CRM).
- **`index.html`**: adicionar `<link rel="manifest">` + `<meta name="theme-color">` + `<link rel="apple-touch-icon">`.
- **`main.tsx`**: registrar SW no boot, dentro de `if ('serviceWorker' in navigator)`.
- **`notify-tarefa` / `notify-resumo-diario` / `notify-indicacao` / `notify-renovacao`**: adicionar `sendPush()` no `Promise.allSettled` (paralelo a `sendEmail`).
- **`notificacoes_envios.canal`**: expandir CHECK via migration 036 (sem reescrever a constraint inteira — DROP + ADD).
- **`handle_new_user` trigger (migration 011)**: re-criar com novo JSONB default que inclui `push: false`. Backfill upserta `push: false` em perfis existentes.
- **Edge function deploy**: `supabase functions deploy notify-tarefa notify-resumo-diario notify-indicacao notify-renovacao` (push helper afeta todas as 4).
- **Supabase Secrets**: setar `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` — **pré-requisito manual antes do execute-phase** (já listado em STATE.md tech-debt).
- **Vercel env**: setar `VITE_VAPID_PUBLIC_KEY` no env do Vercel.

</code_context>

<specifics>
## Specific Ideas

- **Helper `_shared/push.ts` espelha exatamente `_shared/email.ts`** — assinatura, ordem de validação (prefs → fallback diretor → log), pattern de error. Reduz drift mental entre canais.
- **Multi-device é real** — consultores CONSEJ usam desktop Chrome (escritório) + celular (campo). Tabela 1:N é a única estrutura que serve esse uso. JSONB único (REQUIREMENTS-02) é insuficiente.
- **iOS gate via `display-mode: standalone` + presence check** — UX clara, não esconde funcionalidade, ensina o usuário a instalar. Não depende de UA string parsing (frágil).
- **Deep link via query params** — reusa o pattern de filtros bookmarkable já estabelecido. Hook em cada page faz `useSearchParams`, detecta `highlight`, abre modal/scroll/focus.
- **Reinterpretação de REQUIREMENTS documentada explicitamente** (D-05 reinterpretando PUSH-03) — alinhado com prática Phase 5 (D-03, D-20).
- **Service Worker minimal** — sem cache. Phase 6 é sobre infra de push; offline-first é phase própria (já em `## Future Goals` do PROJECT.md).
- **PWA install banner com 1 dismiss permanente** — não recriar friction. localStorage `consej_install_banner_dismissed` segue pattern de `consej_kanban_hint`.

</specifics>

<deferred>
## Deferred Ideas

Capturadas mas fora desta phase:

- **Push grouping/coalescing por janela de tempo** — já em `## Future Goals` do PROJECT.md (post-v3.0)
- **Cache do app shell (offline básico)** — avaliado e adiado em D-11; phase futura própria
- **Offline-first via TanStack Query persist + IndexedDB** — avaliado e adiado; refactor arquitetural fora de scope
- **Rota dedicada `/notif/<id>` genérica** — avaliado e adiado (D-14); query params em rotas existentes são mais barato e mais discoverable
- **Auto-prompt no first login standalone** — avaliado e adiado (D-12); viola best practice de consentimento explícito
- **Page dedicada `/me/instalar` onboarding** — avaliado e adiado (D-09); banner + card cobrem MVP
- **iOS splash screen polish** — fundo branco Safari aceitável MVP
- **Templates push visualmente ricos** (badge custom, image attachment, action buttons) — v2 do milestone
- **Sidebar item "Instalar app"** — avaliado e adiado (D-09); banner não polui nav permanente
- **Modal forçado de install antes de prefs** — avaliado e adiado (D-13); muito intrusivo
- **Esconder coluna Push para iOS não-standalone** — avaliado e adiado (D-13); usuário precisa descobrir que existe
- **Soft delete em `push_subscriptions` (coluna `invalidated_at`)** — avaliado e adiado (D-02); DELETE + log no `notificacoes_envios` é simpler e suficiente
- **DELETE subscriptions + `unsubscribe()` no toggle OFF** — avaliado e adiado (D-03); re-ligar instantâneo é melhor UX
- **Per-tipo toggle SEM master switch** — escolhido (D-03); sem master = consistência com Phase 5 D-08

</deferred>

---

*Phase: 06-pwa-push-notifications*
*Context gathered: 2026-05-28 via /gsd-discuss-phase 6*
