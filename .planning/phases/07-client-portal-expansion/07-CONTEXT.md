# Phase 7: Client Portal Expansion - Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** MVP (vertical slice — ROADMAP `**Mode:** mvp`)

<domain>
## Phase Boundary

Adicionar **fluxo bidirecional de documentos** entre cliente e CONSEJ, fechando o loop pós-venda dentro do CRM sem WhatsApp/email manual:

1. **Cliente sobe documentos** solicitados (RG, CNPJ, comprovantes) via drag-and-drop em `/portal/documentos`.
2. **Consultor sobe propostas/contratos/relatórios** na ficha do cliente (`/clientes/:id/docs`).
3. **Quando consultor marca "Pedir aprovação"** no upload, o cliente vê botões Aprovar / Solicitar Revisão no portal. Resposta dispara notificação multi-canal ao consultor (Phase 5+6).
4. **Histórico de versões** preserva v1 + v2 quando cliente pede revisão e consultor sobe nova versão.
5. **Dashboard `/portal-admin/aprovacoes-pendentes`** lista docs aguardando >N dias (N configurável). Botão "Reenviar lembrete" dispara email + push pro cliente.

**Multi-canal extension:** adiciona 5º tipo `documentos` em `preferencias_notif`. Matriz `NotificacoesPanel` evolui de 4×3 (Phase 6) para **5×3** (5 tipos × 3 canais).

**Storage:** novo bucket Supabase `cliente-docs` (free tier 1GB). RLS isola por cliente. Path scheme `{cliente_id}/{doc_id}.{ext}`. Whitelist MIME + max 10MB por arquivo.

**Out of scope (delegado p/ phases futuras ou v2):** versionamento com diff lado-a-lado; assinatura digital criptográfica (Apenas botão "aprovo" — vai virar requirement próprio se necessário); comentários inline em pontos específicos do PDF; OCR/extração de texto; integração com DocuSign/ClickSign; hard cap por cliente (sem limite per-cliente; só monitora total); preview avançado (sem inline PDF viewer — apenas download com signed URL).

</domain>

<decisions>
## Implementation Decisions

### Approval Flow & Versioning

- **D-01:** **Aprovação configurável por upload** — consultor marca checkbox `Pedir aprovação` ao subir cada doc. Reinterpretação de PORTAL-03 ("aprovar em proposta") como "aprovar em qualquer doc que consultor marcou como requer_aprovacao=true". Tags (proposta/contrato/relatorio/outro) ficam como rótulo informativo, **não** como gate de fluxo. Cliente nunca pode marcar o próprio upload como requer_aprovacao (cliente não aprova próprio doc).
- **D-02:** **Histórico de versões preservado** — schema com colunas `versao integer DEFAULT 1` + `parent_doc_id uuid REFERENCES cliente_docs(id)`. Quando cliente pede revisão e consultor sobe v2, v1 fica com `status='superseded'`, v2 fica `status='pending'` com `parent_doc_id=v1.id`. UI: badge "v2 (atual)" + dropdown "Ver versões anteriores" (timeline inline). Cliente ainda pode aprovar/rejeitar apenas a versão atual.
- **D-03:** **Bidirecional (cliente + consultor sobem)**. Cliente sobe pelo `/portal/documentos` (drag-and-drop). Consultor sobe pelo `/clientes/:id/docs` (tab nova). `cliente_docs.autor_id` aponta para `perfis.id` de quem subiu; `autor_tipo` text CHECK IN ('interno','cliente'). Uploads do cliente nunca recebem botões de aprovação (já assume "documento entregue"). Uploads de consultor recebem botões SE `requer_aprovacao=true`.

### Storage Policy

- **D-04:** Bucket Supabase `cliente-docs` (privado — sem public read). Path scheme: `{cliente_id}/{doc_id}.{ext}` onde `doc_id` = uuid da row em `cliente_docs`. Nome original guardado em `cliente_docs.nome_arquivo`. Download via signed URL com expiry 60min (gerado on-demand pela edge function ou client-side com auth). **Bucket RLS** isola por cliente_id (Phase 5/6 pattern — política `cliente_id IN (SELECT id FROM clientes WHERE responsavel_id = auth.uid())` para internos; `cliente_id = (SELECT cliente_id FROM perfis WHERE id = auth.uid())` para clientes — perfis.cliente_id precisa existir, validar na implementação).
- **D-05:** **MIME whitelist + 10MB max**:
  - Permitidos: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (docx), `application/msword` (doc), `application/vnd.oasis.opendocument.text` (odt), `image/jpeg`, `image/png`, `image/webp`
  - Bloqueados: executables, ZIP, scripts, vídeo
  - Validação **frontend** (input accept + size check) + **backend** (RLS policy de tamanho + edge function `validate-upload` opcional para MIME sniffing real, não apenas extensão)
- **D-06:** **Sem hard cap per-cliente** — monitora **total do bucket**. Card em `/portal-admin` mostra uso (ex: `142 MB / 1024 MB`). Banner warning visível **só a coord+** quando > 80% (~820 MB). Cron diário OU query on-demand para calcular. CONSEJ tem ~20 clientes × ~50MB média = 1GB cabe folgado por anos.

### Notification Triggers

- **D-07:** 4 eventos disparam notificação multi-canal (helper pattern Phase 5 D-20 + Phase 6 D-05):
  - (a) **Cliente aprovou doc** → notif pro consultor responsável pelo cliente (`clientes.responsavel_id`)
  - (b) **Cliente pediu revisão** → notif pro consultor responsável (com `comentario_cliente` no payload)
  - (c) **Cliente subiu doc no portal** → notif pro consultor responsável ("Cliente subiu RG.pdf")
  - (d) **5+ dias sem resposta em aprovação pendente** → notif pro consultor (recovery sinal — não dispara para o cliente automaticamente)
- **D-08:** Em `preferencias_notif`, **tipo único `documentos`** cobrindo todos os 4 eventos acima. Schema migration 037 estende default JSONB + trigger `handle_new_user` + backfill com `documentos: { slack: <conditional>, email: true, push: false }`. Matriz `NotificacoesPanel` cresce de 4×3 (12 switches) para **5×3 (15 switches)**.
- **D-09:** Helper compartilhado `supabase/functions/_shared/aprovacoes.ts` (pattern espelha `_shared/email.ts` / `_shared/push.ts`). Cada trigger dispara `sendNotificacaoAprovacao({ perfilId, evento, docId, payload })` que chama `sendEmail + sendSlack + sendPush` em paralelo via `Promise.allSettled`. **Reinterpreta PORTAL-03** "Notificação dispara para o consultor" como helper compartilhado, não edge function dedicada — mesma justificativa do D-20 Phase 5 / D-05 Phase 6.
- **D-10:** Eventos (a)(b)(c) são **trigger-driven** (Postgres trigger em UPDATE/INSERT de `cliente_docs.status` ou row INSERT chama edge function). Evento (d) **5-day stale** é **cron-driven** — nova edge function `notify-aprovacoes-stale` agendada via pg_cron (pattern do `notify-resumo-diario` Phase 5).

### Dashboard `/portal-admin/aprovacoes-pendentes`

- **D-11:** **Acesso role-aware** — coord+ vê **todas** as aprovações pendentes; consultor vê **apenas** docs de clientes onde `clientes.responsavel_id = auth.uid()`. RLS na query (pattern Phase 5 `is_at_least('coordenador')`). UI: tabela com colunas Cliente, Doc (nome+tag+versão), Enviado em, Dias parados, Consultor responsável, Ação (Reenviar lembrete).
- **D-12:** Botão **"Reenviar lembrete"** dispara `email + push para o cliente` (Slack OFF — cliente não tem Slack). Implementação: nova entrada na timeline do doc registrando `lembrete_enviado_por: <perfil_id>`, `lembrete_enviado_em: timestamp`. Coordenador+ pode reenviar quantas vezes quiser (sem cooldown nesta MVP — adicionar se virar spam na prática). Timeline impede acidente de spam imediato — botão fica disabled por 1h após último lembrete via cliente-side timer (visual only — backend não bloqueia).
- **D-13:** **Threshold "5+ dias" configurável** via `configuracoes.dias_para_aprovacao_pendente` (default `5`). UI em `/configuracoes` permite coord+ ajustar. Pattern já estabelecido (metas, prefs gerais). Cron `notify-aprovacoes-stale` lê esse valor antes de filtrar.

### Schema Extensions

- **D-14:** **Migration 037** (`037_cliente_docs.sql`):
  - Cria tabela `cliente_docs` (id uuid PK, cliente_id uuid FK, autor_id uuid FK perfis, autor_tipo text CHECK IN ('interno','cliente'), tag text CHECK IN ('proposta','contrato','relatorio','outro'), nome_arquivo text, mime_type text, tamanho_bytes integer, storage_path text, versao integer DEFAULT 1, parent_doc_id uuid REFERENCES cliente_docs(id), requer_aprovacao boolean DEFAULT false, status text CHECK IN ('pending','aprovado','revisao_solicitada','superseded') NULL, comentario_cliente text, created_at timestamptz DEFAULT now(), deleted_at timestamptz NULL).
  - RLS 4 policies (SELECT/INSERT/UPDATE/DELETE) com escopo:
    - Cliente vê só docs do próprio cliente_id (via `perfis.cliente_id`).
    - Interno: consultor vê só dos seus clientes (`responsavel_id=auth.uid()`); coord+ vê todos (`is_at_least('coordenador')`).
  - `preferencias_notif` JSONB: adiciona `documentos: { slack, email, push }` no default + trigger `handle_new_user` + backfill — pattern idêntico Migration 036.
  - `configuracoes` UPDATE adicionando `dias_para_aprovacao_pendente integer DEFAULT 5` no JSONB (configuracoes.id='default').
  - **Storage bucket criação** — não vai na migration SQL (RLS de Storage exige API CLI ou Dashboard). Bucket `cliente-docs` criado via `supabase storage buckets create cliente-docs --public false` durante execução do plan + policies aplicadas via Dashboard SQL.
- **D-15:** **`storage.objects` RLS policies** (via Dashboard SQL Editor — fora da migration sequencial):
  - SELECT: cliente vê só onde `(storage.foldername(name))[1] = (SELECT cliente_id::text FROM perfis WHERE id = auth.uid())`. Interno consultor: dos seus clientes. Coord+: todos.
  - INSERT: cliente sobe só na própria pasta; interno em qualquer pasta de cliente onde tem RLS (responsavel ou coord+).
  - DELETE: apenas via service_role (edge function `delete-cliente-doc` para auditoria) — RLS DENY pra usuários comuns.

### Type System Extensions

- **D-16:** `src/types/index.ts`:
  - `TipoNotif` = `'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'` (adicionar `'documentos'`)
  - `PreferenciasNotif` ganha `documentos: { slack: boolean; email: boolean; push: boolean }`
  - Novo `ClienteDoc` interface (id, cliente_id, autor_id, autor_tipo, tag, nome_arquivo, mime_type, tamanho_bytes, storage_path, versao, parent_doc_id, requer_aprovacao, status, comentario_cliente, created_at, deleted_at)
  - Novo `AutorDoc` = `'interno' | 'cliente'`
  - Novo `TagDoc` = `'proposta' | 'contrato' | 'relatorio' | 'outro'`
  - Novo `StatusDoc` = `'pending' | 'aprovado' | 'revisao_solicitada' | 'superseded' | null`

### Claude's Discretion

- **Forma exata da signed URL** (D-04) — Supabase `.createSignedUrl(path, expiresIn)` é o pattern. Edge function vs client-side com auth: planner decide. Recomendação: client-side com expiry 60min (mais simples, sem round-trip extra).
- **MIME sniffing real vs extensão only** (D-05) — extensão check no frontend é trivial. Backend MIME sniffing exige edge function `validate-upload` que lê primeiros bytes. Recomendação: extensão + frontend MIME (HTML5 file.type) só na MVP; sniffing real fica como tech-debt se virar problema.
- **Forma exata da query "uso total bucket"** (D-06) — Supabase tem `storage.buckets` mas não query trivial de tamanho. Opções: (a) cron diário que soma `octet_length` via SQL, (b) função SQL que faz `SUM(metadata->>'size'::bigint)` em `storage.objects`, (c) `pg_size` query. Planner decide.
- **Cooldown lembrete** (D-12) — 1h sugerido inline (visual disabled), não enforced backend. Se virar problema, adicionar rate-limit real.
- **Timeline UI do doc** (D-12) — modal? expand inline? side drawer? Planner decide. Pattern análogo: `ActivityTimeline` (`src/components/shared/ActivityTimeline.tsx`) já em uso (Phase 1/2).
- **Soft delete vs hard delete** (D-14 `deleted_at`) — soft delete coerente com `leads_lixeira` (Phase 4). RPC `excluir_cliente_doc` SECURITY DEFINER serializando em JSONB + tabela `cliente_docs_lixeira` se quiser história. Planner avalia se vale o custo MVP.
- **Tab order em ClienteDetailPage** — adicionar tab "Documentos" entre tabs existentes. Posição final a critério do planner.
- **`perfis.cliente_id` existence check** (D-04, D-15) — RLS depende dessa coluna. Validar se já existe (provavelmente sim — Phase 1 ou v1 criou para magic link auth do cliente). Se não, migration adiciona.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` — Phase 7 entry (goal, mode=mvp, 4 success criteria, requirements PORTAL-01..04, dependencies Phase 5)
- `.planning/REQUIREMENTS.md` §PORTAL-01..04 — requirements completos. **Atenção às reinterpretações documentadas em D-01 (PORTAL-03 vira 'configurável por upload') e D-09 (helper, não edge function dedicada)**.
- `.planning/STATE.md` — pré-requisitos Phase 7 (Storage bucket + migration 037), tech-debt, validated assumptions

### Phase 5 + Phase 6 Context (decisões herdadas)
- `.planning/phases/05-multi-channel-notifications-email/05-CONTEXT.md` — multi-canal fundação:
  - **D-20** (helper `_shared/email.ts`) — pattern espelhado em D-09 desta phase
  - **D-04** (smart default JSONB condicional) — replicado em D-14
- `.planning/phases/06-pwa-push-notifications/06-CONTEXT.md` — push como 3º canal:
  - **D-05** (helper `_shared/push.ts`) — pattern reusado em D-09
  - **D-08** (canal CHECK expansão) — Phase 7 não toca (push já inclui 'documentos' tipo automaticamente)
  - **D-13** (iOS gate `canSubscribePush`) — relevante quando cliente instalar portal PWA

### Codebase Maps
- `.planning/codebase/INTEGRATIONS.md` — Slack/Resend/VAPID patterns
- `.planning/codebase/STACK.md` — versões + libs
- `.planning/codebase/ARCHITECTURE.md` — edge function topology, pg_cron, RLS layered

### Existing Edge Functions (patterns to mirror)
- `supabase/functions/_shared/email.ts` — **canonical pattern** que helpers de aprovação espelham
- `supabase/functions/_shared/push.ts` — pattern push (Phase 6)
- `supabase/functions/_shared/perfis.ts` — `findPerfil`, lookup helpers
- `supabase/functions/notify-tarefa/index.ts` — pattern de helper inline + Promise.allSettled (Phase 6 D-05 evolução)
- `supabase/functions/notify-resumo-diario/index.ts` — cron-driven pattern que `notify-aprovacoes-stale` espelha

### Migrations to reference
- `supabase/migrations/035_notificacoes_envios.sql` — Phase 5 schema; Phase 7 não altera (apenas adiciona tipo 'documentos' em `preferencias_notif`, não em `notificacoes_envios`)
- `supabase/migrations/036_push_subscriptions.sql` — Phase 6 (handle_new_user trigger pattern para expandir JSONB; Phase 7 estende novamente)
- **Última migration confirmada: `036_push_subscriptions.sql`. Nova migration Phase 7 = `037_cliente_docs.sql`.**

### Frontend reuse
- `src/pages/portal/PortalLayout.tsx` — header + tabs portal; adicionar entry "Documentos"
- `src/pages/portal/PortalHistoricoPage.tsx` — pattern de página dentro do portal
- `src/components/me/NotificacoesPanel.tsx` — matriz 4×3 → **5×3** (adicionar linha `documentos`)
- `src/pages/ClienteDetailPage.tsx` — adicionar tab/seção "Documentos"
- `src/hooks/usePerfis.ts` (linha 87) — **canonical Supabase Storage upload pattern** (bucket `avatars`, `.upload(path, file, { upsert: true })`). Replicar para `cliente-docs`
- `src/router.tsx` — adicionar rotas `/portal/documentos`, `/clientes/:id/docs` (ou query param tab), `/portal-admin/aprovacoes-pendentes`
- `src/types/index.ts` — estender `TipoNotif`, `PreferenciasNotif`, adicionar `ClienteDoc`, `AutorDoc`, `TagDoc`, `StatusDoc` (D-16)
- `src/components/shared/ActivityTimeline.tsx` — pattern de timeline (referência para histórico de versões D-02 e timeline de aprovação D-12)
- `src/components/shared/RequireRole.tsx` — role gate (Phase 7: coord+ no /portal-admin/aprovacoes-pendentes)
- `src/lib/query-keys.ts` — adicionar `clienteDocs` keys

### External docs
- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase Storage RLS: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Storage Signed URLs: https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
- Supabase pg_cron + Edge Functions (já em uso Phase 5)
- HTML5 file input accept: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/hooks/usePerfis.ts:87`** — canonical Supabase Storage upload pattern. `.storage.from('avatars').upload(path, file, { upsert: true })` + `getPublicUrl(path)`. Phase 7 reusa para `cliente-docs` com **signed URL ao invés de public** (privacidade).
- **`supabase/functions/_shared/email.ts`** — helper pattern (Phase 5 D-20). Espelhado em `_shared/aprovacoes.ts` (D-09).
- **`supabase/functions/notify-resumo-diario/index.ts`** — cron-driven pattern. `notify-aprovacoes-stale` espelha estrutura.
- **`src/components/me/NotificacoesPanel.tsx`** — matriz 4×3 (Phase 6). Phase 7 estende para 5×3.
- **`src/pages/portal/PortalLayout.tsx`** — portal shell. Phase 7 adiciona link nav "Documentos".
- **`src/components/shared/ActivityTimeline.tsx`** — timeline genérica. Reusar para histórico de versões + timeline de aprovação.
- **`src/components/shared/RequireRole.tsx`** — role gate (`atLeast='coordenador'`). Phase 7 usa em `/portal-admin/aprovacoes-pendentes` (consultor vê com query filter, coord+ vê tudo).
- **`src/lib/supabase.ts`** — singleton já configurado com auth + RLS.

### Established Patterns
- **Helper compartilhado por canal** (Phase 5 D-20, Phase 6 D-05) — `_shared/aprovacoes.ts` segue idêntico.
- **`Promise.allSettled` paralelo de canais** (Phase 6) — Phase 7 dispara `sendEmail + sendSlack + sendPush` em paralelo no mesmo helper.
- **Idempotência via UNIQUE em `notificacoes_envios`** — `(perfil_id, tipo='documentos', canal, dia, COALESCE(entidade_id=doc_id))` — pattern Phase 5 D-21.
- **RLS role-aware via `is_at_least(role)`** (Phase 5 migration 029) — usado nas policies de `cliente_docs`.
- **Smart default condicional no `handle_new_user`** (Phase 5 D-04, Phase 6 D-04) — Phase 7 estende JSONB com `documentos: { slack: has_slack, email: true, push: false }`.
- **TanStack Query** — `useClienteDocs(clienteId)`, `useUploadClienteDoc`, `useAprovarDoc`, `useSolicitarRevisaoDoc` em `src/hooks/`.
- **Tipos centralizados em `src/types/index.ts`** — todos os novos tipos vão lá.
- **Migrations sequenciais imutáveis** — `037_cliente_docs.sql`.
- **searchParams bookmarkable** (Phase 6 D-14) — `/clientes/:id?tab=docs` ou rota dedicada (planner decide).
- **Storage upload pattern** — `usePerfis.ts:87` é o template. Phase 7 evolui com signed URLs (privacidade > avatar pattern).

### Integration Points
- **`NotificacoesPanel`** — adicionar linha `documentos` na matriz (5×3 = 15 switches).
- **`PortalLayout`** — adicionar item nav "Documentos" entre tabs existentes (Carteira/Indicar/Catálogo/Histórico/Preferências).
- **`ClienteDetailPage`** — adicionar tab/section "Documentos" (UI upload + lista).
- **Router** — 3 rotas novas: `/portal/documentos`, `/portal-admin/aprovacoes-pendentes` (sub-rota fora do `/portal` cliente — é interna), `/clientes/:id/docs` ou tab handler em `/clientes/:id`.
- **Sidebar** — adicionar entry "Aprovações Pendentes" em CRESCIMENTO (visível coord+ via RequireRole; consultor vê acessando direto pela URL ou via dashboard de cliente individual).
- **Trigger `handle_new_user`** (migration 011 + 035 + 036) — re-criar em 037 incluindo `documentos: false` em cada perfil novo.
- **Edge function deploy**: `supabase functions deploy notify-aprovacao-evento notify-aprovacoes-stale` (nomes a confirmar — helper inline OU funções leves chamando helper).
- **Storage bucket criação**: `supabase storage buckets create cliente-docs --public false` (CLI ou Dashboard) — fora da migration sequencial.
- **`storage.objects` RLS policies** — aplicadas via Dashboard SQL Editor (não vai na migration sequencial).
- **`configuracoes` JSONB** — adicionar chave `dias_para_aprovacao_pendente` no registro `id='default'`.

</code_context>

<specifics>
## Specific Ideas

- **Helper `_shared/aprovacoes.ts` espelha exatamente `_shared/email.ts` + `_shared/push.ts`** — sendNotificacaoAprovacao({ perfilId, evento, docId, payload }) com Promise.allSettled paralelizando Slack+Email+Push. Reduz drift mental.
- **Bidirecional upload é diferenciador real** — REQUIREMENTS-01 explicita "sem WhatsApp manual". Cliente sobe próprio doc no portal = elimina retrabalho de pedir doc por WhatsApp e re-anexar no CRM.
- **Versionamento conservador** — apenas v1 superseded + v2 ativo. Não diff lado-a-lado (overkill MVP).
- **Whitelist + 10MB é proteção real** — bloqueia upload de vídeos/ZIPs maliciosos por cliente (defense in depth com extension + frontend MIME + backend size).
- **Threshold configurável** — coord+ pode ajustar via UI sem nova deploy. Pattern já em uso (Phase 1/2 metas).
- **Reenviar lembrete dispara só cliente** — Slack não recebe (cliente não tem Slack). Email + push pro cliente é destinatário certo do recovery.
- **Reinterpretações de REQUIREMENTS documentadas explicitamente** (D-01, D-09) para evitar conflito downstream.

</specifics>

<deferred>
## Deferred Ideas

Capturadas mas fora desta phase:

- **Diff lado-a-lado de versões** — v2 do milestone se virar requirement
- **Assinatura digital criptográfica** — atual "aprovo" é botão simbólico; cripto verdadeira é phase própria (eIDAS, ICP-Brasil)
- **Comentários inline em pontos do PDF** — já em `## Future Goals` do PROJECT.md (post-v3.0)
- **OCR / extração de texto** — fora de scope (zero-custo viola se exige API externa)
- **DocuSign/ClickSign integration** — pago, viola zero-custo
- **Hard cap per-cliente** — avaliado e adiado (D-06); sem limite + monitor total é simpler
- **Cron de cleanup automático** — soft delete dura indefinidamente nesta MVP. Cleanup retention policy é phase futura
- **MIME sniffing real (magic bytes)** — extensão + frontend type apenas MVP; sniffing real fica tech-debt
- **Cooldown enforced backend no reenviar lembrete** — só visual (D-12); enforce backend só se virar spam
- **Comentário inline na revisão (markdown)** — `comentario_cliente text` é freeform plain text MVP; rich-text v2
- **Push pro cliente nos 4 eventos** — eventos b/c/d disparam pro consultor; reenviar lembrete (D-12) dispara pro cliente. Outros eventos pro cliente (ex: "consultor subiu nova proposta para você") podem ser adicionados v2
- **Cliente visualiza preview inline de PDF** — apenas download MVP; PDF viewer (pdf.js) inline é v2 polish
- **Tab order final em `ClienteDetailPage`** — planner decide; não é decisão de domínio

</deferred>

---

*Phase: 07-client-portal-expansion*
*Context gathered: 2026-05-28 via /gsd-discuss-phase 7*
