# Phase 6: PWA + Push Notifications - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 06-pwa-push-notifications
**Areas discussed:** Subscription storage, Edge function shape, PWA install prompt UX, Permission request timing

---

## Subscription storage model

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela `push_subscriptions` (multi-device) | Nova tabela 1:N — perfil_id, endpoint, p256dh, auth, user_agent, last_seen_at, created_at. Suporta multi-device (Chrome desktop + iOS PWA + Android). UNIQUE (perfil_id, endpoint) | ✓ |
| `perfis.push_subscription` JSONB (1 device) | Per REQUIREMENTS-02 literal. Coluna JSONB única — cada install sobrescreve a anterior. Simpler schema mas usuário perde devices anteriores | |
| `perfis.push_subscriptions` JSONB[] (array) | Array de JSONB no perfis — multi-device sem tabela nova. Compromisso, mas custo de cleanup quando subscription expira | |

**User's choice:** Tabela `push_subscriptions` (multi-device)
**Notes:** Reinterpretação de REQUIREMENTS-02 documentada — JSONB único é insuficiente porque consultores CONSEJ usam desktop Chrome (escritório) + celular (campo). Tabela 1:N é a única estrutura que serve esse uso.

---

## Subscription expiry handling

| Option | Description | Selected |
|--------|-------------|----------|
| DELETE da row + log em `notificacoes_envios` | Limpeza automática — row some, `status='failed'` registrado. Próximo open do PWA re-subscribe | ✓ |
| Soft delete (coluna `invalidated_at`) | Marca timestamp mas mantém row. Útil para analytics, mas adiciona WHERE em toda query | |
| Manter ativa, apenas log do erro | Não toca na tabela — cada disparo tenta de novo. Gera lixo no histórico | |

**User's choice:** DELETE da row + log em `notificacoes_envios`
**Notes:** Auditoria fica no `notificacoes_envios`. push_subscriptions é "estado vivo" — quando o browser desconecta (410), a row deixa de ter sentido.

---

## Toggle Push OFF behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Mantém no DB, suprime envio | Row fica, edge function checa pref antes de enviar. Re-ligar = instantâneo sem novo permission prompt | ✓ |
| DELETE todas subscriptions + `unsubscribe()` | Toggle OFF = revoga consentimento. Re-ligar exige permission + install em cada device. Mais clássico LGPD | |
| Per-tipo toggle (sem master switch) | Sem switch global — 4 toggles individuais. Subscription fica enquanto pelo menos 1 estiver ON | |

**User's choice:** Mantém no DB, suprime envio
**Notes:** Combinado com pattern Phase 5 D-08 (sem master switch — 4 toggles per-tipo), o resultado é: 4 switches Push em `/me/preferencias` (igual Slack/Email), row em `push_subscriptions` independe do estado dos switches.

---

## Edge function shape

| Option | Description | Selected |
|--------|-------------|----------|
| Helper `_shared/push.ts` (igual D-20 Phase 5) | `sendPush()` chamado inline pelas 4 notify-*. Zero round-trip HTTP. Reinterpreta PUSH-03 | ✓ |
| Edge function `notify-push` dedicada | Per REQUIREMENTS-03 literal. Round-trip extra mas isolamento. Pattern async clássico | |
| Híbrido: helper + edge function | Mais flexibilidade futura mas overengineered para 4 dispatchers conhecidos | |

**User's choice:** Helper `_shared/push.ts` (igual D-20 Phase 5)
**Notes:** Reinterpretação documentada em D-05. Mesma justificativa de Phase 5 D-20: para 4 dispatchers conhecidos, helper compartilhado é mais simples, mais rápido (sem HTTP round-trip), e mantém topologia plana das edge functions.

---

## Web Push library

| Option | Description | Selected |
|--------|-------------|----------|
| `web-push@3.6.7` via esm.sh | Battle-tested VAPID + AES-128-GCM. ~30KB no bundle. Pattern compatível com `@supabase/supabase-js` via esm.sh | ✓ |
| Implementação artesanal via Deno crypto | Sem dependência externa, ~100 linhas. Menor bundle mas reinventa criptografia | |
| Planner decide após research | Adia para o researcher avaliar | |

**User's choice:** `web-push@3.6.7` via esm.sh
**Notes:** Trade-off de bundle aceitável. Criptografia validada > reinvenção. esm.sh já é o pattern do projeto.

---

## VAPID keys storage

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Secrets (private + public no edge) + VITE_VAPID_PUBLIC_KEY no Vercel | Private no Supabase Secret. Public também no Supabase Secret + exposta no client via VITE_*. Pattern já usado Phase 5 | ✓ |
| Apenas Supabase Secrets (frontend busca via GET) | Adiciona latency no boot. Public key é mesmo pública, não vale a complexidade | |
| Hardcoded com fallback env var | Viola separação code/config | |

**User's choice:** Supabase Secrets (igual RESEND_API_KEY)
**Notes:** Pre-requisito manual em STATE.md — gerar VAPID local + setar Supabase Secrets + setar Vercel env antes do execute-phase.

---

## PWA install prompt UX

| Option | Description | Selected |
|--------|-------------|----------|
| Banner topo + CTA em `/me/preferencias` | Banner discreto auto-show via `beforeinstallprompt`, dismissable. Card persistente nas prefs. iOS Safari: instrução manual no card | ✓ |
| Só card em `/me/preferencias` | Sem banner global. Adoption mais lenta — muitos consultores nunca entram em /me/preferencias | |
| Page dedicada `/me/instalar` | Onboarding completo. Mais polish, mais trabalho UI — over-engineering para 2-5 usuários | |
| Sidebar item "Instalar app" | Sempre visível mas suja nav para quem já instalou | |

**User's choice:** Banner topo + CTA em `/me/preferencias` (Recomendado)
**Notes:** Banner com dismiss permanente (localStorage). Banner some quando `display-mode: standalone` detectado.

---

## PWA assets generation

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar `public/logo.png` + gerar 192/512 client-side | Pegar logo existente. Theme color `--primary`. Skip iOS splash | ✓ |
| Pedir asset novo (Canva/Figma) | Polish maior mas exige passo manual fora do plan. Bloqueante | |
| Adiar assets para Phase 7+ | Phase 6 com ícones temporários | |

**User's choice:** Reusar `public/logo.png` + gerar 192/512 client-side
**Notes:** Script Node simples com `sharp` OU geração manual, commitar como `public/icon-192.png` e `public/icon-512.png`. Planner decide forma exata.

---

## Service Worker scope

| Option | Description | Selected |
|--------|-------------|----------|
| Apenas push + click handler (MVP) | sw.js minimal: `push` event + `notificationclick`. ~2KB. Foco da Phase 6 | ✓ |
| Push + cache de shell (offline básico) | Adiciona cache do app shell via Workbox. +~15KB | |
| Cache completo + TanStack persist | PWA totalmente offline. Inverte arquitetura — fora de scope | |

**User's choice:** Apenas push + click handler (MVP)
**Notes:** Offline é phase própria (já em PROJECT.md Future Goals).

---

## Permission request timing

| Option | Description | Selected |
|--------|-------------|----------|
| No toggle Push em `/me/preferencias` | Consentimento explícito. iOS Safari: toggle disabled se não-standalone | ✓ |
| Auto-prompt no primeiro login pós-install | Friction menor mas viola best practice (usuário não entende contexto) | |
| CTA explícito "Ativar notificações" em banner ou /tarefas | Contextual mas dispersa entry points | |

**User's choice:** No toggle Push em `/me/preferencias` (Recomendado)
**Notes:** Permission requested no clique do 1º Switch. Se denied, toggle volta a OFF + toast. LGPD-friendly.

---

## iOS Safari pre-install handling

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle Push disabled + instrução inline | Detecta iOS Safari não-standalone, mostra 4 switches Push disabled + tooltip "Instale o app primeiro" | ✓ |
| Modal forçado de install antes de prefs | Bloqueia tela inteira. Muito intrusivo — Android user não precisa instalar para receber push desktop | |
| Esconder coluna Push para iOS não-standalone | Usuário não descobre que existe — prejudica adoption | |

**User's choice:** Toggle Push disabled + instrução inline (Recomendado)
**Notes:** Detecção via `display-mode: standalone` + presence check, sem UA parsing frágil. Chrome Android/desktop não passam por esse gate.

---

## Deep link target

| Option | Description | Selected |
|--------|-------------|----------|
| Query params em rotas existentes | Tarefa: `/tarefas?highlight=<id>`. Lead: `/leads/<id>`. Indicação: `/indicacoes?highlight=<id>`. Renovação: `/contratos/<id>?tab=renovacao`. Reusa pages existentes | ✓ |
| Rotas dedicadas `/notif/<id>` | Server-side resolve tipo e redireciona. Mais limpo mas adiciona camada | |
| Sempre `/tarefas` ou `/dashboard` | Mata 50% do valor (REQUIREMENTS-04 pede deep link funcional) | |

**User's choice:** Query params em rotas existentes (Recomendado)
**Notes:** Reusa pattern de filtros bookmarkable já estabelecido no CRM (LeadsPage, IcpDinamicoPage). Cada page usa `useSearchParams` no `useEffect` para detectar `highlight` e abrir modal/scroll.

---

## Claude's Discretion

- Forma exata da UA/standalone detection (D-13) — combo `display-mode: standalone` + presence check em `navigator`.
- Estrutura exata do payload push (max 4KB VAPID): `{ title, body, data: { deepLink, tipo, entidadeId } }`. Inclusão de `icon`/`badge` URLs a critério.
- Banner copy + visual + posicionamento (D-09) — PT-BR, dismissable, some quando standalone.
- Geração dos PNGs 192/512 (script `sharp` local OU manual via online tool).
- Tab order em MeEspacoPage — coluna Push entra como 3ª na matriz, à direita de Email.
- Multi-tab push behavior (não suprimir é default OK).
- Refactor oportunista de `findDiretores()` se reusado entre canais.

## Deferred Ideas

- Push grouping/coalescing por janela de tempo — `## Future Goals` PROJECT.md
- Cache do app shell (offline básico) — phase futura própria
- Offline-first via TanStack Query persist + IndexedDB — fora de scope
- Rota dedicada `/notif/<id>` genérica — query params são mais barato e discoverable
- Auto-prompt no first login standalone — viola consentimento explícito
- Page dedicada `/me/instalar` — banner + card cobrem MVP
- iOS splash screen polish — fundo branco Safari aceitável MVP
- Templates push visualmente ricos (badge, image, actions) — v2 do milestone
- Sidebar item "Instalar app" — banner não polui nav permanente
- Modal forçado de install antes de prefs — muito intrusivo
- Esconder coluna Push para iOS não-standalone — prejudica adoption
- Soft delete em `push_subscriptions` (`invalidated_at`) — DELETE + log é mais simples
- DELETE subscriptions + `unsubscribe()` no toggle OFF — re-ligar instantâneo é melhor UX
- Per-tipo toggle SEM master switch — escolhido (sem master = consistência Phase 5)
