# Phase 6: PWA + Push Notifications - Research

**Researched:** 2026-05-28
**Domain:** PWA installability + Web Push Protocol (VAPID) + multi-canal notification fanout
**Confidence:** HIGH (architecture locked em CONTEXT.md; pesquisa foca em HOW)

## RESEARCH COMPLETE

> Marcador no topo para detecção do orquestrador. Estrutura completa abaixo.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (16 total)

| ID | Decisão |
|----|---------|
| **D-01** | Nova tabela `push_subscriptions` multi-device 1:N. Schema: `id uuid PK`, `perfil_id uuid FK perfis ON DELETE CASCADE`, `endpoint text NOT NULL`, `p256dh text NOT NULL`, `auth text NOT NULL`, `user_agent text`, `last_seen_at timestamptz DEFAULT now()`, `created_at timestamptz DEFAULT now()`. **UNIQUE (perfil_id, endpoint)** — re-subscribe atualiza last_seen_at via `ON CONFLICT DO UPDATE`. |
| **D-02** | HTTP 410 Gone (ou 404) → **DELETE row** de `push_subscriptions` + grava `status='failed'` em `notificacoes_envios`. Outros erros (5xx, timeout) → `status='failed'` + `error_msg`, sem deletar. |
| **D-03** | Toggle Push OFF mantém DB, apenas suprime envio. Re-ligar = instantâneo, sem novo permission prompt. **Sem master switch** — 4 toggles per-tipo (tarefa/cadência/renovação/indicação). |
| **D-04** | Smart default: Push = OFF em todos 4 tipos até primeira subscription. Reformula D-04 Phase 5 (Slack condicional, Email sempre ON, **Push sempre OFF**). |
| **D-05** | **Helper compartilhado** `supabase/functions/_shared/push.ts` exporta `sendPush({ perfilId, tipo, entidadeId, payload, deepLink, opts? })`. Chamado inline em paralelo com `sendEmail()` via `Promise.allSettled`. **Reinterpreta PUSH-03**: helper, não edge function dedicada. |
| **D-06** | **`web-push@3.6.7` via esm.sh**: `import webpush from 'https://esm.sh/web-push@3.6.7'`. ~30KB bundle edge. |
| **D-07** | VAPID keys (`npx web-push generate-vapid-keys`): `VAPID_PRIVATE_KEY` + `VAPID_PUBLIC_KEY` em Supabase Secrets; `VITE_VAPID_PUBLIC_KEY` no Vercel env. `VAPID_SUBJECT = mailto:comunicacao.consej@gmail.com`. |
| **D-08** | `notificacoes_envios.canal` CHECK expandir para `('email','slack','push')` via migration 036. Idempotência via UNIQUE existente continua. Push **não consome quota Resend** — `quota_resend_atual()` continua filtrando `canal='email'`. |
| **D-09** | **`InstallAppBanner`** topo CRM (`src/components/layout/`) usa `beforeinstallprompt`, dismissable via `localStorage` (`consej_install_banner_dismissed`). **`InstalarAppCard`** em `/me/preferencias` (`src/components/me/`). iOS Safari não dispara `beforeinstallprompt` — card mostra instrução manual "Compartilhar → Adicionar à Tela". Banner some quando `display-mode: standalone`. |
| **D-10** | PWA assets: reusar `public/logo.png`, gerar `icon-192.png` + `icon-512.png` (maskable + any purpose). `public/manifest.json`: `name: "CONSEJ CRM"`, `short_name: "CONSEJ"`, `theme_color: "#0a0a0a"`, `background_color: "#0a0a0a"`, `display: "standalone"`, `start_url: "/dashboard"`, `scope: "/"`. **Skip iOS splash screens**. |
| **D-11** | **SW minimal** `public/sw.js`: só `push` event + `notificationclick`. **Sem cache, sem offline, sem background sync.** ~2KB. Registrado em `src/main.tsx` via `navigator.serviceWorker.register('/sw.js')`. |
| **D-12** | `Notification.requestPermission()` é chamado **apenas no clique do 1º toggle Push** em `/me/preferencias`. Fluxo: clique Switch → check permission → se `default` requesta → se aceita, `pushManager.subscribe()` + persiste. Recusou → toggle volta OFF + `toast.error('Permissão negada')`. |
| **D-13** | iOS Gate: `(isIOS && isSafari && !window.matchMedia('(display-mode: standalone)').matches)` → coluna Push com 4 Switches `disabled` + tooltip "Instale o app primeiro: toque em Compartilhar → Adicionar à Tela". Helper `src/lib/pwa.ts` exporta `canSubscribePush()`. |
| **D-14** | **Deep link via query params** em rotas existentes: `/tarefas?highlight=<id>`, `/leads/<id>`, `/indicacoes?highlight=<id>`, `/contratos/<id>?tab=renovacao`. Calculado no caller de `sendPush()`, enviado em `payload.data.deepLink`. |
| **D-15** | Migration 036 cria `push_subscriptions` com RLS (próprio + `is_at_least('coordenador')`), ALTER CHECK `canal`, atualiza `handle_new_user` + backfill com `push: false`. |
| **D-16** | `CanalNotif` = `'email' \| 'slack' \| 'push'`; `PreferenciasNotif` ganha `push: boolean` em cada tipo; novo `PushSubscription` interface. `StatusNotif` igual (push usa `queued`/`delivered`/`failed`). |

### Claude's Discretion (6 áreas)
- Forma exata UA/standalone detection — **recomendação CONTEXT.md:** combo `display-mode: standalone` + `'standalone' in navigator` (não UA string parsing)
- Estrutura exata do payload push — máx 4KB. Recomendado: `{ title, body, data: { deepLink, tipo, entidadeId } }`. Planner decide se inclui `icon`/`badge`
- Banner copy + posicionamento — PT-BR, dismissable, some quando standalone
- Geração dos PNGs 192/512 — script `sharp` local OU online tool + commit
- Tab order em `MeEspacoPage` — coluna Push entra como 3ª (direita de Email)
- Refactor oportunista: extrair `findDiretores()` se push reusa fallback (não obrigatório)

### Deferred Ideas (OUT OF SCOPE — 13 itens)
- Push grouping/coalescing por janela; cache app shell (offline); offline-first TanStack persist; rota dedicada `/notif/<id>`; auto-prompt no first login standalone; page dedicada `/me/instalar` onboarding; iOS splash screen polish; templates push visualmente ricos (badge custom, image, action buttons); sidebar item "Instalar app"; modal forçado de install antes de prefs; esconder coluna Push para iOS não-standalone; soft delete em `push_subscriptions`; DELETE subscriptions + `unsubscribe()` no toggle OFF.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PUSH-01** | App registra Service Worker e habilita PWA install prompt (manifest.json + ícones 192/512). Instalável em Chrome Android e Safari iOS 16.4+. | §Service Worker, §Manifest, §Install Banner, §iOS Gate |
| **PUSH-02** | Usuário ativa/desativa push em `/me/preferencias` via Push API + VAPID. Subscription persistida (D-01 expande para tabela 1:N). | §Subscription Flow, §Migration 036, §NotificacoesPanel extension |
| **PUSH-03** | **REINTERPRETADO em D-05**: helper `_shared/push.ts` (não edge function dedicada). Dispara web-push para subscriptions ativas em paralelo com Slack/Email. | §sendPush Helper, §notify-* Integration |
| **PUSH-04** | Notificação clicada abre CRM no deep link relevante (`/tarefas?highlight=<id>`, `/leads/<id>`, etc.). | §Service Worker (notificationclick), §Deep Link Routing |

</phase_requirements>

---

## Summary

Phase 6 adiciona Push como 3º canal (paralelo a Slack/Email da Phase 5) e torna o CRM instalável como PWA. A arquitetura está **completamente locked em CONTEXT.md (16 decisões)**, então esta pesquisa foca em **HOW**: protocolo Web Push, biblioteca `web-push@3.6.7` em Deno, lifecycle de Service Worker no Vite, particularidades do iOS Safari 16.4+, e os exatos pontos de integração com o código existente.

O caminho crítico tem 5 mudanças: (1) **migration 036** — tabela `push_subscriptions` + ALTER CHECK em `notificacoes_envios.canal` + trigger `handle_new_user` + backfill; (2) **`_shared/push.ts`** espelhando `_shared/email.ts` literalmente (quota check removida, idempotência mantida, 410→DELETE adicionado); (3) **`public/sw.js` + `public/manifest.json` + ícones**; (4) **`src/lib/pwa.ts`** com helpers `canSubscribePush`/`isStandalone`/`subscribePush`/`unsubscribePush`/`urlBase64ToUint8Array`; (5) **extensão da matriz** em `NotificacoesPanel` (4×2 → 4×3) com permission flow inline (D-12) e iOS gate (D-13).

**Primary recommendation:** **Espelhar 1:1 o pattern `_shared/email.ts`** — mesma assinatura de função, mesmo INSERT atômico para idempotência, mesma estrutura de retorno `SendPushResult`. A única divergência conceitual é o erro 410/404 (DELETE row em `push_subscriptions`) e o multi-target (uma chamada `sendPush` por **subscription** do perfil, não 1 chamada por perfil — porque consultor pode ter celular + desktop ambos subscritos).

**Risco material a flag:** D-06 escolheu `esm.sh/web-push@3.6.7`, mas a [documentação oficial Supabase usa `npm:web-push`](https://supabase.com/docs/guides/functions/examples/push-notifications) e a [postagem de referência também](https://www.originalobjective.com/blog/from-lovable-app-to-mobile-pwa-push-notifications-with-supabase). O `esm.sh` polyfilla `node:crypto` mas tem [limitações conhecidas com ECDH](https://github.com/denoland/deno/issues/18416), que é exatamente o que web-push usa para gerar VAPID JWT + criptografar payload. Recomendação: **manter `esm.sh` como locked (D-06) mas validar em smoke-test no início do Plano** — se falhar, trocar para `npm:web-push@3.6.7` (mesma versão, mesma API, importa sem outras mudanças). Está em §Risks & Landmines como R-L1.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Service Worker registration | Browser | — | SW é runtime do browser; registrado pelo SPA no boot |
| Service Worker (push + notificationclick handler) | Browser (worker thread) | — | SW roda fora da main thread; recebe push do browser push service |
| PWA manifest + ícones | CDN/Static (Vercel) | — | Servidos como assets estáticos em `/manifest.json`, `/icon-192.png`, `/icon-512.png`, `/sw.js` |
| beforeinstallprompt capture + install banner UI | Browser | — | Evento de janela; UI ad-hoc no AppLayout |
| iOS gate detection (`display-mode: standalone`) | Browser | — | matchMedia API; runtime decision |
| Notification.requestPermission() | Browser | — | Disparado no clique do toggle (D-12) |
| pushManager.subscribe() → POST endpoint+p256dh+auth | Browser → API (Supabase REST) | — | Browser gera subscription, hook TanStack Query insere em `push_subscriptions` via supabase client |
| VAPID keypair generation | Manual (local CLI) | — | `npx web-push generate-vapid-keys` rodado uma vez pelo Gabriel; chaves vão p/ Supabase Secrets + Vercel env |
| `sendPush()` helper (VAPID JWT + AES-128-GCM encrypt + POST push endpoint) | API (Supabase Edge Function — Deno) | — | Privilegiado (private key); roda nas 4 funções existentes |
| 410/404 cleanup (DELETE push_subscriptions row) | API (Supabase Edge Function) | Database (RLS via service_role) | Edge function detecta resposta e faz DELETE; serviço-role bypassa RLS |
| Push subscription storage | Database (Postgres + RLS) | — | RLS: usuário vê só as suas; coord+ vê todas via `is_at_least('coordenador')` |
| Preferences (`preferencias_notif.push.<tipo>`) | Database (perfis.preferencias_notif JSONB) | — | Mesmo JSONB existente da Phase 5; só amplia structure |
| Deep link routing (notification click → URL com `?highlight=`) | Browser (SW) → Frontend Server (React Router) | — | SW chama `clients.openWindow(url)` ou `client.focus() + postMessage`; React Router parse query params na page |
| Idempotência (`notificacoes_envios` UNIQUE) | Database (UNIQUE partial index migration 035) | — | Reaproveitado da Phase 5; CHECK em `canal` expandido p/ `push` |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `web-push` | `3.6.7` | VAPID JWT + payload AES-128-GCM encryption + POST ao push endpoint | Battle-tested (8+ anos, 2.5M downloads/sem); usado pelo [pattern Supabase oficial](https://supabase.com/docs/guides/functions/examples/push-notifications). [VERIFIED: npm registry — npm view web-push version → 3.6.7] |

**Version verification (executado nesta sessão):**
- `npm view web-push version` → `3.6.7` ✅
- `npm view web-push time.modified` → `2024-01-16T13:48:01.234Z` (estável, ~1 ano sem updates — biblioteca madura)
- `npm view web-push scripts.postinstall` → vazio (sem postinstall scripts suspeitos)

### Supporting (já no projeto — nenhum novo dep no frontend)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `@tanstack/react-query` | 5.90.x | Cache push_subscriptions + mutations subscribe/unsubscribe | Já presente |
| `sonner` | 2.0.x | `toast.success`/`toast.error` no flow de permission | Já presente |
| `@radix-ui/react-switch` | 1.2.6 | 3ª coluna da matriz | Já presente (shadcn `switch.tsx`) |
| `@radix-ui/react-tooltip` | 1.2.8 | Tooltip do iOS gate | Já presente |
| `lucide-react` | 0.577.x | Ícones (Download, Smartphone, X) | Já presente |

### Alternatives Considered (rejeitadas — locked em D-06)

| Instead of | Could Use | Tradeoff (por que NÃO) |
|------------|-----------|------------------------|
| `esm.sh/web-push@3.6.7` (D-06) | `npm:web-push@3.6.7` | npm: specifier é o pattern oficial Supabase 2024+; flag como R-L1 mas D-06 está locked |
| `esm.sh/web-push` | `jsr:@negrel/webpush` | Implementação Web Crypto-first (Deno-native); risco de bugs em biblioteca menor; rejeitado por estar fora do pattern do projeto |
| `esm.sh/web-push` | `@block65/webcrypto-web-push` | Multi-runtime (Cloudflare Workers, Bun, Deno) sem polyfill node:crypto; rejeitado por desvio de canon |

**Installation:** Nenhum `npm install` necessário — web-push só roda no Deno edge function via URL import (D-06).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `web-push` | npm | 8+ anos (3.6.7 modified 2024-01-16) | ~2.5M/semana | [github.com/web-push-libs/web-push](https://github.com/web-push-libs/web-push) | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** nenhum
**Packages flagged as suspicious [SUS]:** nenhum
**slopcheck verdict (executado nesta sessão):** `slopcheck install web-push` → `[OK] web-push (npm)` → 1 scanned, 1 OK.

---

## Domain Overview

### Web Push Protocol (RFC 8030 + RFC 8292 VAPID)

**Como funciona end-to-end:**

1. **VAPID identity** — servidor (nossa edge function) tem keypair ECDSA P-256:
   - Private key (~32 bytes raw, base64url-encoded ~43 chars) — Supabase Secret
   - Public key (~65 bytes raw uncompressed, base64url ~87 chars) — exposta no `applicationServerKey` do client + Supabase Secret p/ servidor

2. **Browser subscribe** — usuário aceita permission, `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })` retorna `PushSubscription`:
   ```
   {
     endpoint: "https://fcm.googleapis.com/fcm/send/cXY..." (FCM/Mozilla/Apple),
     expirationTime: null,
     keys: {
       p256dh: "BNZ...",  // client public key (256 bits → base64url ~87 chars)
       auth: "abc..."     // 16-byte client secret (base64url ~22 chars)
     }
   }
   ```
   Persistimos `endpoint`, `p256dh`, `auth` em `push_subscriptions` (D-01).

3. **Servidor envia push** (web-push library faz tudo):
   - Gera VAPID JWT (assinado com private key, válido 24h, contém `aud` = origin do endpoint, `exp`, `sub` = `mailto:...`)
   - Criptografa payload com AES-128-GCM usando shared secret ECDH(`p256dh` + ephemeral key) + `auth` salt
   - `POST <endpoint>` com headers `Authorization: vapid t=<JWT>, k=<pubkey>`, `Encryption: salt=...`, `Crypto-Key: dh=...; p256ecdsa=...`, body = ciphertext
   - Push service (FCM/Mozilla/Apple) entrega para o browser do usuário

4. **Browser recebe** — Service Worker dispara `push` event com `event.data.json()` (payload descriptografado automaticamente pelo browser).

5. **SW mostra notificação** — `self.registration.showNotification(title, options)` (required em Chrome para evitar push silencioso).

6. **Usuário clica** — SW dispara `notificationclick` → `event.notification.data.deepLink` → `clients.openWindow(url)` ou focus + postMessage.

### Payload Size Limits

| Constraint | Limit |
|------------|-------|
| Max payload size (bytes, ciphertext) | **4096 bytes** (RFC 8291) |
| Effective JSON payload | ~3800 bytes (margem para encryption overhead 256 bytes + headers) |
| Recomendado | < 2 KB para garantir delivery cross-browser |

[CITED: pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes]

### Push Service Error Codes (web-push response)

| Status | Significado | Ação |
|--------|-------------|------|
| 201 Created | Aceito p/ entrega | `status='delivered'` em `notificacoes_envios` |
| 400 Bad Request | Payload malformado / JWT inválido | `status='failed'` + log; **não** deletar subscription |
| 401 Unauthorized | VAPID JWT inválido/expirado | `status='failed'` + log; **não** deletar (problema é servidor) |
| 403 Forbidden | VAPID public key não bate com subscription | `status='failed'`; **não** deletar |
| 404 Not Found | Endpoint inválido (subscription nunca existiu) | **DELETE row** + `status='failed'` (D-02) |
| **410 Gone** | Subscription expirou (usuário desinstalou app / revogou permission) | **DELETE row** + `status='failed'` (D-02) — caso mais comum em produção |
| 413 Payload Too Large | Payload > 4096 bytes | `status='failed'`; **não** deletar |
| 429 Too Many Requests | Rate limit | `status='failed'`; **retry exponencial 3x** (mirror padrão `_shared/email.ts`) |
| 500-503 | Push service indisponível | `status='failed'`; **retry exponencial 3x** |

[CITED: pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed]

### Browser Compatibility (relevant para CONSEJ)

| Browser | Push API | Notes |
|---------|----------|-------|
| Chrome Android 50+ | ✅ | Plataforma alvo principal (consultor no campo) |
| Chrome Desktop 50+ | ✅ | Plataforma alvo secundária (escritório) |
| Firefox 44+ | ✅ | Não é alvo prioritário |
| Edge 17+ | ✅ | Usa stack Chromium |
| **Safari iOS 16.4+** (mar/2023) | ✅ **only as PWA** | Alvo principal mobile iPhone — exige instalação Adicionar à Tela [VERIFIED: caniuse + Apple WebKit docs] |
| Safari macOS 16+ | ✅ | Funciona em browser normal (sem PWA) |
| Safari iOS <16.4 | ❌ | iOS Gate (D-13) cobre |

Feature detection: `'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`

[VERIFIED: MDN Push API + Apple WebKit release notes Safari 16.4]

---

## Implementation Patterns by Feature Area

### 1. Service Worker (`public/sw.js`)

**Decisão (D-11):** plain JS, ~2KB, sem cache, sem offline. Apenas `push` + `notificationclick`.

**TypeScript vs JS:** D-11 implica JS direto. Plano deve manter JS — colocar TS aumenta complexidade (precisaria compile step, `lib: ["WebWorker"]` em tsconfig separado) sem ganho real para ~50 linhas de código.

**Conteúdo recomendado (skeleton, planner finaliza):**

```javascript
// public/sw.js — minimal SW: push + notificationclick (Phase 6 D-11)

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'CONSEJ CRM', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'CONSEJ CRM';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png', // mesmo arquivo aceitável MVP
    data: payload.data || {},
    tag: payload.data?.tipo || 'consej',   // coalescing simples por tipo
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || '/dashboard';
  const targetUrl = new URL(deepLink, self.location.origin).href;

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Tenta focar tab existente do CRM e navegar
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        // Cliente em controle — navega via postMessage (React Router escuta)
        client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl });
        return;
      }
    }
    // Nenhuma tab aberta — abre nova
    await self.clients.openWindow(targetUrl);
  })());
});
```

**Lifecycle Vite (gotcha crítico):**
- SW DEVE ficar em `public/sw.js` — Vite serve `public/` como raiz estática sem hash/bundle. Se ficasse em `src/`, viria com hash de build e o registration de origem `/sw.js` falharia.
- Scope: registrar com `/sw.js` (sem path) dá scope `/`. CRM serve `/`, então cobre tudo. **Não usar** `/sw.js` em subpath.
- `updateViaCache: 'none'` ou cache-control headers ajustado no Vercel para SW: garante que SW novo seja baixado em cada deploy (sem cache de 24h padrão).
- Update strategy MVP: **sem `skipWaiting`/`clientsClaim`** — usuário recarrega a página para ativar novo SW. Aceitável para escopo Phase 6 (sem cache de assets).

[CITED: vite.dev/guide/assets.html#the-public-directory + MDN ServiceWorkerContainer/register]

### 2. PWA Manifest (`public/manifest.json`)

**Decisão (D-10):** estrutura completa abaixo.

```json
{
  "name": "CONSEJ CRM",
  "short_name": "CONSEJ",
  "description": "CRM interno da CONSEJ",
  "lang": "pt-BR",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#0a0a0a",
  "background_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

**Notas críticas:**
- `purpose: "any maskable"` — único string com 2 valores separados por espaço (não array). Maskable é safe area padding para Android adaptive icons.
- `start_url` aponta para `/dashboard` (não `/`). Login redireciona; quando standalone, carrega direto a página útil.
- `lang: "pt-BR"` — UI do CRM é em português; ajuda screen readers.
- iOS exige `apple-touch-icon` no HTML — não cobre via manifest. Ver §HTML index.html abaixo.

**Index.html mudanças (D-10):**

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0a0a0a">
<link rel="apple-touch-icon" href="/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CONSEJ">
```

**Icon generation:** D-10 deixa à discrição do planner. Opções:
- **Opção A (recomendada):** rodar `sharp` localmente uma vez via script `scripts/generate-pwa-icons.mjs` (~20 linhas), commitar PNGs. Sem dep em `package.json` (devDep só usado por dev).
- **Opção B:** ferramenta online (real-favicon-generator.net, maskable.app), commit manual.

Plano deve escolher uma e gerar nesta phase (não deferir).

[VERIFIED: developer.mozilla.org/Manifest/icons#maskable]

### 3. Subscription Flow (`src/lib/pwa.ts` + hook + UI)

**Helper `src/lib/pwa.ts`** — exports puros (testáveis via vitest):

```typescript
// src/lib/pwa.ts — helpers PWA + push subscription

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS pre-PWA Safari: navigator.standalone
    || (window.navigator as any).standalone === true
}

export function isIOS(): boolean {
  // UA é frágil mas é o que temos para iOS — Safari não tem User-Agent Client Hints
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

export type PushBlockReason = 'ios-not-standalone' | 'unsupported' | 'denied'

export function canSubscribePush(): { ok: boolean; reason?: PushBlockReason } {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: 'ios-not-standalone' }
  }
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'denied' }
  }
  return { ok: true }
}

/** Converte VAPID public key (base64url) → Uint8Array para applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Converte ArrayBuffer (do getKey()) → base64url para persistir em DB. */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function subscribePush(vapidPublicKey: string): Promise<{
  endpoint: string
  p256dh: string
  auth: string
} | null> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!p256dh || !auth) return null

  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth: arrayBufferToBase64Url(auth),
  }
}

export async function unsubscribePush(): Promise<{ endpoint: string } | null> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return { endpoint }
}
```

**Hook `src/hooks/usePushSubscriptions.ts`:**

```typescript
// Pattern espelhado de useNotificacoesEnvios / usePreferenciasNotif (Phase 5).
// Exporta: usePushSubscriptions(perfilId) → query, useSubscribePush() → mutation,
//          useUnsubscribePush() → mutation.

// Mutation useSubscribePush:
//   1. Chama subscribePush(vapidPublicKey)
//   2. Insert em push_subscriptions com user_agent: navigator.userAgent
//      ON CONFLICT (perfil_id, endpoint) DO UPDATE SET last_seen_at = now()
//   3. Invalida QUERY_KEYS.pushSubscriptions.byPerfil(perfilId)

// Mutation useUnsubscribePush:
//   1. Chama unsubscribePush() → pega endpoint
//   2. DELETE FROM push_subscriptions WHERE perfil_id = $1 AND endpoint = $2
//   3. Invalida cache
```

**Integração com `NotificacoesPanel.tsx`** (extensão da matriz 4×2 → 4×3, D-09/D-12/D-13):

- Adicionar 3ª coluna "Push" ao lado de "E-mail"
- Header da grid: `grid-cols-[1fr_auto_auto_auto] gap-6` (era `1fr_auto_auto`)
- Cada linha ganha 3ª `<Switch>` para `draft[t.id].push`
- **iOS Gate:** se `canSubscribePush()` retorna `reason: 'ios-not-standalone'`, renderizar 4 switches `disabled` + Tooltip "Instale o app primeiro: toque em Compartilhar → Adicionar à Tela"
- **Permission flow (D-12):** quando usuário liga 1º toggle Push (qualquer dos 4 tipos) E `Notification.permission === 'default'`:
  1. `Notification.requestPermission()` → aguarda usuário
  2. Se `'granted'`: `useSubscribePush.mutateAsync()` → atualiza `draft[tipo].push = true`
  3. Se `'denied'`: `toast.error('Permissão negada')` → reverter toggle para OFF
  4. Próximos toggles Push (já com permission granted + subscription existente): comportamento normal de switch (apenas atualiza draft)

**Smart default behavior (D-04):** quando perfil tem `preferencias_notif.tarefa.push = false` E **ainda não tem subscription**, mostrar switch OFF (já está). Quando primeira subscription é criada, NÃO ligar automaticamente (D-04 = usuário liga manualmente após instalar). Inteiramente UX-driven.

### 4. sendPush Helper (`supabase/functions/_shared/push.ts`)

**Espelho de `_shared/email.ts` adaptado para web-push (lido em `email.ts`):**

```typescript
// supabase/functions/_shared/push.ts
// Helper central de envio de Web Push via VAPID.
//
// Espelha 1:1 o pattern de _shared/email.ts:
//   1. INSERT atômico em notificacoes_envios com status='queued' (idempotência via UNIQUE)
//   2. Itera subscriptions do perfil (1:N — D-01 multi-device)
//   3. Para cada subscription: webpush.sendNotification(sub, JSON.stringify(payload))
//      - 201 → status='delivered', registra resend_id=null (push não tem id de tracking)
//      - 410/404 → DELETE row em push_subscriptions + status='failed' (D-02)
//      - 5xx/429 → retry exponencial 3x (500 * 2^i)
//      - Outros 4xx → status='failed', error_msg
//   4. Se todas as N subscriptions falharam → resultado overall failed
//   5. Se pelo menos 1 entregou → resultado ok (multi-device é "best effort to all")
//
// SEM quota check (push é gratuito até limites do browser, fora do tracking Resend — D-08).
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'   // ⚠️ D-06 — ver R-L1 em Risks

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:comunicacao.consej@gmail.com'

// setVapidDetails é global no web-push — chamar uma vez no boot do módulo
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'tarefa'

export interface PushPayload {
  title: string         // ex.: "Nova tarefa atribuída"
  body: string          // ex.: "Gabriel te atribuiu: Renovar contrato ABC"
  data: {
    deepLink: string    // ex.: "/tarefas?highlight=<uuid>"
    tipo: TipoNotif
    entidadeId: string | null
  }
}

export interface SendPushParams {
  perfilId: string
  tipo: TipoNotif
  entidadeId: string | null
  entidadeTipo: EntidadeTipo | null
  payload: PushPayload
}

export type SendPushStatus = 'queued' | 'failed' | 'skipped_idempotent' | 'skipped_no_subscription'

export interface SendPushResult {
  ok: boolean
  status: SendPushStatus
  errorMsg?: string
  notificacaoId?: string
  delivered: number     // quantas subscriptions OK
  failed: number        // quantas subscriptions falharam
  cleaned: number       // quantas subscriptions deletadas (410/404)
}

export async function sendPush(
  supabase: SupabaseClient,
  p: SendPushParams,
): Promise<SendPushResult> {
  // 1. Lookup subscriptions do perfil
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('perfil_id', p.perfilId)

  if (!subs || subs.length === 0) {
    return { ok: true, status: 'skipped_no_subscription', delivered: 0, failed: 0, cleaned: 0 }
  }

  // 2. INSERT atômico em notificacoes_envios (idempotência via UNIQUE)
  const { data: inserted, error: insertErr } = await supabase
    .from('notificacoes_envios')
    .insert({
      perfil_id: p.perfilId,
      tipo: p.tipo,
      entidade_id: p.entidadeId,
      entidade_tipo: p.entidadeTipo,
      canal: 'push',
      subject: p.payload.title,
      status: 'queued',
    })
    .select('id')
    .single<{ id: string }>()

  if (insertErr) {
    if ((insertErr as { code?: string }).code === '23505') {
      return { ok: true, status: 'skipped_idempotent', delivered: 0, failed: 0, cleaned: 0 }
    }
    return {
      ok: false, status: 'failed',
      errorMsg: insertErr.message ?? 'INSERT falhou',
      delivered: 0, failed: 0, cleaned: 0,
    }
  }
  const notificacaoId = inserted.id

  // 3. Envia para cada subscription em paralelo
  const payloadJson = JSON.stringify(p.payload)
  let delivered = 0, failed = 0, cleaned = 0
  const errors: string[] = []

  const results = await Promise.allSettled(subs.map(async (sub) => {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }
    try {
      await webpush.sendNotification(subscription, payloadJson)
      delivered++
    } catch (e: any) {
      const statusCode = e?.statusCode ?? 0
      if (statusCode === 410 || statusCode === 404) {
        // Subscription morta — DELETE row (D-02)
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        cleaned++
        failed++
        errors.push(`sub ${sub.id.slice(0,8)}: ${statusCode} Gone — DELETED`)
      } else {
        failed++
        errors.push(`sub ${sub.id.slice(0,8)}: ${statusCode || e?.message || 'unknown'}`)
      }
    }
  }))

  // 4. UPDATE notificacoes_envios com resultado final
  const finalStatus = delivered > 0 ? 'delivered' : 'failed'
  const errorMsg = errors.length > 0 ? errors.slice(0, 3).join('; ') : null

  await supabase
    .from('notificacoes_envios')
    .update({
      status: finalStatus,
      delivered_at: finalStatus === 'delivered' ? new Date().toISOString() : null,
      error_msg: errorMsg,
    })
    .eq('id', notificacaoId)

  return {
    ok: delivered > 0,
    status: finalStatus === 'delivered' ? 'queued' : 'failed',  // status type não tem 'delivered' como input
    errorMsg: errorMsg ?? undefined,
    notificacaoId,
    delivered, failed, cleaned,
  }
}
```

**Pontos cruciais:**
- **`setVapidDetails` no module load** — global no web-push (não passa por chamada). web-push@3.6.7 documenta: "setVapidDetails globally sets the application's VAPID subject, public key, and private key for subsequent calls."
- **Multi-device é nativo no helper** — itera N subscriptions, agrega resultado. Caller (notify-tarefa) chama `sendPush` UMA VEZ por perfil, não por subscription.
- **Idempotência mantida** — UNIQUE em `notificacoes_envios` (perfil_id, tipo, canal, dia, entidade_id) cobre `canal='push'` igual cobre `'email'`/`'slack'`.
- **Sem quota check** — D-08 confirma push é fora dos contadores Resend.
- **Retry exponencial:** o `web-push` library v3.6.7 **NÃO** faz retry por si só — caso queira, embrulhar o `webpush.sendNotification` em loop similar ao `_shared/email.ts`. MVP pode aceitar 1 tentativa (push services modernos têm SLA alto). Recomendação plano: aceitar 1 tentativa para `5xx/429` — pode reenviar manualmente via histórico (botão Reenviar da Phase 5 ainda funciona).

### 5. notify-* Integration (extensão das 4 funções existentes)

**Pattern (mirror `notify-tarefa/index.ts:243-285`):**

A função já tem `Promise.all([slackPromise, ...emailPromises])`. Phase 6 adiciona `sendPush` ao array. Exemplo conceitual no `notify-tarefa`:

```typescript
// ... (lookup destinatário, prefs, slack, email targets já existentes)

// Decisão Push (D-03 — toggle OFF apenas suprime envio):
const wantPush = prefs?.tarefa?.push === true

// Build payload push (estrutura recomendada CONTEXT.md Discretion):
const pushPayload = wantPush ? {
  title: `Nova tarefa: ${tarefa.titulo}`,
  body: `${criadorNome} te atribuiu uma tarefa`,
  data: {
    deepLink: link,           // já calculado anteriormente
    tipo: 'tarefa' as const,
    entidadeId: tarefa.id,
  },
} : null

const pushPromise: Promise<SendPushResult | { ok: true; skipped: 'push_off' }> = wantPush
  ? sendPush(supabase, {
      perfilId: novoAtribuido,
      tipo: 'tarefa',
      entidadeId: tarefa.id,
      entidadeTipo: 'tarefa',
      payload: pushPayload!,
    })
  : Promise.resolve({ ok: true, skipped: 'push_off' })

// D-03 dispatch paralelo (agora com 3 canais):
const [slackRes, pushRes, ...emailResArray] = await Promise.all([
  slackPromise,
  pushPromise,
  ...emailPromises,
])

return json({
  ok: slackRes.ok && pushRes.ok && emailResArray.every(e => (e as { ok: boolean }).ok),
  slack: slackRes,
  push: pushRes,
  email: emailResArray,
  fallback_diretor: fallbackAcionado,
})
```

**Aplicar mesmo pattern em:** `notify-tarefa`, `notify-resumo-diario` (cadência), `notify-indicacao`, `notify-renovacao`.

**Decisão sobre fallback diretor (Claude's Discretion CONTEXT.md):** Push **NÃO usa fallback diretor**. Justificativa: D-05 fallback é "destinatário sem email → envia para todos diretores" — análogo em push seria "destinatário sem subscription → envia para subscriptions dos diretores", mas:
1. Diretores podem não ter PWA instalado → drop silencioso é OK
2. Spam de notificação para liderança a cada tarefa órfã é UX ruim
3. `skipped_no_subscription` é resultado válido e auditável

Plano deve documentar essa decisão explicitamente.

### 6. iOS Gate Details

**Detection canônica (combo, não UA-only):**

```typescript
const standalone = window.matchMedia('(display-mode: standalone)').matches
  || (window.navigator as any).standalone === true  // iOS legacy
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
const blockedOniOS = ios && !standalone
```

**Justificativa:**
- `display-mode: standalone` — funciona em Chrome Android instalado, Chrome desktop instalado, iOS PWA. Fonte canônica.
- `navigator.standalone` — fallback para iOS pre-PWA Safari (existia muito antes do display-mode). Ainda funciona em 16.4+.
- UA `/iPad|iPhone|iPod/` — necessária porque iOS é a única plataforma que bloqueia push fora do standalone. Outras plataformas com browser não standalone (Chrome desktop sem instalar) ainda permitem push.

[CITED: MDN matchMedia + Apple WebKit blog Safari 16.4 release]

### 7. Install Banner (`InstallAppBanner`)

**Fluxo `beforeinstallprompt`:**

```typescript
// src/components/layout/InstallAppBanner.tsx (skeleton)

let deferredPrompt: BeforeInstallPromptEvent | null = null

useEffect(() => {
  const dismissed = localStorage.getItem('consej_install_banner_dismissed') === '1'
  const standalone = isStandalone()
  if (dismissed || standalone) return

  const handler = (e: Event) => {
    e.preventDefault()  // CRÍTICO: previne mini-infobar do Chrome
    deferredPrompt = e as BeforeInstallPromptEvent
    setVisible(true)
  }
  window.addEventListener('beforeinstallprompt', handler)

  // Quando o app é instalado (via banner ou Chrome menu)
  const installed = () => {
    setVisible(false)
    deferredPrompt = null
  }
  window.addEventListener('appinstalled', installed)

  return () => {
    window.removeEventListener('beforeinstallprompt', handler)
    window.removeEventListener('appinstalled', installed)
  }
}, [])

async function handleInstallClick() {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  if (outcome === 'accepted') setVisible(false)
  // Se 'dismissed', mantém o banner visível (próximo beforeinstallprompt vai re-fire)
}

function handleDismiss() {
  setVisible(false)
  localStorage.setItem('consej_install_banner_dismissed', '1')
}
```

**Gotchas críticos:**
- `beforeinstallprompt` só dispara em **Chrome family** (Android + desktop Chromium). Safari iOS NÃO dispara.
- Evento só dispara após **engagement heuristics** (Chrome decide quando: tipicamente 30s+ navegação OU 2 visitas).
- `prompt()` só pode ser chamado UMA vez por evento — depois `deferredPrompt` é consumido (set null).
- `e.preventDefault()` é obrigatório para esconder o mini-infobar nativo do Chrome e manter controle.
- Quando usuário recusa via `userChoice.outcome === 'dismissed'`, o evento RE-DISPARA em sessões futuras automaticamente — não precisa persistir nada (Chrome lembra).

**`InstalarAppCard` em `/me/preferencias`:**
- Sempre visível enquanto `!isStandalone()`
- Se Chrome com `deferredPrompt` disponível → botão "Instalar app" que chama `prompt()`
- Se iOS Safari → instruções estáticas "Compartilhar → Adicionar à Tela" com screenshot/ícone explicativo

[VERIFIED: MDN BeforeInstallPromptEvent + web.dev install patterns]

### 8. Deep Link Routing (D-14)

**Pattern já existe no projeto** (LeadsPage usa `useSearchParams` para drill-down):

```typescript
// src/pages/TarefasPage.tsx (extensão — não criar do zero, página já existe)

const [searchParams] = useSearchParams()
const highlightId = searchParams.get('highlight')

useEffect(() => {
  if (!highlightId || !tarefas) return
  const tarefa = tarefas.find(t => t.id === highlightId)
  if (tarefa) {
    // Opção A: scroll + abre modal
    setSelectedTarefa(tarefa)
    setModalOpen(true)
    // Opção B: apenas scroll para card highlighted (border ring-2 ring-primary)
    document.getElementById(`tarefa-${tarefa.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}, [highlightId, tarefas])
```

**SW postMessage handshake** — quando tab CRM já está aberta e usuário clica notificação:
- SW envia `client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl })`
- React precisa listener — adicionar em `AppLayout.tsx`:

```typescript
useEffect(() => {
  if (!('serviceWorker' in navigator)) return
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'PUSH_NAVIGATE' && typeof e.data.url === 'string') {
      const url = new URL(e.data.url)
      navigate(url.pathname + url.search)
    }
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}, [navigate])
```

**Rotas/params verificados em CONTEXT.md (todas existem):**
- `/tarefas` — TarefasPage (`src/pages/TarefasPage.tsx`)
- `/leads/<id>` — LeadDetailPage (rota dedicada já existe)
- `/indicacoes` — IndicacoesPage
- `/contratos/<id>` — ContratoDetailPage (ou similar — planner verifica)

### 9. Migration 036 (`036_push_subscriptions.sql`)

**Estrutura completa (escopo D-15):**

```sql
-- Migration 036: Push Subscriptions + canal 'push'
-- Phase 6 — fundação para Web Push notifications (D-01, D-08, D-15)

-- ─── 1. Tabela push_subscriptions (D-01) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id     uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (perfil_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_perfil ON push_subscriptions (perfil_id);

-- ─── 2. RLS (mirror padrão Phase 5) ──────────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê só as suas; coord+ vê todas (debug operacional)
DROP POLICY IF EXISTS push_subs_select ON push_subscriptions;
CREATE POLICY push_subs_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));

-- INSERT: usuário insere só para si (subscribe flow)
DROP POLICY IF EXISTS push_subs_insert ON push_subscriptions;
CREATE POLICY push_subs_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (perfil_id = auth.uid());

-- UPDATE: usuário atualiza só as suas (re-subscribe atualiza last_seen_at)
DROP POLICY IF EXISTS push_subs_update ON push_subscriptions;
CREATE POLICY push_subs_update ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (perfil_id = auth.uid())
  WITH CHECK (perfil_id = auth.uid());

-- DELETE: usuário deleta só as suas; service_role bypassa para cleanup 410
DROP POLICY IF EXISTS push_subs_delete ON push_subscriptions;
CREATE POLICY push_subs_delete ON push_subscriptions
  FOR DELETE TO authenticated
  USING (perfil_id = auth.uid());

-- ─── 3. ALTER CHECK notificacoes_envios.canal (D-08) ─────────────────────────
ALTER TABLE notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_canal_check;
ALTER TABLE notificacoes_envios
  ADD CONSTRAINT notificacoes_envios_canal_check
  CHECK (canal IN ('email','slack','push'));

-- ─── 4. Atualiza handle_new_user com push: false (D-04, D-15) ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_name TEXT;
  has_slack    BOOLEAN;
BEGIN
  default_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    REPLACE(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '), '_', ' '), '-', ' ')
  );

  INSERT INTO public.perfis (id, email, nome)
  VALUES (new.id, new.email, default_name)
  ON CONFLICT (id) DO NOTHING;

  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',    jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'cadencia',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'renovacao', jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'indicacao', jsonb_build_object('slack', has_slack, 'email', true, 'push', false)
     )
   WHERE id = new.id;

  RETURN new;
END;
$$;

-- ─── 5. Backfill perfis existentes (D-15) ────────────────────────────────────
-- jsonb_set adiciona push: false a cada chave sem destruir slack/email existentes
UPDATE perfis
   SET preferencias_notif =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(preferencias_notif,
               '{tarefa,push}', 'false'::jsonb, true),
             '{cadencia,push}', 'false'::jsonb, true),
           '{renovacao,push}', 'false'::jsonb, true),
         '{indicacao,push}', 'false'::jsonb, true)
 WHERE NOT (preferencias_notif #> '{tarefa,push}') IS NOT NULL;  -- só se ainda não tem push
```

**Notas técnicas críticas:**
- **`ALTER TABLE ... DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT`** — Postgres NÃO suporta `ALTER CONSTRAINT CHECK` para mudar a expressão. Pattern canônico é DROP + ADD em mesmo statement transacional.
- **`jsonb_set` com `create_missing=true`** (4º arg `true`) — adiciona chave se não existe; mantém slack/email originais.
- **`CREATE OR REPLACE FUNCTION`** — NÃO precisa `DROP FUNCTION` se signature não muda. Trigger `on_auth_user_created` continua apontando para `handle_new_user()` sem precisar recriar.
- **Backfill idempotente:** WHERE clause garante que migration pode rodar 2x sem corromper prefs existentes.
- **Sem GRANT EXECUTE novo** — sem RPCs novas (subscribe é INSERT direto via RLS, não RPC).

### 10. Type Extensions (`src/types/index.ts`, D-16)

```typescript
// ─── Phase 6 — PWA + Push Notifications ─────────────────────────────────────

// CanalNotif estendido (substitui versão Phase 5):
export type CanalNotif = 'email' | 'slack' | 'push'

// PreferenciasNotif: cada tipo ganha 3º canal
export interface PreferenciasNotif {
  tarefa:    { slack: boolean; email: boolean; push: boolean }
  cadencia:  { slack: boolean; email: boolean; push: boolean }
  renovacao: { slack: boolean; email: boolean; push: boolean }
  indicacao: { slack: boolean; email: boolean; push: boolean }
}

// Novo type para a tabela push_subscriptions
export interface PushSubscriptionRow {
  id: string
  perfil_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  last_seen_at: string
  created_at: string
}
```

**Nota:** o nome `PushSubscription` (preferido em CONTEXT.md D-16) colide com o tipo nativo `PushSubscription` da Web API. Recomendação plano: usar `PushSubscriptionRow` para o registro DB e deixar `PushSubscription` do DOM intacto para o flow client-side.

### 11. Phase 5 helper updates (`_shared/perfis.ts`)

`PreferenciasNotif` em `_shared/perfis.ts` precisa ser atualizado para incluir `push: boolean` em cada tipo (mesmo schema do `src/types/index.ts`). Esta atualização é **obrigatória** — sem ela, `prefs?.tarefa?.push` no notify-tarefa retorna undefined silencioso (TypeScript não bloqueia porque `@ts-nocheck`).

```typescript
// supabase/functions/_shared/perfis.ts (atualização)
export interface PreferenciasTipo {
  slack: boolean
  email: boolean
  push: boolean   // ← NEW
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x + Playwright 1.60.x |
| Config file | `vitest.config.ts` + `playwright.config.ts` |
| Quick run command | `npm test -- src/lib/__tests__/pwa.test.ts` |
| Full suite command | `npm test && npm run test:rls` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PUSH-01 | `urlBase64ToUint8Array(vapidKey)` produz Uint8Array correto | unit | `npm test -- src/lib/__tests__/pwa.test.ts` | ❌ Wave 0 |
| PUSH-01 | `arrayBufferToBase64Url` round-trips com `urlBase64ToUint8Array` | unit | idem | ❌ Wave 0 |
| PUSH-01 | `canSubscribePush()` retorna `unsupported` quando PushManager ausente | unit | idem | ❌ Wave 0 |
| PUSH-01 | `canSubscribePush()` retorna `ios-not-standalone` em UA iOS sem standalone | unit | idem | ❌ Wave 0 |
| PUSH-01 | `isStandalone()` detecta `display-mode: standalone` via matchMedia mock | unit | idem | ❌ Wave 0 |
| PUSH-01 | Manifest válido (campos obrigatórios) | manual | curl/visual inspection | n/a |
| PUSH-01 | SW registra sem erros em Chrome DevTools | manual UAT | DevTools → Application → Service Workers | n/a |
| PUSH-02 | `useSubscribePush` insere row em `push_subscriptions` ON CONFLICT atualiza last_seen_at | integration | `npm test -- src/hooks/__tests__/usePushSubscriptions.test.tsx` | ❌ Wave 0 |
| PUSH-02 | `NotificacoesPanel` toggle Push dispara permission + subscribe | E2E | `npm run test:e2e -- tests/e2e/push-subscribe.spec.ts` | ❌ Wave 0 |
| PUSH-02 | iOS Safari não standalone: switches disabled + tooltip visível | E2E (user agent override) | idem | ❌ Wave 0 |
| PUSH-02 | RLS: usuário só vê push_subscriptions próprias; coord+ vê todas | RLS suite | `npm run test:rls -- tests/rls/push-subscriptions.test.ts` | ❌ Wave 0 |
| PUSH-03 | `sendPush()` itera N subscriptions e agrega resultado | unit (mock supabase) | `npm test -- supabase/functions/_shared/__tests__/push.test.ts` | ❌ Wave 0 |
| PUSH-03 | `sendPush()` 410 Gone → DELETE row + status=failed | unit (mock web-push throw) | idem | ❌ Wave 0 |
| PUSH-03 | `sendPush()` idempotência via 23505 retorna skipped_idempotent | unit | idem | ❌ Wave 0 |
| PUSH-03 | `sendPush()` skipped_no_subscription quando perfil sem sub | unit | idem | ❌ Wave 0 |
| PUSH-03 | `notify-tarefa` dispara push em paralelo com email/slack via Promise.all | unit (mock helpers) | extensão de `notify-tarefa.test.ts` existente | ❌ Wave 0 |
| PUSH-03 | `notify-tarefa` respeita `prefs.tarefa.push === false` (suprime sem deletar sub) | unit | idem | ❌ Wave 0 |
| PUSH-04 | SW `notificationclick` chama `clients.openWindow(deepLink)` quando sem tab aberta | unit (SW test via jsdom mock) | `npm test -- public/__tests__/sw.test.js` (ou skip — manual UAT) | ❌ Wave 0 |
| PUSH-04 | SW `notificationclick` envia `postMessage` para tab existente | unit / manual UAT | idem | ❌ Wave 0 |
| PUSH-04 | AppLayout listener navega via React Router ao receber PUSH_NAVIGATE | unit | `npm test -- src/components/layout/__tests__/AppLayout.test.tsx` | ❌ Wave 0 (extensão) |
| PUSH-04 | Páginas (TarefasPage, IndicacoesPage) reagem a `?highlight=<id>` | unit | tests por página | ❌ Wave 0 |
| End-to-end | Real iOS PWA install + real push delivery | manual UAT | Gabriel testa em iPhone real | n/a |
| End-to-end | Real Chrome Android install + real push delivery | manual UAT | Gabriel testa em celular Android | n/a |

### Sampling Rate
- **Per task commit:** `npm test -- <changed-test-file>`
- **Per wave merge:** `npm test && npm run test:rls`
- **Phase gate:** Full suite green + manual UAT em 2 devices reais (iOS PWA + Chrome Android) antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/pwa.test.ts` — unit tests dos helpers puros (urlBase64ToUint8Array, canSubscribePush, isStandalone, isIOS, arrayBufferToBase64Url round-trip)
- [ ] `src/hooks/__tests__/usePushSubscriptions.test.tsx` — query + mutations (mock supabase + navigator.serviceWorker)
- [ ] `supabase/functions/_shared/__tests__/push.test.ts` — sendPush com supabase-mock + web-push mock (410, idempotency, multi-sub aggregate)
- [ ] `tests/rls/push-subscriptions.test.ts` — RLS regression (consultor vê só as suas, coord+ vê todas)
- [ ] `tests/e2e/push-subscribe.spec.ts` — Playwright: navega para `/me/preferencias`, toggle Push, mock permission grant, assert subscription persistida via Supabase admin client (test DB)
- [ ] Manual UAT script `.planning/phases/06-pwa-push-notifications/06-MANUAL-UAT.md` (cria no Wave 0 ou no verify-work)
- [ ] Mock helpers para `navigator.serviceWorker` + `PushManager` em vitest.setup.ts (não existe — atualizar setup)

**Não-automatizável (aceito como manual-only):**
- Browser permission prompt (UX nativo, vitest não controla)
- iOS PWA install flow (precisa dispositivo real iOS 16.4+)
- Real push delivery via FCM/Apple push service (smoke-test no Plan final via curl)
- VAPID keypair generation (rodado uma vez pelo Gabriel — não regredir)

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim | Subscribe é authenticated (Supabase JWT); RLS perfil_id = auth.uid() |
| V3 Session Management | sim | Subscription lifecycle: cleanup em 410 (D-02) + DELETE no logout (opcional, não locked) |
| V4 Access Control | sim | RLS: usuário vê só as suas; coord+ vê todas via is_at_least('coordenador') |
| V5 Input Validation | sim | endpoint/p256dh/auth são strings opacas mas devem ser non-null; verificar TEXT length antes de INSERT (opcional) |
| V6 Cryptography | sim | VAPID = ECDSA P-256 + AES-128-GCM (gerenciado pelo `web-push@3.6.7`, **nunca** hand-roll). Private key em Supabase Secrets. |
| V9 Communication | sim | Push endpoints são HTTPS por contrato RFC 8030; web-push enforça |
| V10 Malicious Code | n/a | Sem upload de código de usuário |
| V13 API & Web Service | sim | Edge function valida WEBHOOK_*_SECRET (já existente nos notify-*) |
| V14 Configuration | sim | VAPID secrets nunca commitados; .gitignore cobre .env* |

### Known Threat Patterns for {PWA + Web Push}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **VAPID private key leak** | Information Disclosure / Spoofing | Armazenar APENAS em Supabase Secrets; nunca em código/log. Se vazar → rotacionar = invalidar todas subscriptions existentes (usuários re-subscribem no próximo open). [R-S1] |
| **Notification spoofing por origem externa** | Spoofing | Push só pode ser enviado por quem tem private key (VAPID) que bate com o `applicationServerKey` usado no subscribe. Atacante sem private key não consegue mandar push para nossos usuários. [R-S2] |
| **Subscription endpoint enumeration** | Information Disclosure | RLS bloqueia leitura cross-perfil. Endpoint só revelado para o próprio perfil e coord+. Coord+ vê endpoints mas não tem como spoof envio sem VAPID private key. [R-S3] |
| **XSS via notification body** | Tampering | Payload `body` exibido pelo SW via `showNotification(title, { body })` é texto puro (browser não interpreta HTML). **Mas:** dados que entram em `body` (ex.: `tarefa.titulo` em "Nova tarefa: ${titulo}") devem ser strings — escape implícito do API. Sem risco de XSS aqui. [R-S4] |
| **CSRF no subscribe endpoint** | Tampering | Subscribe é INSERT direto via supabase client autenticado (JWT no header). RLS `perfil_id = auth.uid()` impede atacante de criar subscription para outro perfil. [R-S5] |
| **Permission abuse (auto-prompt)** | Repudiation | D-12 garante request **apenas** no clique do usuário no toggle. Sem auto-prompt no boot. Compliance LGPD/consentimento explícito. [R-S6] |
| **Deep link open redirect** | Tampering | `notificationclick` faz `new URL(deepLink, origin).href` — se deepLink for absoluto com origin externa, URL constructor mantém. **Mitigação:** validar `targetUrl.origin === self.location.origin` antes de openWindow. [R-S7] |
| **Subscription replay após logout** | Spoofing | Quando usuário faz logout, subscription continua no DB (D-03 mantém). Notifications continuam chegando no device até unsubscribe explícito. Para Phase 6 MVP: aceitar (não locked como bug). Pode adicionar cleanup no signOut em Phase futura. [R-S8] |

**Notas de hardening (não obrigatórios MVP, planner avalia):**
- Comprimento máximo de `endpoint` (`text` aceita ilimitado, mas push endpoints reais ≤ 1KB). Adicionar `CHECK (length(endpoint) <= 2000)` em migration é cinto-suspensórios.
- Rate limit no subscribe: usuário malicioso pode encher tabela com endpoints fake. RLS limita a `perfil_id = auth.uid()`, então um perfil só pode encher SUAS rows — mitigação parcial. Sem rate-limit interno para MVP (volume CONSEJ baixo).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID JWT signing (ECDSA P-256) | Crypto manual com Web Crypto API | `webpush.setVapidDetails()` + `webpush.sendNotification()` (web-push@3.6.7) | Easy to get wrong; vetores de attack via JWT malformado; web-push tem 8 anos de battle-testing |
| Payload encryption (AES-128-GCM + ECDH shared secret) | Implementação manual via SubtleCrypto | web-push (mesmo helper) | RFC 8291 tem nuances de salt + context info; bug = push entregue mas browser não consegue descriptografar (dropped silently) |
| `urlBase64ToUint8Array` | Buffer.from manipulation | Pattern canônico de 6 linhas (incluído acima) | É só conversão de encoding — escrever uma vez e testar. Não vale dependência extra. |
| Notification stacking/coalescing | Lógica custom no SW | `options.tag` no `showNotification` | Browser nativamente coalesce notificações com mesmo tag — basta passar `tag: payload.data?.tipo` (D-11 aceita) |
| iOS/Android UA detection | Biblioteca tipo `ua-parser-js` (~50KB) | 1 linha regex `/iPad|iPhone|iPod/.test(navigator.userAgent)` | Para o nosso caso (só queremos saber se é iOS), regex é overkill mas suficiente. Sem necessidade de dep nova. |
| Service Worker registration "framework" | `vite-plugin-pwa` (~~40KB~~ + bundling complexity) | `navigator.serviceWorker.register('/sw.js')` 1 linha | D-11 explicita SW minimal — plugin-pwa adicionaria precaching/manifest gen que não usamos. Manual é melhor. |
| Magic link/auth deep-link no notification | Token JWT custom | Já não aplica — push só dispara para usuários logados que subscreveram; deep link abre rota autenticada normal (AppLayout guarda redireciona se sessão expirou) | Phase 5 fez isso para email (não autenticado por padrão); push é diferente — só funciona para usuário que está autenticado E subscreveu. |

**Key insight:** Web Push é um dos protocolos onde "hand-rolling" é uma decisão de carreira ruim — o `web-push` library é maduro, tem testes próprios, e o custo de bug em encryption é "push entregue mas invisível" (perda silenciosa). Não vale o ROI.

---

## Common Pitfalls

### Pitfall 1: SW em `src/` em vez de `public/`

**What goes wrong:** Vite serve `src/` com bundle + hashing → URL final é tipo `/sw-abc123.js`. Registro de `/sw.js` falha 404.

**Why it happens:** Convenção Vite — `public/` é raiz estática sem processing; `src/` passa pelo pipeline.

**How to avoid:** SW SEMPRE em `public/sw.js`. Manifest também em `public/manifest.json`. Ícones em `public/icon-*.png`.

**Warning signs:** DevTools → Application → Service Workers vazio; console error "Failed to register a ServiceWorker: 404".

### Pitfall 2: SW scope errado

**What goes wrong:** Registrar de `/some-path/sw.js` dá scope `/some-path/` — push events não disparam quando usuário está em `/`.

**Why it happens:** Service Worker scope default = diretório onde o SW está.

**How to avoid:** SW em raiz `/sw.js` → scope automático `/`. Não precisar passar `{ scope: '/' }` explícito.

### Pitfall 3: VAPID public key trocada entre client e server

**What goes wrong:** Subscribe usa public key A, server envia push com private key B (par diferente). Push service retorna 403.

**Why it happens:** Geração de VAPID dá 2 strings — fácil confundir qual vai onde. Trocar acidentalmente em env vars.

**How to avoid:**
- `VAPID_PUBLIC_KEY` (Supabase Secret) e `VITE_VAPID_PUBLIC_KEY` (Vercel env) DEVEM ser idênticos. STATE.md ou pre-flight script valida.
- Subscriptions criadas com public key A NÃO funcionam se key for rotacionada — todas viram 403 e precisam ser re-criadas.
- Smoke-test no Plan final: subscribe localmente, mandar push de teste curl-style.

### Pitfall 4: Payload > 4096 bytes silently dropped

**What goes wrong:** `webpush.sendNotification(sub, JSON.stringify({...huge}))` retorna 413 ou em alguns push services retorna 201 mas browser nunca recebe.

**Why it happens:** RFC 8291 limita payload encrypted a 4096 bytes. Margem real ~3800 bytes.

**How to avoid:** Payload recomendado `{ title, body, data: { deepLink, tipo, entidadeId } }` com `title` ≤ 50 chars, `body` ≤ 150 chars — total ~400 bytes JSON. Nunca enviar `tarefa.descricao` completa (pode ser longa).

### Pitfall 5: Notification permission `denied` é permanente

**What goes wrong:** Usuário clica "Block" no prompt. Toggle Push fica OFF para sempre. Não há API para re-prompt.

**Why it happens:** Browsers tratam `denied` como persistente para evitar spam de prompts.

**How to avoid:**
- Avisar usuário ANTES do prompt: "Se você bloquear, vai precisar reabilitar nas configurações do Chrome para reativar" (tooltip ou modal warning antes de chamar `requestPermission()`)
- D-12 já mitiga parcialmente — request apenas em ação explícita
- Quando `canSubscribePush()` retorna `reason: 'denied'`, mostrar instrução de como reverter via browser settings (link para chrome://settings/content/notifications)

### Pitfall 6: 410 sem cleanup acumula lixo no DB

**What goes wrong:** Subscription expira (usuário desinstalou PWA, revogou permission), mas DB ainda tem row. `sendPush` continua tentando, sempre 410, status='failed' acumulando.

**Why it happens:** Sem D-02 cleanup, rows mortas crescem sem fim.

**How to avoid:** D-02 já cobre — DELETE row no primeiro 410. Garantir que tests cobrem este caminho (`webpush.sendNotification` throw com `statusCode === 410` → DELETE row + status='failed' em notificacoes_envios).

### Pitfall 7: Same-device re-subscribe gera UNIQUE violation

**What goes wrong:** Usuário desinstala e reinstala PWA, browser gera mesmo endpoint (raro mas acontece) → INSERT falha com 23505.

**Why it happens:** UNIQUE (perfil_id, endpoint) é estrito.

**How to avoid:** D-01 diz "ON CONFLICT DO UPDATE SET last_seen_at = now()". Hook `useSubscribePush` deve usar:
```typescript
supabase.from('push_subscriptions').upsert(
  { perfil_id, endpoint, p256dh, auth, user_agent, last_seen_at: new Date().toISOString() },
  { onConflict: 'perfil_id,endpoint' }
)
```

### Pitfall 8: Vite dev server não serve SW em HMR

**What goes wrong:** `npm run dev` serve `public/sw.js` em alguns casos mas HMR pode atrapalhar registration.

**Why it happens:** Vite dev tem comportamento diferente de prod build para assets em `public/`.

**How to avoid:**
- Para teste local: `npm run build && npm run preview` (serve `dist/` que tem `sw.js` corretamente).
- Em dev, registrar SW com `if (import.meta.env.PROD) navigator.serviceWorker.register('/sw.js')` — evita conflitos com HMR. **Tradeoff:** push não funciona em dev. Aceitável porque permission API requer HTTPS exceto `localhost` (que ok).
- Alternativamente, registrar sempre mas aceitar console warnings em dev.

### Pitfall 9: `display-mode: standalone` retorna `false` no momento exato do beforeinstallprompt

**What goes wrong:** `beforeinstallprompt` dispara → banner mostra → usuário instala → standalone agora `true`, mas componente já fez render com `isStandalone() === false`.

**Why it happens:** Estado captured no useEffect inicial.

**How to avoid:** Escutar evento `appinstalled` no window e atualizar state. Skeleton acima já inclui.

### Pitfall 10: macOS Safari instala PWA via Dock — não dispara `beforeinstallprompt`

**What goes wrong:** Usuário em macOS Safari quer instalar, mas não tem prompt nativo.

**Why it happens:** Safari implementa install manual (File → Add to Dock).

**How to avoid:** Banner detecta `isMacOSSafari()` e mostra instrução manual similar ao iOS. **Fora do escopo MVP (CONTEXT.md não menciona)** — pode deferir para Phase 6.5/7. Plano deve documentar como limitação aceita.

---

## Code Examples

### VAPID generation (manual, pré-execute-phase)

```bash
# Rodado UMA VEZ pelo Gabriel (STATE.md tech-debt pré-Phase 6)
npx web-push generate-vapid-keys
# Output:
# =======================================
# Public Key:
# BAbc...xyz (87 chars base64url)
#
# Private Key:
# abc...xyz (43 chars base64url)
# =======================================

# Setar no Supabase Edge Functions
supabase secrets set VAPID_PUBLIC_KEY="BAbc...xyz"
supabase secrets set VAPID_PRIVATE_KEY="abc...xyz"
supabase secrets set VAPID_SUBJECT="mailto:comunicacao.consej@gmail.com"

# Setar no Vercel (UI dashboard ou CLI)
vercel env add VITE_VAPID_PUBLIC_KEY production
# (cola o mesmo BAbc...xyz quando perguntado)
```

[CITED: github.com/web-push-libs/web-push#command-line-usage]

### Boot do Service Worker em `src/main.tsx`

```typescript
// Trecho a adicionar antes do createRoot(...) (Phase 6 D-11)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch((err) => console.warn('[SW] registration failed:', err))
  })
}
```

### Mensagem do SW para a tab CRM aberta

(Já mostrado em §Service Worker — `client.postMessage({ type: 'PUSH_NAVIGATE', url })`. Pattern padrão da Web App Lifecycle API.)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| iOS sem Web Push (Apple bloqueava) | iOS 16.4+ suporta Web Push em PWA standalone | Março 2023 | CONSEJ pode atingir iPhone sem app nativo |
| Push subscription como JSONB único em users | Tabela 1:N multi-device | Pattern estabelecido em prod apps | Suporta consultor com celular + desktop simultaneamente |
| `vite-plugin-pwa` para gerar SW/manifest | Manual minimal SW + manifest | D-11 explícito | Bundle menor, controle total, sem dependência extra |
| FCM Web Push (Google-only) | VAPID standard cross-browser | RFC 8292 (2018) | Mesma assinatura funciona em FCM, Mozilla autopush, Apple APNs |

**Deprecated/outdated (a evitar):**
- **GCM senderId** — pre-VAPID era específico do Google. Modern web-push usa VAPID, sem necessidade.
- **`navigator.serviceWorker.ready` antes de register** — pattern legacy; hoje `register` + `await navigator.serviceWorker.ready` é canônico.
- **`PushSubscription.toJSON()`** — funciona mas é "any-shaped"; preferir extração explícita de `endpoint`/`getKey('p256dh')`/`getKey('auth')`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `esm.sh/web-push@3.6.7` funciona em Supabase Edge Runtime sem polyfill explícito de `node:crypto` | §sendPush Helper, R-L1 | Edge function falha ao boot. Trocar para `npm:web-push@3.6.7` em fallback. |
| A2 | `webpush.sendNotification` em web-push@3.6.7 lança Error com `statusCode` numérico no caminho de 410/404 | §Push Service Error Codes, §sendPush Helper | Cleanup logic precisa ajustar para outro shape do erro. |
| A3 | `notify-tarefa` atual usa `Promise.all` (não `Promise.allSettled`) — Phase 6 mantém pattern | §notify-* Integration | Falha de push aborta email/slack. **Verificado em código: usa `Promise.all`** — recomendação plano: trocar para `Promise.allSettled` para resiliência (decisão menor, documentar). |
| A4 | Vercel serve `/sw.js` com headers cache-control aceitáveis (sem cache excessivo) | §Service Worker Lifecycle | SW novo não baixa em deploy; usuários ficam em SW velho. Mitigação: configurar `vercel.json` headers para `/sw.js` com `cache-control: no-cache`. |
| A5 | `display-mode: standalone` retorna `true` em Chrome Android PWA instalado E iOS PWA standalone | §iOS Gate | Falsa detecção bloqueia toggles. **Verificado:** matchMedia API é canônica no MDN e Apple docs concordam. |
| A6 | Phase 5 `_shared/perfis.ts` PreferenciasTipo aceita adicionar `push: boolean` sem regredir Phase 5 (TypeScript permite, runtime aceita por causa de `@ts-nocheck`) | §Phase 5 helper updates | Phase 5 functions não quebram porque acessam `prefs?.tarefa?.email` (não destructure rígido). Verificado. |
| A7 | macOS Safari install (File → Add to Dock) é aceitável como limitação MVP — CONTEXT.md não menciona | §Pitfall 10 | Usuários macOS Safari precisam instrução manual; UI iOS-only não cobre. **Aceitável MVP** (público CONSEJ é Chrome desktop + iOS PWA). |
| A8 | `notificationclick` handler valida `targetUrl.origin === self.location.origin` antes de openWindow | §Security R-S7 | Risco de open redirect. Recomendação adicionada — plano deve incluir validação. |
| A9 | Push notification payload `body` exibido pelo SW é tratado como texto puro pelo browser (sem HTML/JS interpretation) | §Security R-S4 | Verificado: `showNotification(title, options)` API trata body como plaintext. |
| A10 | `web-push` library@3.6.7 não tem postinstall scripts maliciosos | §Package Legitimacy Audit | Verificado via `npm view web-push scripts.postinstall` (vazio) + slopcheck [OK]. |

---

## Open Questions

1. **`Promise.all` vs `Promise.allSettled` no notify-*?**
   - What we know: notify-tarefa atual usa `Promise.all` (verificado em código linha 278). Falha de UM canal aborta os outros.
   - What's unclear: Phase 6 quer resiliência cross-canal — falha de push não deve afetar email.
   - Recommendation: Plano deve incluir refactor para `Promise.allSettled` em todas as 4 notify-* functions. Pequeno, baixo risco, alto benefício. Não é blocker mas é tech-debt que vale corrigir junto.

2. **Push sem subscription do destinatário → fallback diretor?**
   - What we know: D-05 fallback é para EMAIL (destinatário sem email). Push é silent miss aceitável.
   - What's unclear: CONTEXT.md não locked explicitamente. Pode haver expectativa de fallback similar.
   - Recommendation: **NÃO usar fallback diretor para push**. Justificativa em §notify-* Integration. Documentar no plano para evitar drift.

3. **Como gerar os ícones 192/512 — script ou online?**
   - What we know: D-10 deixa à discrição do planner.
   - What's unclear: trade-off entre commit script (sharp dev dep ou inline jimp) vs commit PNGs gerados via real-favicon-generator.net.
   - Recommendation: **Online tool + commit dos PNGs**. Justificativa: SW + ícones são "build once" assets, não vão mudar. Adicionar `sharp` como devDep só para gerar 2 PNGs é over-engineering. CONTEXT.md ROADMAP/STATE não cita script automation aqui.

4. **iOS standalone detection — `navigator.standalone` legacy ainda necessário?**
   - What we know: iOS 16.4+ (alvo Phase 6) suporta `matchMedia('(display-mode: standalone)')`.
   - What's unclear: usuários em iOS antigos (15-16.3) acessam o CRM? Não usariam push de qualquer forma.
   - Recommendation: incluir `navigator.standalone` fallback **mesmo assim** (4 chars código, cobre edge case zero-custo). Já no skeleton de `pwa.ts`.

5. **Retry exponencial em sendPush ou aceitar 1 tentativa?**
   - What we know: `_shared/email.ts` faz retry 3x para 429/5xx. Push services tipicamente têm SLA alto.
   - What's unclear: vale o overhead de retry para push?
   - Recommendation: **MVP aceita 1 tentativa**. Botão "Reenviar" da Phase 5 (em `notificacoes_envios`) ainda funciona para push (basta a função suportar `reenviado_por_id`). Documentar como simplification consciente.

6. **PWA install banner: dismissable PERMANENTE ou tempo-limit?**
   - What we know: D-09 diz "dismissable" + localStorage flag.
   - What's unclear: dismiss = permanente até clear localStorage, OU re-show após N dias?
   - Recommendation: **Permanente para MVP** (consistente com `consej_kanban_hint` pattern). `InstalarAppCard` em `/me/preferencias` é a "porta sempre aberta" — usuário que mudou de ideia pode instalar lá. Se receber feedback "perdi como instalar", adicionar reset no menu Settings (post-MVP).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | Local dev, build | ✓ (assumido — projeto roda Vitest 3.x) | — | — |
| npm | install scripts | ✓ | — | — |
| Supabase CLI | edge functions deploy | ✓ (assumido — Phase 5 usou) | — | aplicar migration via Studio SQL Editor (workaround conhecido STATE.md tech-debt) |
| Supabase Secrets API | VAPID keys | ✓ | — | — |
| Vercel env vars | VITE_VAPID_PUBLIC_KEY | ✓ | — | — |
| `web-push` CLI (gerar VAPID) | one-time setup | manual `npx web-push generate-vapid-keys` | 3.6.7 | manual generate via Node REPL (não vale) |
| iPhone com iOS 16.4+ | UAT real device | Gabriel tem (assumido) | — | TestFlight sem cobertura Web Push; sem fallback |
| Android device com Chrome | UAT real device | Gabriel tem (assumido) | — | Chrome desktop install (cobre install + push básico, mas não emula mobile UX) |
| HTTPS endpoint para SW | runtime | ✓ Vercel/Supabase serve TLS por default | — | localhost também OK para dev |

**Missing dependencies with no fallback:**
- nenhum (todos os requisitos cobertos)

**Missing dependencies with fallback:**
- `supabase db push` (STATE.md tech-debt) → workaround Studio SQL Editor já documentado

---

## Project Constraints (from CLAUDE.md)

| Directive | Source | Impact on Phase 6 |
|-----------|--------|-------------------|
| Usar **npm** (não bun) para novos projetos | Project CLAUDE.md | Sem novos deps front; web-push só roda no edge. OK. |
| **Nunca** `Read` em `package-lock.json` | Project CLAUDE.md | Respeitado — não lido nesta pesquisa. Para versões usei `package.json`. |
| Componentes em `src/components/`, hooks em `src/hooks/`, páginas em `src/pages/`, tipos em `src/types/index.ts` | Project CLAUDE.md | InstallAppBanner em `src/components/layout/`; InstalarAppCard em `src/components/me/`; pwa.ts em `src/lib/`; usePushSubscriptions em `src/hooks/`; tipos em `src/types/index.ts` ✅ |
| Configurações globais em `configuracoes` (Supabase, id='default') | Project CLAUDE.md | N/A — VAPID lives in Secrets, not configuracoes |
| RLS ativa em todas tabelas sensíveis | Project CLAUDE.md | `push_subscriptions` RLS-enabled (mirror Phase 5 pattern) ✅ |
| Migrações incrementais em `supabase/migrations/` | Project CLAUDE.md | Nova: `036_push_subscriptions.sql` (035 confirmado em prod) ✅ |
| Perfis auto-criados via trigger `on_auth_user_created` | Project CLAUDE.md | Migration 036 atualiza `handle_new_user()` adicionando `push: false` ✅ |
| **Nunca** sugerir emojis em peças jurídicas (UI CRM tem latitude) | User profile global | CRM tem UI emoji-friendly (existing usage de 📌 em Slack messages); Phase 6 segue mesma latitude para notifications |
| **Nunca** commitar `.env` ou chaves API | User profile global | VAPID keys vão para Secrets/Vercel env, NUNCA commit ✅ |
| Preferir Edit sobre Write em arquivos existentes | User profile global | Plano deve usar Edit para `index.html`, `main.tsx`, `notify-*`, `NotificacoesPanel`, `_shared/perfis.ts`. Write apenas para arquivos novos (sw.js, manifest.json, pwa.ts, push.ts, hooks). |
| Preferir Glob/Grep/Read sobre bash | User profile global | Aplicado nesta pesquisa ✅ |
| Idioma respostas: PT-BR | User profile global | RESEARCH.md em PT-BR; código em EN; commits em EN ✅ |

---

## Risks & Landmines

### R-L1 (HIGH): `esm.sh/web-push@3.6.7` pode falhar no Supabase Edge Runtime

**Description:** D-06 escolhe `https://esm.sh/web-push@3.6.7`. Tanto a [documentação oficial Supabase](https://supabase.com/docs/guides/functions/examples/push-notifications) quanto a [postagem de referência mais popular](https://www.originalobjective.com/blog/from-lovable-app-to-mobile-pwa-push-notifications-with-supabase) usam `npm:web-push`. Razão técnica: web-push usa intensivamente `node:crypto` (ECDH, ECDSA, HKDF), e o esm.sh polyfilla via `deno.land/std/node` que tem [limitações conhecidas em ECDH](https://github.com/denoland/deno/issues/18416).

**Likelihood:** MEDIUM (esm.sh funciona para muitos pacotes mas crypto é caso edge)
**Impact:** HIGH (edge function falha no boot, sendPush 100% quebrado)

**Mitigation:**
1. **Smoke-test no Wave 1 do plano:** criar uma função throw-away que apenas faz `import webpush from 'https://esm.sh/web-push@3.6.7'; webpush.setVapidDetails(...); console.log(webpush.generateVAPIDKeys())`. Deploy. Se OK, prosseguir.
2. **Fallback documentado:** se esm.sh falhar, trocar para `import webpush from 'npm:web-push@3.6.7'` (1 char change, mesma versão, mesma API). Documentar no plano que isso é aceitável sem nova rodada de discuss-phase (`npm:` é pattern mais ortodoxo que esm.sh em Supabase).

### R-L2 (LOW): VAPID public key mismatch entre client e server

**Description:** `VITE_VAPID_PUBLIC_KEY` (Vercel) e `VAPID_PUBLIC_KEY` (Supabase Secret) DEVEM ser idênticos. Se forem diferentes, todos os pushes retornam 403 silenciosamente.

**Likelihood:** LOW (é só cuidado de setup)
**Impact:** HIGH (todos os pushes falham)

**Mitigation:** STATE.md já lista como pré-requisito manual. Plano deve incluir Task: "Validar que VITE_VAPID_PUBLIC_KEY (Vercel) === VAPID_PUBLIC_KEY (Supabase Secret)" via assertion no boot do edge function ou no smoke-test.

### R-L3 (MEDIUM): iOS PWA subtle install flow — usuários podem desistir

**Description:** iOS exige usuário ir em Compartilhar → Adicionar à Tela. Sem badge no Safari nudging install (Chrome tem). Adoção entre consultores depende de Gabriel evangelizar.

**Likelihood:** HIGH (UX é hostil)
**Impact:** MEDIUM (push em iOS desperdiçado, mas Slack/email cobrem)

**Mitigation:** `InstalarAppCard` em `/me/preferencias` com screenshots claros do passo a passo. Adoção é problema de processo (Gabriel mostrar no onboarding do consultor), não técnico.

### R-L4 (LOW): SW caching agressivo em Vercel quebra updates

**Description:** Vercel default cache-control para assets estáticos pode cachear `/sw.js` por 24h+. Update do SW (novo sw.js) demora para chegar nos clients.

**Likelihood:** LOW (Vercel detecta SW em geral)
**Impact:** MEDIUM (bugs em SW novo demoram para propagar)

**Mitigation:** Adicionar em `vercel.json`:
```json
{
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
  ]
}
```
Plano deve incluir esta config. Não é blocker mas é polish importante.

### R-L5 (MEDIUM): Re-render bloop em NotificacoesPanel quando toggle Push falha permission

**Description:** `Notification.requestPermission()` é async. Switch otimisticamente vira ON, mas usuário recusa → reverter para OFF. Se hook não trata isso, switch fica em estado inconsistente.

**Likelihood:** MEDIUM (caminho de UX comum)
**Impact:** LOW (UX confusa mas não quebra dados)

**Mitigation:** Lógica explícita no `onCheckedChange` do switch Push:
1. setLocalState(true) (optimistic ON)
2. `requestPermission()` → if denied → setLocalState(false) + toast.error
3. `useSubscribePush.mutateAsync()` → if throws → setLocalState(false) + toast.error
4. Só persistir prefs via `useSalvarPrefs` quando subscription confirmada
Plano deve documentar este flow explicitamente (não óbvio).

### R-L6 (LOW): macOS Safari install não dispara `beforeinstallprompt`

**Description:** macOS Safari (não iOS) tem install manual via Dock. Banner não aparece. CONTEXT.md não cobre.

**Likelihood:** LOW (público CONSEJ é majoritariamente Chrome desktop)
**Impact:** LOW (usuário não vê banner; pode usar push via Safari não-standalone — funciona em macOS Safari 16+ inclusive sem PWA)

**Mitigation:** Documentar como known limitation. Não precisa fix em Phase 6.

---

## Sources

### Primary (HIGH confidence)
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) — protocol semantics, subscribe lifecycle
- [MDN PushManager.subscribe()](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) — applicationServerKey format
- [MDN Web Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest) — purpose, display modes
- [MDN BeforeInstallPromptEvent](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent) — lifecycle, gotchas
- [MDN ServiceWorkerContainer.register](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register) — scope rules
- [web-push GitHub README](https://github.com/web-push-libs/web-push/blob/master/README.md) — sendNotification signature, setVapidDetails, CLI
- [Apple WebKit blog — Safari 16.4 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) — iOS standalone requirement
- Codebase: `supabase/functions/_shared/email.ts` (linha 108-217) — pattern canônico para sendPush mirror
- Codebase: `supabase/functions/notify-tarefa/index.ts` (linha 174-285) — integration point exato
- Codebase: `supabase/migrations/035_notificacoes_envios.sql` — schema base + idempotency pattern

### Secondary (MEDIUM confidence)
- [Pushpad — Web Push Errors HTTP Status Codes](https://pushpad.xyz/blog/web-push-errors-explained-with-http-status-codes) — interpretação de 410/404 para cleanup
- [Pushpad — Error 410 Gone explained](https://pushpad.xyz/blog/web-push-error-410-the-push-subscription-has-expired-or-the-user-has-unsubscribed) — quando deletar subscription
- [OriginalObjective — Lovable PWA + Supabase + Push](https://www.originalobjective.com/blog/from-lovable-app-to-mobile-pwa-push-notifications-with-supabase) — referência prática que usa `npm:web-push` (motivo do R-L1)
- [Supabase Functions Examples — Push Notifications](https://supabase.com/docs/guides/functions/examples/push-notifications) — cobre Expo/FCM (não web-push direto), mas confirma pattern de tabela `push_subscriptions`

### Tertiary (LOW confidence — flag para validação)
- [MagicBell — PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — confirma iOS 16.4+ requisitos
- [negrel.dev — Send Web Push messages with Deno](https://www.negrel.dev/blog/deno-web-push-notifications/) — usa `jsr:@negrel/webpush` (alternativa não escolhida em D-06)
- [@block65/webcrypto-web-push npm](https://www.npmjs.com/package/@block65/webcrypto-web-push) — alternativa Web Crypto-first não escolhida

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — web-push@3.6.7 verificado em npm registry + slopcheck [OK]
- Architecture: HIGH — CONTEXT.md tem 16 decisões locked; pesquisa apenas detalha HOW
- Pitfalls: HIGH — pitfalls são canônicos no domínio Web Push (10+ anos de community knowledge)
- Validation: MEDIUM — vitest mocks de SW/PushManager têm boilerplate; real UAT em devices reais é obrigatório
- Security: HIGH — ASVS V2/V4/V5/V6 cobertos; STRIDE patterns documentados
- iOS specifics: MEDIUM — Safari 16.4 features verificadas via Apple docs, mas real-world edge cases (apps órfãos, perfil de notification settings) só validam em UAT

**Research date:** 2026-05-28
**Valid until:** 2026-08-28 (3 meses) — Web Push é spec estável; única razão para invalidar seria mudança de major no web-push library (~uma vez por ano) ou shift em iOS Safari behavior (improvável).

---

## RESEARCH COMPLETE
