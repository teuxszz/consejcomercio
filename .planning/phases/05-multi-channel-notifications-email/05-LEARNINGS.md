---
phase: 5
phase_name: "multi-channel-notifications-email"
project: "CONSEJ CRM v2"
generated: "2026-05-27"
counts:
  decisions: 14
  lessons: 9
  patterns: 8
  surprises: 7
missing_artifacts:
  - "05-VERIFICATION.md"
  - "05-UAT.md"
---

# Phase 5 Learnings: Multi-Channel Notifications (Email)

## Decisions

### D-01: Modelo híbrido (canal Slack + per-user)

Renovação e indicação mantêm broadcast Slack para o canal `#leads-consej` e ADICIONAM companion email per-user pro responsável da entidade. Tarefa e cadência (já per-user via DM) ganham companion email.

**Rationale:** preserva o "FYI coletivo" que a equipe já usa no Slack e ao mesmo tempo garante que consultor sem Slack ainda receba notificação. Convertendo tudo pra per-user perderia visibilidade que já estava funcionando.
**Source:** 05-CONTEXT.md (D-01), 05-DISCUSSION-LOG.md

### D-04: Smart default condicional ao slack_user_id

Trigger `handle_new_user` aplica default `{ "tarefa": {"slack": <has_slack>, "email": true}, ...}` onde `has_slack = (slack_user_id IS NOT NULL)`. Email sempre ON; Slack ON só se mapeamento existe.

**Rationale:** ninguém perde notif no onboarding (email é universal), e quem tem Slack mapeado mantém comportamento atual sem precisar configurar nada.
**Source:** 05-01-SUMMARY.md, supabase/migrations/035_notificacoes_envios.sql §8

### D-19: Schema notificacoes_envios com UNIQUE parcial WHERE reenviado_por_id IS NULL

Idempotência via `UNIQUE (perfil_id, tipo, canal, dia, COALESCE(entidade_id, '00…000'::uuid)) WHERE reenviado_por_id IS NULL`. Reenvios ficam **fora** do índice (sempre criam linha — audit trail).

**Rationale:** trigger ou cron pode refirar e bater ON CONFLICT (boa idempotência) mas reenvio manual via UI deve sempre INSERTar nova linha (auditoria de quem reenviou quando). Partial index resolve os dois casos sem trade-off.
**Source:** 05-01-SUMMARY.md, supabase/migrations/035_notificacoes_envios.sql §3

### D-20: Helper Deno compartilhado inline (reinterpreta EMAIL-02)

REQUIREMENT EMAIL-02 falava em "edge function `notify-email`" mas o user aprovou reinterpretação: helper `supabase/functions/_shared/email.ts` importado inline em cada notify-*. Zero round-trip HTTP entre funções.

**Rationale:** evita latency + invocation count Resend free tier (Supabase Edge Functions também tem quota). Single source of truth pra logic de envio.
**Source:** 05-CONTEXT.md (D-20), 05-01-SUMMARY.md, 05-02-SUMMARY.md

### D-23: 4 templates HTML específicos por tipo

`tarefa.html.ts`, `cadencia.html.ts`, `renovacao.html.ts`, `indicacao.html.ts` — cada um com subject/body custom mas layout base compartilhado (header CONSEJ + título + corpo + CTA + footer).

**Rationale:** usuário escolheu polish acima de simplicidade. Templates 100% inline (sem MJML) mantêm bundle pequeno em Deno; layout base compartilhado via helper `render.ts`.
**Source:** 05-CONTEXT.md (D-23), 05-02-SUMMARY.md

### Helper Slack com token como parâmetro explícito (divergência do original)

`_shared/slack.ts` recebe `token` como parâmetro em `openDmChannel(token, ...)` e `postDm(token, ...)`, NÃO como closure sobre `Deno.env.get('SLACK_BOT_TOKEN')` como nas funções originais.

**Rationale:** portabilidade testável (mocks injetam token); caller controla qual token usar (futuro multi-tenant).
**Source:** 05-02-SUMMARY.md

### STATUS_RANK monotonic enforcement no resend-webhook

Webhook recebe eventos em qualquer ordem (delivered/opened podem chegar fora de sequência). Ranking: `queued=0, delivered=1, opened=2, bounced=2, complained=2, failed=2`. UPDATE só aplica se `new_rank >= current_rank`.

**Rationale:** race condition real (delivered chega depois de opened) faria status regredir e o histórico mentiria. Monotonic enforcement é a correção mínima.
**Source:** 05-02-SUMMARY.md (Pitfall 2)

### Dedup natural via UPDATE idempotente — sem tabela auxiliar

`svix-id` repetido (Resend retry) resulta em mesmo UPDATE no mesmo `resend_id` → mesmo status → no-op. Não precisamos de `webhook_resend_eventos` table.

**Rationale:** evita migration extra; UPDATE idempotente é grátis no SQL e dedup naturalmente.
**Source:** 05-02-SUMMARY.md (Pitfall 3)

### Edge function reenviar-notificacao com dual-client pattern

`supabaseUser` (JWT do user) faz o SELECT inicial → RLS faz o gate (consultor vê só próprias; coord+ vê todas). Após RLS aprovar, `supabaseAdmin` (service-role) faz o INSERT/UPDATE.

**Rationale:** INSERT em `notificacoes_envios` é service-role-only por design (R6 — só edge functions escrevem). Mas precisamos do JWT pra autorizar o caller. Dual-client cumpre os dois.
**Source:** 05-03-SUMMARY.md

### Switch primitive criado manualmente sem CLI

shadcn CLI é interativo no Windows e bloqueou o agente. Usuário aprovou criação manual de `src/components/ui/switch.tsx` seguindo o pattern oficial (wrap `@radix-ui/react-switch` que já estava no package.json).

**Rationale:** evita gate humano + 5min de CLI; arquivo é mecânico (~30 linhas). Mesmo resultado.
**Source:** 05-03-SUMMARY.md, conversa do orchestrator

### Optimistic update em useSalvarPrefs

Hook `useSalvarPrefs` faz optimistic update do JSONB inteiro (matriz 4×2 como um objeto), com rollback no `onError`.

**Rationale:** togglar 8 switches rapidamente fica responsivo. RLS pode recusar (raro pra própria coluna) — rollback garante UI consistente.
**Source:** 05-03-SUMMARY.md

### Reenvio NÃO faz re-render fiel — wrapper genérico HTML

`reenviar-notificacao` usa HTML wrapper genérico (subject original + "Abrir no CRM" + footer "Gerenciar preferências") em vez de re-renderizar o template específico por tipo.

**Rationale:** re-render fiel exigiria carregar entidade + ressurfacear vars (lead/contrato/etc.) o que aumenta superfície de erro num caminho cuja UI já mostra o que foi reenviado. MVP > fidelidade.
**Source:** 05-03-SUMMARY.md

### D-10: Portal placeholder sem persistência

`/portal/preferencias` ganhou Switch desabilitado + copy "Disponível em Phase 7" — sem hook, sem mutation, sem persistência.

**Rationale:** Phase 5 não dispara nenhuma notif ao cliente; persistir prefs agora exigiria migration desnecessária. Phase 7 (Portal Docs) plugará o disparo real.
**Source:** 05-CONTEXT.md (D-10), 05-04-SUMMARY.md

### Sender domain = onboarding@resend.dev (D-24)

Manter sandbox Resend mesmo em produção. Migração para `notif@consej.com.br` registrada como tech-debt aguardando credencial DNS via Andrieli.

**Rationale:** zero custo; DNS está fora do nosso controle imediato; smoke test validou que sandbox funciona para destinatários pré-cadastrados na Audience.
**Source:** 05-CONTEXT.md (D-24), 05-RESEARCH.md (R1)

---

## Lessons

### `supabase db push` falha com cli_login_postgres bug

CLI v2.101.0 tenta rotacionar role temporária `cli_login_postgres` para cada push, mas o DB user do projeto não tem `CREATEROLE`. Resultado: `42501: permission denied to alter role`.

**Context:** descoberto ao tentar aplicar migration 035 pela primeira vez. Bloqueou Plan 1 Task 5 inteiro.
**Workaround documentado:** setar `SUPABASE_DB_PASSWORD` env var (vem do Dashboard) → `setx SUPABASE_DB_PASSWORD "..."` ou `supabase db push -p "..."`. **Fallback usado:** aplicar via Supabase Studio SQL Editor.
**Source:** orchestrator conversation, .planning/STATE.md (Tech Debt table)

### GENERATED column em Postgres rejeita cast timestamptz → date direto

`dia date GENERATED ALWAYS AS (sent_at::date) STORED` falha com `42P17: generation expression is not immutable` porque cast direto depende de `TimeZone` session var.

**Context:** descoberto rodando migration 035 no Studio (depois do CLI workaround). Fix mecânico em ~3 minutos: substituir por `((timezone('UTC', sent_at))::date)` que É immutable.
**Source:** orchestrator conversation, commit `32af69b`, supabase/migrations/035_notificacoes_envios.sql §2 (linha do `dia`)

### `cadencia.test.ts` estava quebrando build há semanas sem ninguém notar

`tsc -b` falhava em `as InteracaoLead` cast porque o type `InteracaoLead` foi extendido (4 propriedades novas: `stage_msg`, `setor`, `variacao_idx`, `corpo`) mas o test fixture não acompanhou. `npm test` (vitest) passava porque vitest não checa types.

**Context:** descoberto fazendo build verification depois do Plan 03. Build estava quebrando em produção (Vercel) há ~7h sem ninguém notar.
**Fix:** trocar `as InteracaoLead` por `as unknown as InteracaoLead` (bypass strict cast TS 5.9).
**Source:** Vercel screenshots, commit `790e867`

### shadcn CLI é interativo no Windows — não há flag pra suprimir prompts

`npx shadcn@latest add switch` requer prompts de estilo/baseColor/overwrite. Agente em worktree não consegue dirigir CLI interativo.

**Context:** descoberto no Plan 03 Task 1. Pausou o executor.
**Alternativa que funciona:** criar o arquivo manualmente (~30 linhas, pattern oficial). Mesmo resultado, sem CLI.
**Source:** orchestrator conversation, 05-03-SUMMARY.md

### onboarding@resend.dev é sandbox restrito

Resend só entrega pra emails pré-cadastrados na Audience da conta. Sem pre-cadastro, retorna **403 silencioso** (não 400) — error fica embaixo do radar.

**Context:** R1 do RESEARCH antecipou; usuário pre-cadastrou antes do deploy. Smoke test E2E confirmou entrega.
**Recomendação:** pra qualquer feature nova que envie email, listar destinatários e garantir Audience updated **antes** do deploy. Quando migrar pra `notif@consej.com.br` (DNS verified), essa restrição cai.
**Source:** 05-RESEARCH.md (R1), 05-01-SUMMARY.md (Task 4 checkpoint)

### Vercel não rebuilda automaticamente sem push

35 commits locais não tinham sido pushed pro origin/main. Vercel ficou stuck no commit antigo (`23310c1`) e errou em todos os builds porque puxava o `cadencia.test.ts` velho.

**Context:** descoberto via screenshots do Vercel mostrando "Error" há 7h. `git push origin main` resolveu — Vercel detectou em <30s, rebuilda passou.
**Source:** Vercel screenshots, orchestrator conversation

### Worktree agent nasce em commit antigo (não em main HEAD)

Cada agent worktree spawn começa em algum commit antigo (do momento que a `.git` foi inicializada com worktrees). Não vê PLAN/CONTEXT recém-criados.

**Context:** consistente em todos os 4 plans desta phase. Agent precisava de `git merge main --no-edit` no início pra acessar planning artifacts.
**Workaround:** instrução explícita no prompt do executor pra fazer merge se base atrasada.
**Source:** todos os 4 SUMMARYs, orchestrator conversation

### Radix Switch usa pointer events que jsdom não simula

Test `NotificacoesPanel.test.tsx` quebrou ao tentar clicar Switch real. Pointer events do Radix não são suportados consistentemente em jsdom.

**Context:** descoberto em vitest run do Plan 03 Task 3.
**Fix:** mock global do Switch para `<button role='switch' />` simples preservando interface pública (`checked`, `onCheckedChange`, `aria-label`).
**Source:** 05-03-SUMMARY.md

### useEffect com dep `objeto` re-fire entre renders — usar `objeto?.id` (string)

`useEffect(...)` com `[perfil]` (objeto) refazia reset espúrio do form quando perfil era re-criado entre re-renders. Trocando pra `[perfil?.id]` (string estável) resolveu.

**Context:** descoberto via teste que falhava intermitentemente.
**Source:** 05-03-SUMMARY.md (Rule 1 do executor decision log)

---

## Patterns

### Helper Deno compartilhado em `_shared/` deduplica edge functions

`_shared/{auth,perfis,email,slack,templates/*}` extraídos das 4 funções notify-* originais. `constantTimeAuthCheck`, `findSlackUserId`, `findPerfilName`, `openDmChannel`, `postDm` eram copy-paste 4×.

**When to use:** sempre que 2+ edge functions tiverem mesmo helper copiado. Refactor oportunista quando estiver tocando as funções de qualquer forma — agrupa o overhead.
**Source:** 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-PATTERNS.md

### Wave-by-wave execution com checkpoints humanos

4 plans em 4 waves, cada uma com seu próprio checkpoint humano (R1, webhook+secret, shadcn install, deploy reenviar). Agentes pausam predictably; orchestrator handles transição.

**When to use:** features grandes (>2 plans) com integrações externas. Checkpoints permitem human oversight em pontos críticos sem destruir momentum.
**Source:** orchestrator conversation, todos os 4 SUMMARYs

### Worktree isolation + fast-forward merge

Cada plan em worktree próprio (`worktree-agent-*`). Após executor return, orchestrator faz `git merge --ff-only` no main. Zero merge conflicts em 4 plans.

**When to use:** plans independentes ou sequenciais com base estável. Quando há overlap em files_modified em wave paralela, force sequential (executor faz isso automaticamente).
**Source:** orchestrator conversation

### Edge function dual-client (JWT + admin)

Para edge functions que precisam de RLS gate mas escrevem em tabela service-role-only: `supabaseUser` (cria com `Authorization: Bearer <jwt>` do request) faz o SELECT inicial → RLS gate; após autorizar, `supabaseAdmin` (service-role) faz INSERT/UPDATE.

**When to use:** qualquer edge function que recebe ação autorizada de usuário (reenviar, aprovar, etc.) mas escreve em tabela cujas writes só edge functions podem fazer.
**Source:** 05-03-SUMMARY.md (reenviar-notificacao)

### Matriz UI 4×2 com PATCH atômico (coluna JSONB inteira)

`useSalvarPrefs` faz `UPDATE perfis SET preferencias_notif = <objeto inteiro>` em vez de UPDATE granular por chave. Coluna JSONB é re-substituída inteira, mesmo que só 1 switch mudou.

**When to use:** UI multi-toggle (preferências, configs estruturados) onde a coluna toda é o "estado atômico". Evita race conditions de partial updates concorrentes.
**Source:** 05-03-SUMMARY.md (D-08 atomicidade)

### Optimistic update + rollback no onError

Mutation otimista: aplica estado novo no cache antes da resposta do server. Se erro: rollback via `context.previous`. Padrão TanStack Query padrão usado em useSalvarPrefs, useUpdateLeadStatus, etc.

**When to use:** UI onde o user precisa de feedback imediato e a mutation tem alta probabilidade de sucesso (RLS pre-validado, dados próprios, etc.).
**Source:** 05-03-SUMMARY.md, src/hooks/usePerfis.ts (analog)

### Render extension pattern: 1 helper central + N templates específicos

`_shared/templates/render.ts` exporta 4 funções (`renderTarefa`, `renderCadencia`, `renderRenovacao`, `renderIndicacao`), cada uma carregando seu HTML template específico + substituindo placeholders. Helper compartilha `escapeHtml` + estrutura de wrapping comum.

**When to use:** quando você precisa de N variações de output que compartilham estrutura mas diferem em conteúdo. Mantém DRY sem perder customização.
**Source:** 05-02-SUMMARY.md

### Schema sequencial imutável + IF NOT EXISTS

Migrations numbered (035, 036, ...) nunca editadas após apply. Mas usam `IF NOT EXISTS` em CREATE statements para re-run safety se um migration parcialmente aplicada precisar ser retentada.

**When to use:** schema migrations em Supabase com risco de aplicação parcial (CLI bug, network interrupt, etc.). IF NOT EXISTS não muda schema fingerprint mas dá idempotência operacional.
**Source:** supabase/migrations/035_notificacoes_envios.sql §2

---

## Surprises

### CLI Supabase tem bug significativo que silenciosamente bloqueia push

Esperava que `supabase db push` simplesmente funcionasse. Falhou com erro de role permission que não dá indicação clara da causa — só `permission denied to alter role cli_login_postgres`.

**Impact:** ~30 min de diagnóstico + decisão de aplicar via Studio. Forçou criação de tech-debt no STATE.md.
**Source:** orchestrator conversation, .planning/STATE.md (Tech Debt)

### Build quebrado há semanas sem ninguém notar

Pré-existente: `cadencia.test.ts` quebrou em algum momento entre Phase 4 e Phase 5 quando `InteracaoLead` type foi extendido. Vercel acumulou ~7h de erros antes da descoberta visual via screenshot.

**Impact:** descoberta acidental — sem isso, mais commits sem deploy. Reforçou necessidade de monitor Vercel + considerar `npm run build` como pre-commit hook ou CI check.
**Source:** Vercel screenshots, orchestrator conversation

### API overload duas vezes durante research/planner spawns

Primeira tentativa do research-phase deu `OverloadedError` após 5min de execução. Segunda tentativa com prompt mais enxuto funcionou.

**Impact:** custos de tempo (~5min perdidos) mas trabalho zero perdido. Lição: prompts grandes para agentes spawned têm risco de overload.
**Source:** orchestrator conversation

### Agente pausando em CLI interativo é checkpoint legítimo

shadcn CLI bloqueou o Plan 03 Task 1 antes de qualquer commit. Expected behavior — não há fix automático pra CLI interativo no Windows.

**Impact:** alternativa manual (criar arquivo) economizou 5min e desbloqueou o resto do plan imediatamente.
**Source:** 05-03-SUMMARY.md, orchestrator conversation

### Webhook Resend funcionou first-try

HMAC svix manual (sem package), STATUS_RANK monotonic, dedup natural via UPDATE idempotente — tudo convergiu sem race conditions observadas em smoke test. Esperava pelo menos 1 bug de borda.

**Impact:** Wave 2 fechou sem retrabalho. Confirmação de que research detalhado (R1, Q2) pagou no executor.
**Source:** 05-02-SUMMARY.md, smoke test no Resend Dashboard

### Worktree branch nascendo em commit antigo

Cada worktree agent começa em algum commit pre-Phase-5 (provavelmente `23310c1`). Não vê PLAN/CONTEXT recém-criados em main. Cada plan precisou de `git merge main --no-edit` pra ter contexto.

**Impact:** zero (todos os agents fizeram o merge corretamente), mas é overhead repetido. Pode ser otimização do GSD: spawn worktree apontando pro current main HEAD.
**Source:** todos os 4 SUMMARYs

### Smoke test E2E funcionou first-try após Phase 5 deploy

Cadeia inteira (tarefa atribuída → trigger DB → notify-tarefa → sendEmail helper → Resend API → webhook → status update → UI histórico) funcionou na primeira tarefa real criada pelo CRM. Email entregue em <30s.

**Impact:** confirmação direta do milestone. Validação ponta-a-ponta sem retrabalho.
**Source:** conversa "o email funcionou", smoke test manual
