---
phase: 05-multi-channel-notifications-email
scope: plans 01 + 02 + 03 + 04 (consolidated audit)
asvs_level: 1
block_on: high
threats_total: 7
threats_closed: 7
threats_open: 0
unregistered_flags: 0
audited_on: 2026-05-27
auditor: gsd-security-auditor
---

# Phase 05 — Security Audit (Notifications Multi-Canal)

Auditoria consolidada das 4 ondas do Phase 5 (e-mail Resend + webhook + UI prefs + portal placeholder). Verificação por evidência de código — não por intenção documentada.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-01 | Spoofing+Repudiation — webhook signature bypass / replay | mitigate | CLOSED | `supabase/functions/resend-webhook/verify.ts:24-61` (HMAC SHA-256 via Web Crypto + base64-decoded secret + suporte multi-sig); `verify.ts:63-68` constantTimeEquals; `verify.ts:74-79` isReplayValid janela 5 min; `resend-webhook/index.ts:62-80` chain: headers obrigatórios → replay window → HMAC → 401 em qualquer falha |
| T-05-02 | Tampering — email injection via unescaped user content | mitigate | CLOSED | `_shared/templates/render.ts:16-23` escapeHtml (5 chars: &<>"'); aplicado em todos os textos dos 4 renders: renderTarefa (l. 32-38), renderCadencia (l. 48-55), renderRenovacao (l. 66-74), renderIndicacao (l. 85-93). URLs (deepLink, gerenciarPrefsLink) propositadamente sem escape — geradas server-side, não input do usuário |
| T-05-03 | DoS — reenviar abuse spam quota Resend | mitigate | CLOSED | (a) Hard quota Resend é o cap final — `reenviar-notificacao/index.ts:215-219` trata 429 com retry+failed; (b) `src/components/shared/QuotaResendBanner.tsx:23` renderiza alert quando max(hoje/100, mes/3000) > 0.8; (c) banner montado em AdocaoPage:19 e ConfiguracoesPage:355 com `RequireRole atLeast="coordenador"`; (d) decisão D-18 explícita "sem rate-limit interno" registrada em Plan 3 threat model |
| T-05-04 | Information Disclosure — consultor lê notif de outros via SQL | mitigate | CLOSED | `supabase/migrations/035_notificacoes_envios.sql:130-133` policy `notif_envios_read FOR SELECT TO authenticated USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'))`; `migrations/035:126` ENABLE RLS; sem policy permissiva para INSERT/UPDATE — service_role only (R6, comentário inline l. 22-23, 128-129). Frontend `reenviar-notificacao/index.ts:111-144` usa supabaseUser (com JWT) para SELECT inicial → RLS bloqueia consultor vendo alheios; `tests/rls/notificacoes_envios.test.ts` exercita policy |
| T-05-05 | Spoofing+Info Disclosure — magic link no rodapé | mitigate | CLOSED | `_shared/email.ts:88-105` generateMagicLink usa `supabase.auth.admin.generateLink({ type: 'magiclink' })` — Supabase audita e expira ~1h por default; try/catch retorna fallback URL `${APP_URL}/me?tab=notificacoes` (sem token) se generateLink falhar (R3 rate-limit graceful). Sem JWT hand-rolled. `notify-tarefa/index.ts:225` consome via callsite |
| T-05-06 | DoS — NULL responsavel_id → fallback diretor inunda diretor | mitigate | CLOSED | `_shared/perfis.ts:73-81` findDiretores filtra defensivamente id/email; `notify-tarefa/index.ts:180-200` aciona fallback quando `!destinatario.email`, registra linha extra com `status='fallback_diretor'` + error_msg (audit/observability); idempotência via UNIQUE partial index (migration 035:71-79) protege duplicatas dentro do mesmo dia para mesma (perfil, tipo, entidade); volume baixo (1-2 diretores CONSEJ) — risco real mínimo conforme threat model |
| T-05-07 | Elevation of Privilege — forge criado_por_id pra inundar outro perfil | accept | CLOSED | Disposition é **accept** (Plan 1 threat model). Verificação: webhook protegido por `WEBHOOK_TAREFA_SECRET` via `constantTimeAuthCheck` — `notify-tarefa/index.ts:119-124` rejeita 401 sem header. Sem caminho público para atacante chamar a função. Pattern preexistente do projeto reiterado em Plan 1. Self-loop guard adicional em `notify-tarefa/index.ts:161-163` reduz superfície mesmo no caso de payload válido com criador==atribuído |

## Unregistered Flags

Nenhum. O bloco `## Threat Flags` do SUMMARY de Plan 5-02 lista explicitamente os 8 threat IDs já cobertos pelo register; SUMMARYs 5-01, 5-03 e 5-04 não introduzem superfície nova fora do mapeamento. Plan 5-04 (portal placeholder) é UI estática sem persistência — threats acceitas no próprio threat model.

## Accepted Risks Log

| ID | Why accepted | Reassess on |
|----|--------------|-------------|
| T-05-07 | Webhook secret-protected (constantTimeAuthCheck + WEBHOOK_TAREFA_SECRET) é pattern preexistente do projeto; sem caminho público para forjar payload. Self-loop guard adicional é defense-in-depth | Quando outra função expor caminho público para criar tarefas |
| T-05-QUOTA-DOS (escopo Plan 1, T-05-03 no register) | "Sem rate-limit interno de re-envio" decisão D-18 explícita — hard quota Resend (100/dia, 3k/mês) é o cap final; banner UI alerta coord+ a partir de 80% | Quando padrão de abuso emergir nos logs ou histórico |
| T-05-MIG-RACE | Ordem de deploy garantida: migration 035 aplicada (Plan 1 Task 5) → resend-webhook deployada (Plan 2 Task 4) → endpoint registrado no Resend Dashboard só DEPOIS dos passos anteriores | N/A — gate único de deploy |
| T-05-OPEN-REDIRECT (Plan 3) | redirectTo gerado server-side em sendEmail (Plan 1) sempre apontando para `${APP_URL}/me?tab=notificacoes` — não input do usuário | Quando query string do magic link aceitar input do caller |
| T-05-PORTAL-AUTH-DRIFT (Plan 4) | Página Portal `/portal/preferencias` é informativa, Switch desabilitado sem persistência. Interno via account switcher acessa pattern já estabelecido (D-09) | Phase 7 quando notify-cliente-aprovacao real for ativado |

## Observabilidade / Defense-in-depth

- **STATUS_RANK monotonic** em `resend-webhook/index.ts:30-40` impede regressão de status (opened nunca regride para delivered) — Pitfall 2.
- **Dedup natural via UPDATE idempotente** — sem tabela auxiliar; mesmo svix-id processado 2x = mesmo resultado. Pitfall 3 testado em `resend-webhook/__tests__/replay.test.ts`.
- **Hand-off D-07** em notify-renovacao: `hydrateContrato` lê `responsavel_id` no momento do disparo (cron) — sem snapshot. Comentário inline documenta. Test `notify-renovacao/__tests__/handoff.test.ts` exerce.
- **Slack delivery log idempotente** em `notify-tarefa/index.ts:91-113` silencia 23505 (UNIQUE partial index libera reenvios).
- **CORS handler em reenviar-notificacao** — `index.ts:51-55, 96-99` preflight OPTIONS retorna 204 com headers controlados.

## Conclusion: SECURED

Todas as 7 threats do register declarado (T-05-01..07) foram verificadas em código com evidência exata (file:line). Nenhum gap. Phase 5 está pronta para ship.

Disposições `accept` (T-05-07) e os 4 itens do "Accepted Risks Log" estão documentados explicitamente com justificativa e gatilho de reavaliação. Threats marcadas como `mitigate` têm grep match na evidência citada nos PLANs.

Aviso operacional (não-blocker): `reenviar-notificacao` chama Resend diretamente (sem `checkQuota` pre-check do `_shared/email.ts`) — confiança no 429 do Resend + banner UI cobrem o gap conforme decisão D-18. Se o padrão de uso mudar, adicionar `checkQuota` antes do INSERT (linha 165) elimina a janela entre 80% e 100%.
