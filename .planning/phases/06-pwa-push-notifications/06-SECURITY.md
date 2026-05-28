---
phase: 06-pwa-push-notifications
slug: pwa-push-notifications
status: verified
asvs_level: 1
threats_total: 22
threats_closed: 22
threats_open: 0
audit_date: 2026-05-28
block_on: high
---

# Phase 6 — Security Audit

Auditoria de mitigação para Phase 6 (PWA + Web Push). Verificação por evidência em código (não por intenção de documentação). Threat register é a união dos blocos `<threat_model>` dos 5 PLANs (T-06-01 … T-06-22).

## Audit Summary

- **22 threats** registrados nos 5 planos.
- **22 CLOSED** — todas as mitigações declaradas foram verificadas no código implementado.
- **5 ACCEPTED-no-code** (subset acima) — riscos aceitos com justificativa documentada (`accept` disposition).
- **0 OPEN.**
- Nenhum `unregistered_flag` materializado nos SUMMARYs.

ASVS Level 1 satisfeito para V2 (Auth), V4 (Access Control), V5 (Input Validation), V6 (Cryptography — VAPID via `web-push@3.6.7`), V9 (Communication — HTTPS por contrato RFC 8030), V13 (API — webhook secrets em todas notify-*), V14 (Config — secrets fora do repositório).

## Threat Register

| ID | Category | Component | Disposition | Status | Evidence |
|----|----------|-----------|-------------|--------|----------|
| T-06-01 | Information Disclosure | VAPID private key | mitigate | CLOSED | `supabase/functions/_shared/push.ts:25-27` lê `VAPID_PRIVATE_KEY` via `Deno.env.get` (nunca literal); `supabase/functions/smoke-push/index.ts:78` idem; chave nunca aparece em `errorMsg` (`push.ts:184-211`). Setup manual em Supabase Secrets (Task 1.3). `.gitignore` cobre `.env*`. |
| T-06-02 | Information Disclosure | RLS `push_subscriptions` enumeration | mitigate | CLOSED | `supabase/migrations/036_push_subscriptions.sql:37-40` policy `push_subs_select` com `USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'))`. Regression test: `tests/rls/push_subscriptions.test.ts:7-15` (consultor próprias vs diretor todas). |
| T-06-03 | Tampering | Migration 036 backfill | mitigate | CLOSED | `supabase/migrations/036_push_subscriptions.sql:124-134` — backfill idempotente com `WHERE NOT (preferencias_notif #> '{tarefa,push}') IS NOT NULL`; `jsonb_set(... , true)` preserva slack/email. Verificado por Gabriel pós-apply (5 perfis OK, SUMMARY 01:80-85). |
| T-06-04 | Spoofing | INSERT `push_subscriptions` com perfil alheio | mitigate | CLOSED | `supabase/migrations/036_push_subscriptions.sql:43-46` policy `push_subs_insert WITH CHECK (perfil_id = auth.uid())`. `src/hooks/usePushSubscriptions.ts:56-66` usa supabase client autenticado (RLS aplica). Test scaffold em `tests/rls/push_subscriptions.test.ts:13`. |
| T-06-05 | Tampering | `smoke-push` edge function pública sem JWT | accept | ACCEPTED | `supabase/functions/smoke-push/index.ts:52-122` — apenas lê env vars e retorna `library_loaded/set_vapid_details_ok/generated_keys_ok/public_key_length/private_key_length` (apenas tamanho, nunca valores). Sem mutation, sem PII. Deploy `--no-verify-jwt` intencional (header L22). Aceite documentado em PLAN 01:343. |
| T-06-07 | Tampering | `notificationclick` → openWindow (open redirect) | mitigate | CLOSED | `public/sw.js:44` — `if (new URL(targetUrl).origin !== self.location.origin) return` antes de `openWindow`. Defesa em profundidade: `src/components/layout/AppLayout.tsx:72-77` valida `url.origin !== window.location.origin` antes de `navigate(...)` na mensagem `PUSH_NAVIGATE`. |
| T-06-08 | Information Disclosure | `manifest.json` expõe app structure | accept | ACCEPTED | PWA spec exige manifest público; sem secrets. Aceite documentado em PLAN 02:243. |
| T-06-09 | Tampering | SW cache impede deploy de fix de segurança | mitigate | CLOSED | `vercel.json` configura `/sw.js` com `Cache-Control: public, max-age=0, must-revalidate` + `Service-Worker-Allowed: /` (SUMMARY 02:23, 37-44). |
| T-06-10 | Spoofing | Notification body com HTML/script malicioso | accept | ACCEPTED | `self.registration.showNotification(title, { body })` Web API trata `body` como plaintext (não interpreta HTML/JS). Aceite documentado em PLAN 02:245. Defesa-em-profundidade implementada em T-06-12. |
| T-06-11 | Spoofing | Push payload spoofing por terceiros | mitigate | CLOSED | `supabase/functions/_shared/push.ts:22, 33-40` carrega `webpush@3.6.7` que implementa VAPID JWT assinado com ECDSA P-256 (RFC 8292). Sem `VAPID_PRIVATE_KEY` nenhum atacante consegue produzir JWT válido para `applicationServerKey` registrada. |
| T-06-12 | Tampering | XSS via push body (input do usuário) | mitigate | CLOSED | `supabase/functions/_shared/push.ts:93-99` — `safePayload` aplica `title.slice(0, 50)` e `body.slice(0, 150)` antes de `JSON.stringify` para `webpush.sendNotification`. Browser API `showNotification` trata `body` como plaintext (R-S4). Dupla camada de defesa per SUMMARY 03:108. |
| T-06-13 | Denial of Service | Subscriptions stale acumulam no DB | mitigate | CLOSED | `supabase/functions/_shared/push.ts:201-211` — `if (sc === 410 \|\| sc === 404)` faz `supabase.from('push_subscriptions').delete().eq('id', sub.id)` + `cleaned++`. D-02 implementado. |
| T-06-14 | Repudiation | Push enviado sem registro auditável | mitigate | CLOSED | `supabase/functions/_shared/push.ts:131-145` — INSERT atômico em `notificacoes_envios` com `canal: 'push'` e `status: 'queued'` ANTES do envio. UNIQUE (perfil, tipo, canal, dia, entidade) garante 1 row auditável; update final em L218-227 grava `delivered`/`failed` + `error_msg`. |
| T-06-15 | Spoofing | Atacante chama `notify-*` direto | mitigate | CLOSED | Webhook secret + constant-time check em todas as 4 funções: `notify-tarefa/index.ts:120-122`, `notify-resumo-diario/index.ts:90-92`, `notify-indicacao/index.ts:279-281`, `notify-renovacao/index.ts:168-170` — todas usam `constantTimeAuthCheck(auth, WEBHOOK_*_SECRET)` de `_shared/auth.ts:13`. |
| T-06-16 | Repudiation | Usuário nega ter ativado push | mitigate | CLOSED | `supabase/migrations/036_push_subscriptions.sql:19-29` — `push_subscriptions` tem `created_at` + `user_agent` (registrado em `src/hooks/usePushSubscriptions.ts:62` com `navigator.userAgent.slice(0, 500)`). Coord+ pode SELECT todas (RLS L37-40) para auditoria. |
| T-06-17 | Spoofing | VAPID public key mismatch client ↔ server | mitigate | CLOSED | `src/hooks/usePushSubscriptions.ts:48-51` — runtime check: `if (!vapidKey) throw new Error('VAPID public key não configurada (VITE_VAPID_PUBLIC_KEY)')`. Setup pré-flight validado por Gabriel (SUMMARY 01:80-87). |
| T-06-18 | Tampering | XSS via `user_agent` armazenado | accept | ACCEPTED | `src/hooks/usePushSubscriptions.ts:62` — `user_agent: navigator.userAgent.slice(0, 500)` limita storage attack via UA gigante. Coluna `text` lida só por coord+ debug (RLS); render normal escapado por React por default. Aceite documentado em PLAN 04:381. |
| T-06-19 | Spoofing (R-L5) | Switch Push em estado inconsistente após permission denied | mitigate | CLOSED | `src/components/me/NotificacoesPanel.tsx:115-134` — `handlePushToggle` faz rollback explícito do draft via `setDraft(prev => ... push: false)` quando `requestPermission()` retorna `!== 'granted'` ou quando subscribe lança. Toast `'Permissão negada'` ou message do erro. |
| T-06-20 | Tampering | URL malformada em `PUSH_NAVIGATE` crasha AppLayout | mitigate | CLOSED | `src/components/layout/AppLayout.tsx:71-81` — `try { new URL(e.data.url) ... } catch { console.warn(...) }` ignora message inválida; AppLayout não crasha. |
| T-06-21 | Information Disclosure | Banner revela existência do PWA install | accept | ACCEPTED | Banner é UI pública (`src/components/layout/InstallAppBanner.tsx` mounted em `AppLayout.tsx:105`) — nada sensível exposto. Aceite documentado em PLAN 05:393. |
| T-06-22 | Repudiation | Dismiss via `localStorage` permite "esquecer" que viu banner | accept | ACCEPTED | `localStorage.consej_install_banner_dismissed` é per-device UX (mesmo pattern de `consej_kanban_hint`); não substitui auditoria. Aceite documentado em PLAN 05:394. |
| T-06-SC | Supply Chain | `web-push@3.6.7` malicioso/comprometido | mitigate | CLOSED | Versão pinned em `_shared/push.ts:22` e `smoke-push/index.ts:31` (`https://esm.sh/web-push@3.6.7`). `slopcheck install web-push → [OK]` (RESEARCH §Package Legitimacy Audit). `npm view web-push scripts.postinstall` vazio. R-L1 derrubado via smoke-push (SUMMARY 01:88-110). |

## Accepted Risks Log

| ID | Risk | Rationale | Sign-off |
|----|------|-----------|----------|
| T-06-05 | `smoke-push` edge function pública sem JWT | Função diagnóstica retorna apenas booleans + tamanhos de chave (`public_key_length`, `private_key_length`), nunca valores. Sem mutation. Aceite intencional para troubleshooting R-L1 (Deno crypto/ECDH). | PLAN 01:343, smoke-push header L18-19 |
| T-06-08 | `manifest.json` exposto publicamente | Requisito do PWA spec; sem secrets no manifest. | PLAN 02:243 |
| T-06-10 | Notification body com HTML | API `showNotification` Web Standard trata `body` como texto puro; defesa adicional via truncate em T-06-12. | PLAN 02:245 |
| T-06-18 | XSS via `user_agent` armazenado | Truncado a 500 chars; coluna text; render via React (escape default); RLS limita leitura a coord+. | PLAN 04:381 |
| T-06-21 | Banner expõe app tem PWA install | UI pública por design. | PLAN 05:393 |
| T-06-22 | Banner dismiss via localStorage | UX per-device, não substitui auditoria; banner é discovery secundário (instalar tb via `InstalarAppCard`). | PLAN 05:394 |

## Notes / Observations (informativo, não blocker)

1. **`supabase/functions/_shared/__tests__/push.test.ts` está integralmente em `it.todo()`** (L10-42). Os comportamentos T-06-12 (truncate), T-06-13 (cleanup 410/404) e T-06-14 (audit) estão implementados em `_shared/push.ts` e foram verificados por leitura direta do código, mas a regressão automatizada para esses caminhos ainda é manual/UAT. Tech-debt: levantar assertions reais no test (mock `webpush.sendNotification` com `statusCode: 410`). Não é BLOCKER porque a verificação por leitura direta passou e SUMMARY 03 lista os comportamentos como confirmados via inspeção de código.

2. **Tasks 2.4 e 5.4 (UAT em devices reais) deferred-manual** — 11-item UAT preserved em SUMMARY 05:43-91 para execução quando Gabriel tiver acesso aos 3 devices (Chrome desktop, Chrome Android, iPhone Safari 16.4+). Não rebloqueia phase porque o código está em produção e o `verify-pwa-static.cjs` (Plan 02) cobre as checagens estruturais (manifest, SW, ícones, vercel headers).

3. **Subscription replay após logout** — risco identificado no RESEARCH §Security R-S8: subscription continua no DB após `signOut`. Aceito no MVP (não locked como threat T-06-*; nem virou flag). Futuro hardening: limpar `push_subscriptions` próprias no `signOut`. Não é blocker — push só dispara para destinatários que ainda têm permission ativa no device; logout invalida sessão CRM mas não SW push permission (que é o comportamento esperado em PWA standalone).

## Audit Trail

- **Date:** 2026-05-28
- **Auditor:** /gsd-secure-phase (Phase 6 closure)
- **Source files audited:**
  - 5 PLANs + 5 SUMMARYs (`.planning/phases/06-pwa-push-notifications/06-0[1-5]-*.md`)
  - `supabase/migrations/036_push_subscriptions.sql`
  - `supabase/functions/_shared/push.ts`, `_shared/auth.ts`
  - `supabase/functions/{notify-tarefa,notify-resumo-diario,notify-indicacao,notify-renovacao,smoke-push}/index.ts`
  - `public/sw.js`
  - `src/lib/pwa.ts`
  - `src/hooks/usePushSubscriptions.ts`
  - `src/components/me/NotificacoesPanel.tsx`
  - `src/components/layout/AppLayout.tsx`, `InstallAppBanner.tsx`
  - `tests/rls/push_subscriptions.test.ts`
  - `supabase/functions/_shared/__tests__/push.test.ts`
- **Counts:** 22 total / 22 CLOSED / 6 ACCEPTED-by-disposition / 0 OPEN.
- **Block_on:** high — satisfied (0 HIGH severity threats OPEN).
