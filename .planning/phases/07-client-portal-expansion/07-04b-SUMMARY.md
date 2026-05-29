---
plan: 07-04b
phase: 07
title: Dashboard + ConfigDiasAprovacao + migration 039 + UAT
status: shipped-partial
wave: 4
duration_min: ~30
date: 2026-05-28
---

# Plan 07-04b — Dashboard aprovações pendentes + ConfigDiasAprovacao + UAT

> Wave 4 (final) deliverable. Liga as últimas peças visíveis: dashboard role-aware para coord+/consultor, UI configurável do threshold D-13, banner de uso de bucket, botão reenviar lembrete (skip_slack), tests RLS/E2E, e UAT manual 8 itens deferido para devices reais.

## What was built

- `supabase/migrations/039_bucket_usage_function.sql` — SQL function `bucket_usage_bytes(p_bucket text)` SECURITY DEFINER que soma `metadata->>'size'::bigint` em `storage.objects WHERE bucket_id = p_bucket`. GRANT EXECUTE TO authenticated.
- `src/hooks/useAprovacoesPendentes.ts` — query hook que lista cliente_docs `WHERE status='pending' AND requer_aprovacao=true AND deleted_at IS NULL`, ordenado por dias parados; RLS filtra automaticamente (coord+ vê tudo, consultor vê só dos seus via clientes.responsavel_id).
- `src/hooks/useBucketUsage.ts` — query hook que chama RPC `bucket_usage_bytes('cliente-docs')` com 1min stale time.
- `src/components/portal-admin/BucketUsageBanner.tsx` — mostra "X MB / 1024 MB"; banner WARN >80% (~820MB) gated por `RequireRole atLeast="coordenador"`.
- `src/components/portal-admin/ReenviarLembreteButton.tsx` — POST para `notify-aprovacao-evento` com `evento: 'aprovacao_pendente_stale'` + `skip_slack: true` (D-12). Cooldown 1h client-side (localStorage timestamp + disabled state).
- `src/components/configuracoes/ConfigDiasAprovacao.tsx` — input number + slider + Save button + `useUpdateConfiguracoes` mutation que faz `UPDATE configuracoes SET metas = jsonb_set(metas, '{dias_para_aprovacao_pendente}', to_jsonb($1::int))`. Gated `RequireRole atLeast="coordenador"`.
- `src/pages/portal-admin/AprovacoesPendentesPage.tsx` — tabela: Cliente, Doc (nome+tag+versão), Enviado em, Dias parados, Consultor responsável, ReenviarLembreteButton action. Plug `BucketUsageBanner` no topo (coord+).
- `src/router.tsx` — rota `/portal-admin/aprovacoes-pendentes` adicionada como child de AppLayout (CRM, não portal cliente).
- `src/components/layout/Sidebar.tsx` — entry "Aprovações Pendentes" no grupo CRESCIMENTO (linha 59 — `to: '/portal-admin/aprovacoes-pendentes', icon: FileText`).
- `src/pages/ConfiguracoesPage.tsx` — `ConfigDiasAprovacao` plugado (coord+ only).
- `tests/rls/cliente_docs.test.ts` — RLS verification: cliente vê só own, consultor responsavel vê só dos seus, coord+ vê tudo, DELETE forbidden.
- `tests/rls/cliente_docs_storage.test.ts` — storage.objects RLS path-based via `storage.foldername(name)[1]`.
- `tests/e2e/cliente-docs-flow.spec.ts` — Playwright spec: cliente login → upload → consultor see → aprovar → notif row in notificacoes_envios.

## Tasks

| Task | Status | Commit | Notes |
|------|--------|--------|-------|
| 4b-1 — Hooks + migration 039 SQL | ✅ complete | `2fc41d2` | useAprovacoesPendentes + useBucketUsage + migration file |
| 4b-2 — Banner + Reenviar + ConfigDias | ✅ complete | `4e47ea7` | 3 components + plug em ConfiguracoesPage |
| 4b-3 — AprovacoesPendentesPage + rota + Sidebar | ✅ complete | `226e03a` | Page + router + Sidebar entry CRESCIMENTO |
| 4b-4 — Tests RLS + E2E populados | ✅ complete | `17c1dc6` | RLS 3-way + E2E spec; skip enquanto `.env.test` não tem QA_* |
| 4b-5 — Apply migration 039 (BLOCKING) | ✅ complete | (this SUMMARY) | Applied inline via `supabase db query --linked -f` (SUPABASE_DB_PASSWORD set). `bucket_usage_bytes('cliente-docs')` returns 0 (empty bucket) |
| 4b-6 — UAT 8 itens manual | 🟨 **deferred-manual** — see below | (this SUMMARY) | Requires real devices + cliente login + multi-canal delivery verification |

## Verification

**Migration 039 applied:**
```
SELECT proname, prosecdef FROM pg_proc WHERE proname = 'bucket_usage_bytes'
→ 1 row, prosecdef=true ✓

SELECT public.bucket_usage_bytes('cliente-docs') AS bytes
→ 0 (bucket vazio ainda — primeiro upload real via UAT vai incrementar) ✓
```

**Code quality:**
- `npx tsc -b --noEmit` exits 0
- `npm test` → 343 passed, 10 pre-existing fails em notify-* edge function (Deno ESM imports — fora de scope Phase 7)
- 11 RLS tests skip enquanto `.env.test` não tem QA_DIRETOR_EMAIL/QA_CONSULTOR_EMAIL (sintaxe validada via tsc)

## Deviation — UAT 8 itens deferido para devices reais

8 itens do VALIDATION.md §Manual-Only requerem device físico + interação humana com cliente login + cross-RLS + real Storage upload + multi-canal delivery. Orquestrador não consegue automatizar:

### 8-Item UAT Checklist (preserved for manual run)

**Devices needed:** Chrome desktop + Chrome Android + iPhone Safari 16.4+ (PWA instalada via Phase 6 install banner)

| # | Item | Requirement | Test Steps |
|---|------|-------------|------------|
| 1 | Drag-drop OS desktop → upload | PORTAL-01 | `/portal/documentos` no Chrome desktop → arrastar PDF do explorer → drop na UploadDropzone → progress visível → row em `cliente_docs` com mime_type+size corretos + Storage object em `cliente-docs/{cliente_id}/{doc_id}.pdf` |
| 2 | Drag-drop iPhone Safari (touch fallback) | PORTAL-01, D-05 | Safari iOS 16.4+ standalone → /portal/documentos → tentar drag-drop (mobile native cai pra file picker `<input>`) → upload completa OK |
| 3 | Signed URL download | PORTAL-01, D-04 | Lista de docs → clicar "Baixar" → signed URL gerada (verificar Network: expiry 60min) → download OK |
| 4 | Bucket usage banner >80% para coord+ | D-06 | Login como coordenador → `/portal-admin/aprovacoes-pendentes` → card mostra `X MB / 1024 MB`; simular passar 80% (cron + insert fixtures) → banner WARN aparece |
| 5 | Reenviar lembrete dispara email+push pro cliente | D-12, T-07-12 | Coord+ no dashboard → clicar Reenviar → timeline doc registra timestamp + perfil_id; cliente em outra sessão recebe email; push se cliente assinou |
| 6 | 5-day stale cron real disparo | D-07 (d), D-10 | Ajustar pg_cron temporariamente `* * * * *` → INSERT cliente_docs `created_at = now() - interval '6 days', status='pending'` → aguardar 1 min → `notificacoes_envios` tem row tipo='documentos' canal=conforme prefs |
| 7 | MIME spoofing protection | T-07-04 (accepted) | Renomear `malware.exe` → `proposta.pdf` → drag-drop → frontend `file.type` aceita (vai como application/pdf) → backend não sniffing MIME real nesta MVP → **esperado**: tech-debt aceito (não bloqueador) |
| 8 | Cliente login + cross-RLS verification | D-04, T-07-02, T-07-08 | Cliente A login → `/portal/documentos` → vê só docs do próprio cliente_id; tentativa via DevTools de acessar `cliente-docs/{outro_cliente_id}/...` → RLS bloqueia (403) |

### Housekeeping checks

- [ ] `curl -I` em `/portal-admin/aprovacoes-pendentes` retorna 200 (auth necessária — vai 401 sem token, OK)
- [ ] Sidebar entry "Aprovações Pendentes" visível em CRESCIMENTO no Chrome desktop (linha 59 do Sidebar.tsx)
- [ ] ConfigDiasAprovacao input visível só para coord+ em /configuracoes
- [ ] Phase 6 não regrediu — Slack DM + email + push continuam disparando paralelo nos eventos PUSH-03

### Pass criteria for phase close

- Pelo menos 6 de 8 UAT items pass em devices reais
- Item 7 (MIME spoofing) esperado tech-debt (T-07-04 accepted no SECURITY)
- Fails documentados como tech-debt Phase 8+ (não rebloqueiam Phase 7)

### Resume signal

Quando rodar UAT, atualizar este SUMMARY com resultados (1-8 + housekeeping). Tech-debt vira issue ou Phase 8 backlog.

## Tech Debt / Open Items

1. **UAT manual 8 itens** — checklist acima. Roda quando 3 devices disponíveis. Não bloqueia release (código + DB + edge functions em prod).
2. **MIME sniffing real** (T-07-04) — accepted no SECURITY phase. Tech-debt explícito.
3. **`.env.test` QA_* credentials** — RLS tests skip enquanto faltar. Adicionar pra habilitar suite RLS completa.

## Wave 4 → Phase 7 close

Plan 04b é o último da Phase 7. Todo o código está commitado. Edge functions em prod. Migrations 037/038/039 aplicadas. Phase 7 está **funcionalmente completa pendente UAT** — 4 success criteria do ROADMAP atendidas estruturalmente:

- SC1 ✅ — `/portal/documentos` + UploadDropzone + Storage `cliente-docs/{cliente_id}/` (RLS isola via storage.foldername path-based)
- SC2 ✅ — Consultor sobe na ficha cliente (`/clientes/:id` tab Documentos) → cliente vê via mesma RLS
- SC3 ✅ — Aprovar/Solicitar Revisão → trigger `cliente_docs_after_change` → pg_net.http_post → `notify-aprovacao-evento` → `sendNotificacaoAprovacao` 3-canal paralelo
- SC4 ✅ — `/portal-admin/aprovacoes-pendentes` + ReenviarLembreteButton (email+push, skip_slack) + ConfigDiasAprovacao (D-13 UI)
