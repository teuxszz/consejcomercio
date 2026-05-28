---
phase: 07-client-portal-expansion
plan: 01a
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/037_cliente_docs.sql
autonomous: false
requirements: [PORTAL-01, PORTAL-02, PORTAL-03, PORTAL-04]
user_setup:
  - service: supabase-storage
    why: "Bucket cliente-docs + storage.objects RLS + Vault secret são manuais (fora migration sequencial — Supabase platform requirement)"
    cli_commands:
      - "supabase storage buckets create cliente-docs --public false --file-size-limit 10485760 --allowed-mime-types ..."
    dashboard_config:
      - task: "Aplicar storage.objects RLS policies (SQL pronto cola e roda)"
        location: "https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/sql/new"
      - task: "Criar Vault secret webhook_aprovacao_secret"
        location: "Supabase Studio → Project Settings → Vault → New Secret"

must_haves:
  truths:
    - "Migration 037 aplicada em prod: tabela cliente_docs existe, 4 RLS policies, CHECK notificacoes_envios.tipo inclui 'documentos', preferencias_notif.documentos default em todos os perfis"
    - "Bucket cliente-docs existe em produção (privado, 10MB, MIME whitelist)"
    - "storage.objects RLS policies aplicadas (SELECT/INSERT cliente+interno+coord; DELETE service-role only)"
    - "Vault secret webhook_aprovacao_secret criado"
    - "configuracoes.metas.dias_para_aprovacao_pendente seedado com default 5 (D-13)"
  artifacts:
    - path: "supabase/migrations/037_cliente_docs.sql"
      provides: "cliente_docs table + RLS + notificacoes_envios.tipo CHECK expand + handle_new_user CREATE OR REPLACE + backfill JSONB perfis + UPDATE configuracoes.metas dias_para_aprovacao_pendente"
      contains: "CREATE TABLE cliente_docs"
      min_lines: 180
  key_links:
    - from: "supabase/migrations/037_cliente_docs.sql"
      to: "preferencias_notif JSONB"
      via: "jsonb_set aninhado para adicionar documentos:{slack,email,push}"
      pattern: "jsonb_set.*documentos"
    - from: "supabase/migrations/037_cliente_docs.sql"
      to: "configuracoes.metas JSONB"
      via: "UPDATE jsonb_set para dias_para_aprovacao_pendente default 5"
      pattern: "dias_para_aprovacao_pendente"
---

<objective>
**Slice 1a (Schema Push manual gating) — Migration 037 + bucket + storage RLS + Vault secret**

Plan 01 original foi splitado (BLOCKER #5 revision iter 2 — 7 tasks + 15 files > size cap). Esta
metade contém o caminho manual (escrita + apply de schema + bucket + Vault) que exige humano.
A outra metade (07-01b) roda em paralelo com tasks autonomous (types + scaffolds + libs).

Sem essa fundação de schema viva, hooks e edge functions dos Slices 2/3/4 batem em tipo-vazio
ou RLS-deny.

**Autonomous: false** porque contém o gate `[BLOCKING]` Schema Push (3 passos manuais —
migration apply via Studio + bucket create CLI + storage RLS Dashboard SQL + Vault secret).

Output:
- migration 037 escrita + aplicada (cliente_docs + RLS + CHECK expand + handle_new_user + backfill + configuracoes.metas)
- bucket cliente-docs + storage.objects policies em prod
- Vault secret webhook_aprovacao_secret criado
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/07-client-portal-expansion/07-CONTEXT.md
@.planning/phases/07-client-portal-expansion/07-RESEARCH.md
@.planning/phases/07-client-portal-expansion/07-PATTERNS.md

# Analogs Phase 5/6 que esta plan espelha literalmente
@supabase/migrations/036_push_subscriptions.sql
@supabase/migrations/035_notificacoes_envios.sql
@supabase/migrations/015_portal_tokens.sql
@supabase/migrations/009_storage_avatars.sql
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Supabase REST (PostgREST) | INSERT/UPDATE em cliente_docs vem do client autenticado (cliente ou interno) |
| Browser → Supabase Storage | upload() chama o bucket cliente-docs com auth JWT do user |
| Postgres trigger → Edge Function | pg_net.http_post com Bearer webhook_aprovacao_secret (Vault) |
| Cliente filename → DB column | Nome original guardado em nome_arquivo (nunca no path do storage) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-02 | Spoofing | storage.objects RLS | mitigate | RLS policy `(storage.foldername(name))[1] = (SELECT cliente_id::text FROM perfis WHERE id = auth.uid())` — aplicada via Dashboard SQL Editor no Task 1a-2 |
| T-07-05 | DoS | Quota bucket | mitigate | bucket file_size_limit=10485760 (10MB hard limit) aplicado na criação |
| T-07-09 | Elevation | RLS UPDATE cliente_docs | mitigate | RLS WITH CHECK em UPDATE: cliente só pode mudar status para 'aprovado'/'revisao_solicitada' (não 'superseded') |
| T-07-10 | Tampering | Trigger SQL injection | mitigate | jsonb_build_object parametrizado (Postgres-safe, não concat string) — preparação para Plan 02 |
| T-07-12 | Information Disclosure | Vault secret | mitigate | webhook_aprovacao_secret armazenado em Supabase Vault (não literal no SQL). Pattern Phase 5 migration 031 |
</threat_model>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1a-1: Escrever migration 037_cliente_docs.sql (table + RLS + JSONB extend + handle_new_user + backfill + configuracoes.metas)</name>
  <files>supabase/migrations/037_cliente_docs.sql</files>
  <read_first>
    @supabase/migrations/036_push_subscriptions.sql
    @supabase/migrations/035_notificacoes_envios.sql
    @supabase/migrations/015_portal_tokens.sql
    @.planning/phases/07-client-portal-expansion/07-RESEARCH.md
    @.planning/phases/07-client-portal-expansion/07-PATTERNS.md
  </read_first>
  <action>
    Espelhar layout da migration 036 (per PATTERNS §1). Estrutura por blocos numerados:

    **Header (linhas 1-20):** comentário de 6 itens descrevendo conteúdo (CREATE cliente_docs / RLS 4 policies / ALTER CHECK notificacoes_envios.tipo / CREATE OR REPLACE handle_new_user / backfill JSONB perfis / UPDATE configuracoes.metas) — formato idêntico a 036:1-16.

    **Bloco 1 — CREATE TABLE cliente_docs (D-14):**
    ```sql
    CREATE TABLE IF NOT EXISTS public.cliente_docs (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      cliente_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
      autor_id        uuid NOT NULL REFERENCES public.perfis(id),
      autor_tipo      text NOT NULL CHECK (autor_tipo IN ('interno','cliente')),
      tag             text NOT NULL CHECK (tag IN ('proposta','contrato','relatorio','outro')),
      nome_arquivo    text NOT NULL,
      mime_type       text NOT NULL,
      tamanho_bytes   integer NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 10485760),
      storage_path    text NOT NULL DEFAULT '',
      versao          integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
      parent_doc_id   uuid REFERENCES public.cliente_docs(id),
      requer_aprovacao boolean NOT NULL DEFAULT false,
      status          text CHECK (status IS NULL OR status IN ('pending','aprovado','revisao_solicitada','superseded')),
      comentario_cliente text,
      created_at      timestamptz NOT NULL DEFAULT now(),
      deleted_at      timestamptz
    );

    CREATE INDEX idx_cliente_docs_cliente_id ON public.cliente_docs(cliente_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_cliente_docs_status_pending ON public.cliente_docs(status, created_at)
      WHERE status = 'pending' AND requer_aprovacao = true AND deleted_at IS NULL;
    CREATE INDEX idx_cliente_docs_parent ON public.cliente_docs(parent_doc_id) WHERE parent_doc_id IS NOT NULL;
    ```

    **Bloco 2 — RLS 4 policies (D-14 + RESEARCH §RLS role-aware 3-way, linhas 833-845):**
    Habilitar RLS; criar 4 policies:
    - `cliente_docs_select`: USING (cliente_id = (SELECT cliente_id FROM perfis WHERE id = auth.uid()) OR (public.is_interno() AND cliente_id IN (SELECT id FROM clientes WHERE responsavel_id = auth.uid())) OR public.is_at_least('coordenador'))
    - `cliente_docs_insert`: WITH CHECK semelhante. Cliente: autor_tipo='cliente' AND autor_id=auth.uid() AND requer_aprovacao=false (D-01: cliente nunca marca próprio doc como requer_aprovacao). Interno: autor_tipo='interno' AND autor_id=auth.uid() AND (cliente_id pertence ao responsavel OR coord+)
    - `cliente_docs_update`: WITH CHECK que cliente só pode UPDATE status IN ('aprovado','revisao_solicitada') E só de docs onde autor_tipo='interno' E requer_aprovacao=true (cliente aprova doc do consultor, nunca o próprio). Interno (responsavel/coord+) pode mudar storage_path, deleted_at, status para 'superseded' (D-02 versionamento)
    - `cliente_docs_delete`: USING (false) — service-role bypassa RLS automaticamente; soft delete via UPDATE deleted_at é o caminho normal

    **Bloco 3 — ALTER CHECK notificacoes_envios.tipo (D-08, espelhando 036:63-69):**
    ```sql
    ALTER TABLE notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_tipo_check;
    ALTER TABLE notificacoes_envios
      ADD CONSTRAINT notificacoes_envios_tipo_check
      CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao','documentos'));
    ```

    **Bloco 4 — CREATE OR REPLACE handle_new_user (espelhando 036:71-115, anti-regressão D-04 Phase 5):**
    Copiar TODO o corpo da função de 036 e adicionar 5ª chave `'documentos'` em jsonb_build_object. Manter lookup `SELECT slack_user_id IS NOT NULL INTO has_slack`. Default documentos: `{slack: has_slack, email: true, push: false}` (D-14).

    **Bloco 5 — Backfill JSONB aninhado (espelhando 036:120-134, Pitfall §9 RESEARCH):**
    ```sql
    UPDATE perfis
       SET preferencias_notif = jsonb_set(
             preferencias_notif,
             '{documentos}',
             jsonb_build_object('slack', false, 'email', true, 'push', false),
             true  -- create_if_missing
           )
     WHERE (preferencias_notif->'documentos') IS NULL;
    ```
    Smart default condicional não rola no backfill (não temos has_slack barato em UPDATE bulk) — assume slack:false como conservador; usuários ajustam em /me/preferencias.

    **Bloco 6 — UPDATE configuracoes.metas.dias_para_aprovacao_pendente (D-13 + RESEARCH Open Q1 RESOLVED — JSONB metas):**
    ```sql
    UPDATE configuracoes
       SET metas = jsonb_set(
             COALESCE(metas, '{}'::jsonb),
             '{dias_para_aprovacao_pendente}',
             '5'::jsonb,
             true
           )
     WHERE id = 'default'
       AND (metas->>'dias_para_aprovacao_pendente') IS NULL;
    ```
  </action>
  <verify>
    <automated>grep -c "^CREATE POLICY\|^CREATE OR REPLACE FUNCTION\|^ALTER TABLE\|^CREATE TABLE\|^CREATE INDEX" supabase/migrations/037_cliente_docs.sql | awk '$1 >= 9 { print "OK"; exit 0 } { print "FAIL"; exit 1 }'</automated>
  </verify>
  <done>
    Migration 037 criada com 1 CREATE TABLE + 3 CREATE INDEX + 4 CREATE POLICY + 1 ALTER TABLE (CHECK expand) + 1 CREATE OR REPLACE FUNCTION (handle_new_user) + 2 UPDATEs (backfill perfis + configuracoes). 180+ linhas.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking-human">
  <name>Task 1a-2 [BLOCKING SCHEMA PUSH]: Gabriel aplica migration 037 + cria bucket + cola storage RLS + cria Vault secret</name>
  <what-built>
    Migration 037_cliente_docs.sql escrita (Task 1a-1). Bucket creation + Storage RLS policies + Vault secret ficam fora da migration sequencial (D-14, D-15 — limitação da plataforma Supabase: storage.objects RLS exige Dashboard SQL Editor; bucket exige CLI ou Dashboard; Vault exige Studio UI).
  </what-built>
  <how-to-verify>
    **Passo 1 — Aplicar migration 037 via Supabase Studio SQL Editor**
    (workaround do tech-debt `supabase db push` documentado em STATE.md):

    1. Abrir https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/sql/new
    2. Copiar TODO o conteúdo de `supabase/migrations/037_cliente_docs.sql`
    3. Colar no SQL Editor + Run
    4. Confirmar 0 erros
    5. Verificação inline:
       ```sql
       SELECT count(*) FROM pg_policies WHERE tablename = 'cliente_docs';  -- esperado: 4
       SELECT preferencias_notif->'documentos' FROM perfis LIMIT 3;  -- esperado: {"slack": false, "email": true, "push": false}
       SELECT metas->>'dias_para_aprovacao_pendente' FROM configuracoes WHERE id = 'default';  -- esperado: "5"
       SELECT con.consrc FROM pg_constraint con WHERE con.conname = 'notificacoes_envios_tipo_check';
       -- esperado: incluir 'documentos'
       ```

    **Passo 2 — Criar bucket cliente-docs via CLI** (preferencial):
    ```bash
    rtk supabase storage buckets create cliente-docs \
      --public false \
      --file-size-limit 10485760 \
      --allowed-mime-types "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.oasis.opendocument.text,image/jpeg,image/png,image/webp"
    ```

    Alternativa Dashboard (se CLI falhar):
    1. Studio → Storage → Create new bucket
    2. Name: `cliente-docs` · Public: NO · File size limit: 10 MB · Allowed MIME types: cole a lista acima
    3. Save

    **Passo 3 — Aplicar storage.objects RLS policies via Dashboard SQL Editor**
    (cole o SQL pronto de RESEARCH §1.B, linhas 310-352):
    ```sql
    -- SELECT cliente vê própria pasta; interno consultor vê dos seus; coord+ vê todos
    CREATE POLICY cliente_docs_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'cliente-docs' AND (
          (storage.foldername(name))[1] = (
            SELECT cliente_id::text FROM perfis WHERE id = auth.uid()
          )
          OR (public.is_interno() AND (storage.foldername(name))[1] IN (
            SELECT c.id::text FROM clientes c WHERE c.responsavel_id = auth.uid()
          ))
          OR public.is_at_least('coordenador')
        )
      );

    -- INSERT — mesma lógica
    CREATE POLICY cliente_docs_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'cliente-docs' AND (
          (storage.foldername(name))[1] = (
            SELECT cliente_id::text FROM perfis WHERE id = auth.uid()
          )
          OR (public.is_interno() AND (
            (storage.foldername(name))[1] IN (
              SELECT c.id::text FROM clientes c WHERE c.responsavel_id = auth.uid()
            )
            OR public.is_at_least('coordenador')
          ))
        )
      );

    -- UPDATE não criada → DENY (path imutável; nova versão = novo doc_id)
    -- DELETE não criada → DENY usuários comuns; service_role bypassa
    ```

    Verificação inline:
    ```sql
    SELECT polname FROM pg_policy
     WHERE polrelid = 'storage.objects'::regclass
       AND polname LIKE 'cliente_docs_%';
    -- esperado: cliente_docs_select, cliente_docs_insert
    ```

    **Passo 4 — Criar Vault secret webhook_aprovacao_secret**
    (consumido pelos triggers SQL em Plan 02 + edge functions):

    1. Gerar um secret aleatório: `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
    2. Studio → Project Settings → Vault → New Secret
    3. Name: `webhook_aprovacao_secret` · Secret: cole o valor gerado
    4. Save
    5. Salvar o MESMO valor em Edge Function secrets para uso runtime:
       ```bash
       rtk supabase secrets set WEBHOOK_APROVACAO_SECRET=<o-mesmo-valor>
       ```
    6. Verificação: `SELECT name FROM vault.secrets WHERE name = 'webhook_aprovacao_secret';` retorna 1 row
  </how-to-verify>
  <files>(manual checkpoint — see <how-to-verify> for exact commands and files touched outside repo)</files>
  <action>Execute every numbered step in <how-to-verify> in order; do not skip Studio SQL Editor / CLI / Dashboard tasks. After each step run the verification SQL/curl shown inline.</action>
  <verify><human-check>All inline verification queries / curl invocations in <how-to-verify> return the expected values; capture outputs in the SUMMARY.</human-check></verify>
  <done>Every step in <how-to-verify> completed with the expected output; any anomaly logged in SUMMARY and either fixed before resume or escalated to a follow-up gap-closure plan.</done>
    <resume-signal>Type "approved" após confirmar: (1) `pg_policies` retorna 4 para cliente_docs; (2) preferencias_notif.documentos default seedado; (3) configuracoes.metas.dias_para_aprovacao_pendente='5'; (4) bucket cliente-docs existe + privado + 10MB limit; (5) 2 policies storage.objects cliente_docs_* aplicadas; (6) Vault secret webhook_aprovacao_secret criado + WEBHOOK_APROVACAO_SECRET em Edge secrets. Ou descreva qualquer falha.</resume-signal>
</task>

</tasks>

<verification>
**Schema verification (live, após Task 1a-2):**
- `SELECT count(*) FROM pg_policies WHERE tablename = 'cliente_docs';` retorna 4
- `SELECT count(*) FROM pg_policies WHERE polrelid = 'storage.objects'::regclass AND polname LIKE 'cliente_docs_%';` retorna 2
- `SELECT preferencias_notif->'documentos' FROM perfis WHERE preferencias_notif->'documentos' IS NOT NULL` retorna >= 1 row (backfill funcionou)
- `SELECT metas->>'dias_para_aprovacao_pendente' FROM configuracoes WHERE id = 'default'` retorna "5"
- `SELECT name FROM vault.secrets WHERE name = 'webhook_aprovacao_secret'` retorna 1 row

**SQL parse-check da migration (sintaxe básica):**
```bash
rtk grep -E "^(CREATE|ALTER|DROP|UPDATE|INSERT)" supabase/migrations/037_cliente_docs.sql | wc -l   # >= 10
```
</verification>

<success_criteria>
- [ ] Migration 037 escrita + APLICADA em prod (Task 1a-2 manual checkpoint)
- [ ] Bucket cliente-docs criado em prod (privado, 10MB, MIME whitelist)
- [ ] 2 storage.objects RLS policies aplicadas (SELECT + INSERT)
- [ ] Vault secret webhook_aprovacao_secret criado (+ env var em Edge functions)
- [ ] configuracoes.metas.dias_para_aprovacao_pendente seedado (default 5)
- [ ] Coverage requirements: PORTAL-01 (storage RLS), PORTAL-02 (cliente_docs RLS), PORTAL-03 (Vault secret + CHECK 'documentos'), PORTAL-04 (dias_para_aprovacao_pendente JSONB)
</success_criteria>

<output>
Create `.planning/phases/07-client-portal-expansion/07-01a-SUMMARY.md` when done — incluir:
- Status migration 037 (aplicada? hash do plano de execução)
- Status bucket cliente-docs (criado? via CLI ou Dashboard?)
- Status storage RLS (policies aplicadas? count via pg_policy)
- Status Vault secret
- Confirmação configuracoes.metas atualizada
</output>
