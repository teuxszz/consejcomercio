# Phase 5: Multi-Channel Notifications (Email) - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Mode:** MVP (vertical slice — ROADMAP)

<domain>
## Phase Boundary

Adicionar **canal de e-mail** (Resend free tier) às notificações existentes (Slack), permitindo **opt-in granular por usuário** (interno e cliente) com **histórico de 30 dias**, **status de entrega via webhook Resend**, **reenvio** e **proteção contra estouro de quota**.

**Modelo de roteamento:** Híbrido — canal Slack `#leads-consej` mantém o broadcast existente para renovação/indicação; cada usuário recebe adicionalmente DM Slack e/ou e-mail per-user conforme suas preferências. Tarefa e cadência (já per-user via DM hoje) ganham companion email.

**Funções Slack existentes preservadas:** `notify-tarefa`, `notify-resumo-diario`, `notify-indicacao`, `notify-renovacao` continuam funcionando. Phase 5 adiciona lógica de prefs + helper de e-mail compartilhado + nova edge function `resend-webhook` + UI de preferências/histórico.

**Out of scope (delegado para Phases futuras ou v2):** templates HTML visualmente ricos via MJML; push notifications (Phase 6); cliente aprovando documentos (Phase 7); AI gerando subject/body; queue/retry de e-mails dropados; fallback automático Slack quando quota cheia; rate-limit interno de re-envio.

</domain>

<decisions>
## Implementation Decisions

### Routing & Recipients

- **D-01:** Modelo **híbrido** — canal Slack broadcast (`SLACK_LEADS_CHANNEL_ID`) continua para renovação e indicação + per-user (DM Slack e/ou e-mail) para o responsável da entidade. Tarefa/cadência (já per-user via DM) ganham companion e-mail conforme prefs.
- **D-02:** Destinatário per-user:
  - Renovação → `contratos.responsavel_id`
  - Indicação → `leads.responsavel_id` do lead criado pela indicação
  - Tarefa → `tarefas.atribuido_a_id` (já existente)
  - Cadência → `perfis.id` do consultor (já existente em `notify-resumo-diario`)
- **D-03:** Quando os dois switches (Slack + e-mail) estão marcados para o mesmo tipo, **dispara AMBOS em paralelo**, sem deduplicação. **Reinterpreta EMAIL-03** "Slack OU e-mail" como "Slack E/OU e-mail — cada switch independente".
- **D-04:** Default de prefs ao criar novo perfil (trigger `handle_new_user`): **Smart default** — Email = ON em todos os 4 tipos; Slack = ON em todos os 4 tipos **somente se `slack_user_id` preenchido**, senão OFF.
- **D-05:** Quando `responsavel_id` é NULL no momento do disparo per-user → fallback: enviar e-mail para **todos os perfis com `role='diretor'`**. Canal Slack broadcast continua independente. Log `status='fallback_diretor'` em `notificacoes_envios` para observabilidade.
- **D-06:** **Suprimir self-loop** — se `criado_por_id == atribuido_a_id` em `notify-tarefa`, suprimir DM Slack e e-mail. Tech-debt nas funções existentes a corrigir nesta phase.
- **D-07:** **Hand-off** — funções cron-driven (renovação, resumo-diário) leem `responsavel_id` **atual no momento do disparo**. Sem notificação dupla durante transição.

### Preferences UX

- **D-08:** Estrutura JSONB de `perfis.preferencias_notif`:
  ```
  {
    "tarefa":    { "slack": true, "email": true },
    "cadencia":  { "slack": true, "email": true },
    "renovacao": { "slack": true, "email": true },
    "indicacao": { "slack": true, "email": true }
  }
  ```
- **D-09:** UI prefs internos = **nova tab "Notificações" em `MeEspacoPage`** com novo `NotificacoesPanel` em `src/components/me/`. Rota `/me/preferencias` monta `MeEspacoPage` com tab pré-selecionada (via `?tab=notificacoes` ou rota dedicada que set tab — planner decide). Matriz **4 linhas × 2 colunas com 8 Switch shadcn** (4 tipos × 2 canais).
- **D-10:** UI prefs cliente = **nova rota `/portal/preferencias`** (componente em `src/pages/portal/`) — matriz reduzida com tipos relevantes pra cliente (a definir na implementação; provavelmente `notif_documentos` quando Phase 7 ativar) × canal e-mail apenas. MVP cria a UI; integração com notifs reais ativa em Phase 7.
- **D-11:** Histórico = **nova página dedicada `/me/notificacoes-historico`** (sub-rota separada). Link "Ver histórico" no `NotificacoesPanel`. Coordenador+ tem dropdown "Filtrar por usuário" — qualquer membro da equipe. RLS role-aware.
- **D-12:** Rodapé de cada e-mail contém link "Gerenciar preferências" → `/me/preferencias` (internos) ou `/portal/preferencias` (clientes) com **token JWT assinado de curta duração** para auth deep-link (clica do e-mail e já abre logado). Compliance LGPD/CAN-SPAM. Implementação pode ser via Supabase `signInWithOtp` OU JWT custom — planner avalia (ver Claude's Discretion).

### Rate Limit & Quota

- **D-13:** Monitorar quota Resend nas duas dimensões: **diária (100)** e **mensal (3000)**. Thresholds: 80% = warning, 100% = hard drop.
- **D-14:** Comportamento ao atingir 100% (hard drop): novos e-mails marcados como `status='dropped_quota'` em `notificacoes_envios`, **sem envio**. Slack DM continua disparando normal. Reset automático no virar do dia/mês UTC (consulta `WHERE sent_at >= date_trunc(...)` — sem cron de reset). Sem queue, sem retry automático, sem fallback Slack automático.
- **D-15:** Warning UI quando >80% — visível **apenas a coordenador+** em `/adocao` (banner topo) e `/configuracoes` (card de status quota). Consultor não vê. Counter via query simples em `notificacoes_envios` (planner decide se cachear via TanStack Query 1min stale).

### Delivery Tracking & History

- **D-16:** **Configurar webhook Resend** → nova edge function `resend-webhook` recebe eventos e atualiza `notificacoes_envios.status`. Estados: `queued` (POST API Resend OK) → `delivered` → `opened` **OU** `bounced` **OU** `complained`. Endpoint protegido por `WEBHOOK_RESEND_SECRET` (Bearer + timing-safe compare, pattern existente).
- **D-17:** Histórico em `/me/notificacoes-historico` mostra últimos **30 dias**. Cada usuário vê o seu por default. Coordenador+ vê dropdown "Filtrar por usuário" para qualquer membro (debug operacional). RLS role-aware na consulta (pattern `is_at_least('coordenador')` da migration 029).
- **D-18:** Botão "Reenviar" **sempre visível** no histórico (todos os status: delivered, failed, bounced, dropped_quota). Conta no quota Resend. Própria pessoa pode reenviar pra si; coordenador+ pode reenviar para terceiros. Colunas de auditoria: `reenviado_por_id`, `reenviado_em` em `notificacoes_envios`. Sem rate-limit interno de re-envio (hard quota Resend já protege).
- **D-19:** Schema `notificacoes_envios` (migration **035**):
  - Colunas: `id uuid PK`, `perfil_id uuid FK perfis`, `tipo text CHECK IN (tarefa, cadencia, renovacao, indicacao)`, `entidade_id uuid NULL`, `entidade_tipo text NULL`, `canal text CHECK IN (email, slack)`, `subject text`, `status text CHECK IN (queued, delivered, opened, bounced, complained, dropped_quota, skipped_no_recipient, fallback_diretor, failed)`, `resend_id text NULL`, `slack_ts text NULL`, `error_msg text NULL`, `sent_at timestamptz default now()`, `delivered_at`, `opened_at`, `bounced_at`, `complained_at`, `reenviado_por_id uuid NULL`, `reenviado_em timestamptz NULL`, `dia date GENERATED ALWAYS AS (sent_at::date) STORED`.
  - **UNIQUE (perfil_id, tipo, entidade_id, canal, dia)** — idempotência (ON CONFLICT DO NOTHING).
  - RLS: `SELECT` próprio (perfil_id = auth.uid()) + coord+ vê todos via `is_at_least('coordenador')`.

### Architecture & Templates

- **D-20:** **Helper Deno compartilhado** em `supabase/functions/_shared/email.ts` exporta `sendEmail({ perfilId, tipo, entidadeId, payload, deepLink })`. Cada `notify-tarefa` / `notify-resumo-diario` / `notify-indicacao` / `notify-renovacao` importa e chama inline **após validar prefs**. **Reinterpreta EMAIL-02** "Edge function `notify-email`" como "lógica de e-mail centralizada via helper compartilhado" — sem round-trip HTTP extra entre funções.
- **D-21:** Idempotência via `notificacoes_envios` UNIQUE + `ON CONFLICT DO NOTHING`. Mesmo pattern existente em `notificacoes_renovacao_enviadas`. Cobre tanto trigger-driven (tarefa, indicação) quanto cron-driven (renovação, cadência).
- **D-22:** **4 templates HTML específicos por tipo** em `supabase/functions/_shared/templates/`: `tarefa.html`, `cadencia.html`, `renovacao.html`, `indicacao.html`. Cada um inline (sem MJML ou template engine), com placeholders `{{var}}` substituídos via simples `replace`. Layout base compartilhado: header (logo CONSEJ + cor primary) + título + corpo + CTA "Abrir no CRM" + footer (link "Gerenciar preferências" + assinatura CONSEJ). Subject e estrutura específicos por tipo.
- **D-23:** Migration **035** adiciona:
  - Coluna `perfis.preferencias_notif jsonb DEFAULT` com smart default
  - Tabela `notificacoes_envios` (schema D-19)
  - Atualização de `handle_new_user` trigger para aplicar smart default condicional ao `slack_user_id`
  - Atualização das policies RLS para a nova tabela
- **D-24:** Sender Resend = **`onboarding@resend.dev`** (default Resend) em dev e prod inicialmente. Migração para `notif@consej.com.br` registrada como tech-debt em STATE.md (bloqueada por credencial DNS via Andrieli).

### Claude's Discretion

- **Forma exata da rota `/me/preferencias`** — pode ser rota dedicada que set tab via state OU `/me?tab=notificacoes`, desde que bookmarkable e abra direto na tab Notificações. Planner decide.
- **Implementação do deep-link auth token** (D-12) — pode ser Supabase `signInWithOtp` (magic link nativo) OU JWT custom assinado com `SERVICE_ROLE_KEY`. Planner avalia trade-off de complexidade vs UX. **Downgrade aceitável para MVP:** link direto sem token (redirect após login com `?next=/me/preferencias`) se a abordagem com token ficar pesada demais.
- **Cor exata + assets visuais** dos 4 templates HTML — usar `--primary` do tema atual; copy do subject; espaçamento — design fica a critério do planner desde que: PT-BR, alta legibilidade, header + título + corpo + CTA + footer.
- **Paginação e filtros do histórico** — paginação ~50/página, filtros por tipo e por status são úteis mas não obrigatórios MVP.
- **Counter de quota: query direta vs cached** — recomendação: query simples em `notificacoes_envios` (count rows do dia/mês com `canal='email'` e `status NOT IN ('dropped_quota','skipped_no_recipient','fallback_diretor')`). TanStack Query com 1min stale time evita N+1.
- **Refactor oportunista** — mover `constantTimeAuthCheck` repetido nas 4 funções para `_shared/auth.ts`. Não obrigatório, mas reduz risco de drift quando adicionarmos `resend-webhook` com mesma necessidade.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 5 entry (goal, mode=mvp, success criteria, requirements EMAIL-01..04)
- `.planning/REQUIREMENTS.md` §EMAIL-01..04 — requirements completos. **Atenção às reinterpretações documentadas em D-03 (EMAIL-03) e D-20 (EMAIL-02)**.
- `.planning/STATE.md` — decisões registradas da v3.0, tech-debt do sender DNS (Andrieli), validated assumption do volume <30 emails/dia

### Codebase Maps
- `.planning/codebase/INTEGRATIONS.md` — Slack patterns, env vars já configuradas, webhook auth model (timingSafeEqual, Bearer)
- `.planning/codebase/STACK.md` — versões React/Vite/Supabase/Deno + bibliotecas disponíveis
- `.planning/codebase/ARCHITECTURE.md` — edge function topology, pg_cron patterns, layered architecture

### Existing Edge Functions (patterns to mirror)
- `supabase/functions/notify-tarefa/index.ts` — DM per-user, retry exponencial 3x, `conversations.open` + `chat.postMessage`, helpers `findSlackUserId`/`findPerfilName`, `constantTimeAuthCheck`. **Adicionar lookup `preferencias_notif` + chamada inline `sendEmail()` + supressão self-loop.**
- `supabase/functions/notify-resumo-diario/index.ts` — pattern cron-driven DM + payload schema. **Adicionar companion email.**
- `supabase/functions/notify-indicacao/index.ts` — channel broadcast + idempotency table `notificacoes_indicacao`. **Adicionar lookup do `leads.responsavel_id` (lead criado) + companion email per-user.**
- `supabase/functions/notify-renovacao/index.ts` — channel broadcast + cron pattern + Vault secret. **Adicionar lookup do `contratos.responsavel_id` + companion email per-user.**

### Migrations to reference
- `supabase/migrations/004_perfis.sql` + `030_perfis_slack_user_id.sql` — schema `perfis` (adicionar `preferencias_notif jsonb`)
- `supabase/migrations/011_auto_profile_trigger.sql` — trigger `handle_new_user` (atualizar com smart default condicional)
- `supabase/migrations/026_notificacoes_renovacao_enviadas.sql` — idempotency pattern (mirror para `notificacoes_envios`)
- `supabase/migrations/027_roles_internos.sql` + `029_rls_role_aware.sql` — role-aware RLS pattern + função SQL `is_at_least(role)`
- `supabase/migrations/031_cron_renovacoes.sql` — pg_cron + Vault secret pattern (referência para HTTP callout)
- Última migration confirmada: `032_lixeira_leads.sql`. **Migration 033/034 podem já existir** (notify-resumo-diario referencia 034 nos comments) — confirmar antes de numerar a nova como 035.

### Frontend reuse
- `src/pages/MeEspacoPage.tsx` — tabs structure (adicionar tab "Notificações")
- `src/components/me/PerfilPanel.tsx` — pattern de painel dentro de MeEspaco (referência para `NotificacoesPanel`)
- `src/components/ui/switch.tsx` — verificar se primitive shadcn Switch já existe (matriz precisa); adicionar via `npx shadcn@latest add switch` se ausente
- `src/router.tsx` — adicionar rotas `/me/preferencias`, `/me/notificacoes-historico`, `/portal/preferencias`
- `src/hooks/usePerfis.ts` — pattern de TanStack Query hook + mutation com optimistic update (referência para `usePreferenciasNotif`)
- `src/lib/query-keys.ts` — adicionar QUERY_KEYS `preferenciasNotif`, `notificacoesEnvios`
- `src/types/index.ts` — adicionar tipos `PreferenciasNotif`, `NotificacaoEnvio`, `CanalNotif`, `TipoNotif`
- `src/components/layout/Sidebar.tsx` — verificar se precisa adicionar item nav (provavelmente não — já tem Meu Espaço)
- `src/pages/portal/PortalLayout.tsx` — adicionar link nav para `/portal/preferencias`

### External docs
- Resend API — Send Email: https://resend.com/docs/api-reference/emails/send-email
- Resend Webhooks: https://resend.com/docs/dashboard/webhooks/introduction (eventos delivered/opened/bounced/complained)
- Resend Domains (futuro tech-debt): https://resend.com/docs/dashboard/domains/introduction
- Sender domain atual: `onboarding@resend.dev` (default Resend, 100/dia free)
- Domínio CONSEJ registrado no Resend: id `3b6472fc-b277-42ed-a22f-2dc41dab81d7` status `not_started` (DNS pending)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Notify functions (Slack)** — todas as 4 funções existentes seguem o mesmo template: env vars no topo, `constantTimeAuthCheck`, `supabase = createClient(URL, SERVICE_KEY)`, parsing do webhook payload, lookup de perfis, retry com backoff. Phase 5 estende cada uma com lookup de prefs + companion `sendEmail()`.
- **`src/hooks/usePerfis.ts`** — pattern canônico de TanStack Query hook com mutation + invalidação de QUERY_KEYS. Replicar pra criar `usePreferenciasNotif` e `useNotificacoesEnvios`.
- **`src/components/me/PerfilPanel.tsx`** — estrutura de painel/Card dentro de MeEspacoPage. Referência para `NotificacoesPanel`.
- **`src/components/ui/switch.tsx`** — verificar existência; provavelmente já instalado.
- **`src/components/ui/tabs.tsx`** — shadcn Tabs já em uso (MeEspacoPage tem 5 tabs).

### Established Patterns
- **Edge function auth**: `constantTimeAuthCheck(received, expected)` repetido em todas as notify-*. Phase 5 introduz `resend-webhook` que precisa do mesmo. Oportunidade de refactor para `_shared/auth.ts` (não obrigatório).
- **Migrations sequenciais e imutáveis**: nunca editar migration antiga; sempre adicionar nova. Migration 035 esperada (confirmar último número aplicado).
- **RLS role-aware**: usar `is_at_least(role)` da migration 029 nas policies de `notificacoes_envios`.
- **TanStack Query**: hooks em `src/hooks/`, QUERY_KEYS centralizadas em `src/lib/query-keys.ts`, mutations com `onSuccess` invalidando + `toast.success`/`toast.error` (sonner).
- **Tipos centralizados** em `src/types/index.ts` — não duplicar interfaces de domínio.
- **Idempotência por tabela dedicada**: pattern de `notificacoes_renovacao_enviadas` (migration 026) — replicar em `notificacoes_envios` via UNIQUE constraint.
- **Configurações em registro único** (`configuracoes.id='default'`) — não necessário para Phase 5 (prefs ficam em `perfis`, quota é derivada).
- **Vault para secrets de cron**: `supabase/migrations/031_cron_renovacoes.sql` — não necessário aqui (sem cron novo).

### Integration Points
- **MeEspacoPage** (`src/pages/MeEspacoPage.tsx`): adicionar tab "Notificações" entre Perfil e VisaoGeral (ordem a definir).
- **PortalLayout** (`src/pages/portal/PortalLayout.tsx`): adicionar link nav para `/portal/preferencias`.
- **Router** (`src/router.tsx`): adicionar 3 rotas (`/me/preferencias`, `/me/notificacoes-historico`, `/portal/preferencias`).
- **Trigger `handle_new_user`** (migration 011): atualizar para popular `preferencias_notif` com smart default ao criar perfil.
- **Edge function deploy**: `supabase functions deploy notify-tarefa notify-resumo-diario notify-indicacao notify-renovacao resend-webhook` após mudanças.
- **Supabase Database Webhook**: configurar novo webhook chamando `resend-webhook` — não, **é Resend chamando nosso endpoint** (webhook configurado no Resend Dashboard apontando para `{SUPABASE}/functions/v1/resend-webhook`).
- **AppLayout / ConfiguracoesPage**: banner/card de warning quota (visível só coord+ via `RequireRole`).

</code_context>

<specifics>
## Specific Ideas

- **Templates HTML específicos por tipo** — usuário escolheu polish acima da simplicidade. Layout base compartilhado mas conteúdo customizado. Use cor primary do tema CONSEJ, header com logo, CTA destacado "Abrir no CRM" linkando direto pra entidade (lead/cliente/contrato).
- **Rodapé com deep-link auth** — clica do email, abre já logado na tab Notificações. Token JWT assinado curto (5-15 min). Compliance + UX de gerenciar prefs sem refazer login.
- **Cria UI de `/portal/preferencias` mesmo sem notif ativa ainda** — Phase 5 prepara o terreno; Phase 7 plugará as notifs reais de aprovação de documento.
- **Fallback diretor quando responsavel_id NULL** — todos os perfis `role='diretor'` recebem. Se houver 2+ diretores, todos recebem (não tem priorização).
- **Reinterpretações de REQUIREMENTS documentadas explicitamente** (D-03, D-20) para evitar conflito downstream.

</specifics>

<deferred>
## Deferred Ideas

Capturadas mas fora desta phase:

- **Templates HTML visualmente ricos** (MJML, React-Email) — v2 do milestone, já em REQUIREMENTS.md
- **Push notifications agrupadas por janela** — Phase 6 (PWA + Push)
- **Cliente comentar inline em propostas** — Phase 7
- **Comparação relatórios entre períodos** — Phase 8
- **AI gerando subject/body de emails** — fora de scope (viola zero-custo, já em REQUIREMENTS out-of-scope)
- **Master "modo digest" (1 email diário consolidado)** vs tempo-real — não escolhido (usuário preferiu granularidade)
- **Notificar antigo + novo responsável durante hand-off** — descartado (D-07)
- **Auto-pause / fallback automático Slack quando >90% quota** — descartado (D-14)
- **Rate-limit interno de re-envio** — descartado (hard quota Resend protege)
- **Queue + retry no dia seguinte** ao atingir hard limit Resend — descartado (drop+log é suficiente pra MVP)
- **Página separada `/notificacoes-admin`** para coord+ — descartado (filtro dropdown na mesma página é simpler — D-17)
- **Webhook Resend só pra bounced/complained** (compliance mínimo) — descartado (tracking completo é gratuito e útil)

</deferred>

---

*Phase: 05-multi-channel-notifications-email*
*Context gathered: 2026-05-27 via /gsd-discuss-phase 5*
