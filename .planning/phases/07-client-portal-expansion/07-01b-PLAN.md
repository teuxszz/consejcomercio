---
phase: 07-client-portal-expansion
plan: 01b
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/_shared/email.ts
  - supabase/functions/_shared/push.ts
  - supabase/functions/_shared/perfis.ts
  - src/types/index.ts
  - src/lib/query-keys.ts
  - src/lib/file-validation.ts
  - src/lib/__tests__/file-validation.test.ts
  - src/hooks/__tests__/useClienteDocs.test.tsx
  - src/components/clientes/__tests__/UploadDropzone.test.tsx
  - src/components/clientes/__tests__/AprovacaoButtons.test.tsx
  - src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx
  - src/components/clientes/__tests__/DocVersionTimeline.test.tsx
  - src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx
  - supabase/functions/_shared/__tests__/aprovacoes.test.ts
  - tests/rls/cliente_docs.test.ts
  - tests/rls/cliente_docs_storage.test.ts
  - tests/e2e/cliente-docs-flow.spec.ts
  - src/test/storage-mocks.ts
autonomous: true
requirements: [PORTAL-01, PORTAL-02, PORTAL-03, PORTAL-04]
user_setup: []

must_haves:
  truths:
    - "Wave 0: 10 arquivos de teste stub criados + storage-mocks helpers exportados (BLOCKER #5 revision iter 2: scaffolds dos 3 componentes D-02 também — AprovacaoButtons/SolicitarRevisaoModal/DocVersionTimeline/SubirNovaVersaoButton, WARNING #3)"
    - "Types estendidos: TipoNotif += 'documentos', PreferenciasNotif.documentos, ClienteDoc, AutorDoc, TagDoc, StatusDoc, MetasConfig.dias_para_aprovacao_pendente (D-16 + D-13)"
    - "Helpers _shared/email.ts + _shared/push.ts + _shared/perfis.ts estendidos com TipoNotif='documentos'"
    - "file-validation.ts: validateDoc() rejeita extensão fora whitelist, size > 10MB, file vazio; aceita file.type=='' (Pitfall §2)"
    - "query-keys: clienteDocs + aprovacoesPendentes + bucketUsage namespaces"
  artifacts:
    - path: "src/types/index.ts"
      provides: "Extended TipoNotif/PreferenciasNotif + new ClienteDoc/AutorDoc/TagDoc/StatusDoc + MetasConfig.dias_para_aprovacao_pendente"
      contains: "'documentos'"
    - path: "src/lib/file-validation.ts"
      provides: "validateDoc(file) + validateDocOrThrow(file) + ALLOWED_EXTENSIONS/ALLOWED_MIME_TYPES/MAX_SIZE_BYTES constants"
      exports: ["validateDoc", "validateDocOrThrow", "ALLOWED_EXTENSIONS", "ALLOWED_MIME_TYPES", "MAX_SIZE_BYTES"]
    - path: "src/lib/query-keys.ts"
      provides: "clienteDocs + aprovacoesPendentes + bucketUsage query key factories"
      contains: "clienteDocs"
    - path: "src/test/storage-mocks.ts"
      provides: "mockSupabaseStorageUpload/SignedUrl/Download + mockFileBuilder factories"
      exports: ["mockSupabaseStorageUpload", "mockSupabaseStorageSignedUrl", "mockFileBuilder"]
    - path: "tests/rls/cliente_docs.test.ts"
      provides: "stub describe.skipIf for cliente/consultor/coord+ SELECT/INSERT/UPDATE/DELETE"
      contains: "describe.skipIf"
    - path: "tests/rls/cliente_docs_storage.test.ts"
      provides: "stub describe.skipIf for storage.objects RLS via foldername()"
      contains: "storage.foldername"
    - path: "src/components/clientes/__tests__/AprovacaoButtons.test.tsx"
      provides: "stub it.todo para AprovacaoButtons (WARNING #3 — Slice 4a popula)"
      contains: "it.todo"
    - path: "src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx"
      provides: "stub it.todo para SubirNovaVersaoButton (D-02 versionamento, BLOCKER #2)"
      contains: "it.todo"
  key_links:
    - from: "src/types/index.ts"
      to: "supabase/functions/_shared/email.ts + push.ts + perfis.ts"
      via: "TipoNotif='documentos' espelhado nos 3 helpers Deno"
      pattern: "documentos"
---

<objective>
**Slice 1b (Foundation autonomous — types + Wave 0 scaffolds + libs)**

Plan 01 original foi splitado (BLOCKER #5 revision iter 2). Esta metade é autonomous —
roda em paralelo com 07-01a (que tem o gate manual). Zero overlap em files_modified entre 01a e 01b.

Inclui:
- Types TypeScript estendidos (D-16: TipoNotif += 'documentos', PreferenciasNotif.documentos,
  ClienteDoc, AutorDoc, TagDoc, StatusDoc, MetasConfig.dias_para_aprovacao_pendente)
- 3 Deno helpers estendidos (`email.ts`, `push.ts`, `perfis.ts`) com tipo `'documentos'`
- `file-validation.ts` puro + tests (D-05)
- `query-keys.ts` estendido (clienteDocs + aprovacoesPendentes + bucketUsage)
- 10 arquivos de teste stub (Wave 0 — 7 originais + 4 dos novos componentes D-02 conforme
  BLOCKER #2 e WARNING #3, sendo um deles SubirNovaVersaoButton.test.tsx para D-02)
- `src/test/storage-mocks.ts` factories

Esta plan é **autonomous: true** — Claude rola até o fim sem checkpoint manual.

Output: tudo do front foundation; sem dependência viva de schema (que vem de 01a).
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
@.planning/phases/07-client-portal-expansion/07-VALIDATION.md

# Analogs Phase 5/6 que esta plan espelha
@supabase/functions/_shared/email.ts
@supabase/functions/_shared/push.ts
@supabase/functions/_shared/perfis.ts
@src/types/index.ts
@src/lib/query-keys.ts
@src/lib/cnpj.ts
@src/test/push-mocks.ts
@tests/rls/push_subscriptions.test.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cliente filename → DB column | Nome original guardado em nome_arquivo (nunca no path do storage) — validação em file-validation.ts |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01 | Tampering | Storage path | mitigate | Path scheme `{cliente_id}/{doc_id}.{ext}` — doc_id é UUID server-generated; file.name vai exclusivamente em nome_arquivo. Pattern fica enforçado em storage-helpers (Slice 3) — esta plan só fixa types + constantes |
| T-07-04 | Tampering | MIME type | accept | Whitelist extensão + bucket allowed_mime_types. Backend MIME sniffing real é tech-debt aceito (D-05, RESEARCH §Anti-Patterns + Open Q7 RESOLVED). file.type pode ser spoofado mas cliente CONSEJ não é hostil |
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1b-1: Wave 0 — criar 10 arquivos de teste stub + storage-mocks (Nyquist scaffold)</name>
  <files>
    src/lib/__tests__/file-validation.test.ts,
    src/hooks/__tests__/useClienteDocs.test.tsx,
    src/components/clientes/__tests__/UploadDropzone.test.tsx,
    src/components/clientes/__tests__/AprovacaoButtons.test.tsx,
    src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx,
    src/components/clientes/__tests__/DocVersionTimeline.test.tsx,
    src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx,
    supabase/functions/_shared/__tests__/aprovacoes.test.ts,
    tests/rls/cliente_docs.test.ts,
    tests/rls/cliente_docs_storage.test.ts,
    tests/e2e/cliente-docs-flow.spec.ts,
    src/test/storage-mocks.ts
  </files>
  <read_first>
    @.planning/phases/07-client-portal-expansion/07-VALIDATION.md
    @src/test/push-mocks.ts
    @tests/rls/push_subscriptions.test.ts
    @src/hooks/__tests__/usePushSubscriptions.test.tsx
  </read_first>
  <behavior>
    - file-validation.test.ts: 4 describes — rejeita size > 10MB, rejeita extensão fora whitelist, aceita .pdf/.docx/.jpg legítimos, trata file.type=='' como indeterminado (sem rejeitar) — Slice 1b-5 popula
    - useClienteDocs.test.tsx: stubs `describe('useClienteDocs')`, `describe('useUploadClienteDoc')`, `describe('useAprovarDoc')`, `describe('useSolicitarRevisaoDoc')` — todos com `it.todo`/`it.skip` até Slice 3/4a
    - UploadDropzone.test.tsx: stub describe — render zone + onDropAccepted callback chama onFiles + onDropRejected toast.error
    - **AprovacaoButtons.test.tsx (NEW BLOCKER #5 + WARNING #3):** stub `describe('AprovacaoButtons')` com `it.todo` × 4 (render só p/ portal+interno+pending+requer_aprovacao, click Aprovar chama useAprovarDoc, click Revisão abre Modal, hidden p/ crm mode)
    - **SolicitarRevisaoModal.test.tsx (NEW BLOCKER #5 + WARNING #3):** stub `describe('SolicitarRevisaoModal')` com `it.todo` × 3 (zod min(5), submit chama useSolicitarRevisaoDoc, close on success)
    - **DocVersionTimeline.test.tsx (NEW BLOCKER #5 + WARNING #3):** stub `describe('DocVersionTimeline')` com `it.todo` × 3 (renders history reverso cronológico, icon mapping, expand toggle)
    - **SubirNovaVersaoButton.test.tsx (NEW BLOCKER #2 + WARNING #3):** stub `describe('SubirNovaVersaoButton')` com `it.todo` × 3 (só renderiza p/ autor_tipo='interno' + status='revisao_solicitada' + visível p/ consultor responsável OR coord+, click dispara useUploadClienteDoc com parentDocId=doc.id)
    - aprovacoes.test.ts: stub `describe('sendNotificacaoAprovacao')` — Promise.allSettled disparado, prefs respeitadas, idempotency via 23505 catch, skipSlack=true variant
    - cliente_docs.test.ts: describe.skipIf seguindo push_subscriptions.test.ts — cliente vê só own, consultor vê só responsavel_id, coord+ vê tudo, DELETE rejeita anon
    - cliente_docs_storage.test.ts: describe.skipIf — upload em pasta própria OK, upload em outra pasta rejeitado, SELECT enumera só do próprio cliente_id
    - cliente-docs-flow.spec.ts: stubs Playwright — cliente login → upload PDF → vê na lista; consultor login → vê na ficha cliente
    - storage-mocks.ts: 3 factory functions — mockSupabaseStorageUpload({shouldFail, onProgress}), mockSupabaseStorageSignedUrl({url}), mockFileBuilder({size, type, name}); cada uma retorna Restore type
  </behavior>
  <action>
    1. Criar `src/test/storage-mocks.ts` — espelhar header e pattern de `src/test/push-mocks.ts:1-38`. Exportar 3 factories (`mockSupabaseStorageUpload`, `mockSupabaseStorageSignedUrl`, `mockFileBuilder`) com tipo `Restore = () => void`. Stubs via `vi.fn()`. Pattern role-match documentado em PATTERNS §16.

    2. Criar 10 arquivos stub de teste (todos com `it.todo` ou `describe.skipIf` para passar `npm test` verde sem implementação):
       - `src/lib/__tests__/file-validation.test.ts` — 4 `it.todo` ('reject size > 10MB', 'reject extension out of whitelist', 'accept .pdf/.docx/.jpg', 'tolerate empty file.type'). Task 1b-5 implementa neste mesmo plan.
       - `src/hooks/__tests__/useClienteDocs.test.tsx` — 4 describes vazios com `it.todo`. Plan 03/04a implementa.
       - `src/components/clientes/__tests__/UploadDropzone.test.tsx` — describe com `it.todo` × 3 (render zone, onFiles callback, reject toast). Plan 03 implementa.
       - **`src/components/clientes/__tests__/AprovacaoButtons.test.tsx`** — describe com `it.todo` × 4 (BLOCKER #5 + WARNING #3). Plan 04a implementa.
       - **`src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx`** — describe com `it.todo` × 3. Plan 04a implementa.
       - **`src/components/clientes/__tests__/DocVersionTimeline.test.tsx`** — describe com `it.todo` × 3. Plan 04a implementa.
       - **`src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx`** — describe com `it.todo` × 3 (BLOCKER #2 D-02 versionamento — consultor sobe v2 quando cliente pediu revisão). Plan 04a implementa.
       - `supabase/functions/_shared/__tests__/aprovacoes.test.ts` — describe `sendNotificacaoAprovacao` com `it.todo` × 4 (Promise.allSettled, prefs respect, 23505 idempotency, skipSlack=true para reenviar-lembrete). Plan 02 implementa.
       - `tests/rls/cliente_docs.test.ts` — copiar bootstrap literal de `tests/rls/push_subscriptions.test.ts:21-47` (env reading, login helper, configurado check). TAG `'[RLS-TEST-037]'`. `describe.skipIf(!configurado)('RLS — cliente_docs (migration 037)', () => { it.todo(...) })`.
       - `tests/rls/cliente_docs_storage.test.ts` — mesmo bootstrap; describe `RLS — storage.objects cliente-docs`. `it.todo` × 4 (cliente upload own folder, cliente reject other folder, cliente SELECT own only, consultor SELECT responsavel).
       - `tests/e2e/cliente-docs-flow.spec.ts` — Playwright skeleton com `test.skip` × 2 (cliente upload flow, consultor approval flow). Plan 04b ativa.

    3. Verificar `npm test` continua verde (todos os it.todo são neutros).
  </action>
  <verify>
    <automated>npm test -- --run src/lib src/hooks src/components/clientes supabase/functions/_shared 2>&1 | grep -E "(Test Files|Tests).*passed"</automated>
  </verify>
  <done>
    10 arquivos de teste criados, todos com `it.todo`/`describe.skipIf`/`test.skip`. `src/test/storage-mocks.ts` exporta 3 factories. `npm test` verde sem novos failures.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 1b-2: Estender TipoNotif + PreferenciasNotif + novos tipos em src/types/index.ts (D-16 + D-13 MetasConfig)</name>
  <files>src/types/index.ts</files>
  <read_first>
    @src/types/index.ts
    @.planning/phases/07-client-portal-expansion/07-RESEARCH.md
  </read_first>
  <action>
    Localizar `TipoNotif` (linhas ~433) e `PreferenciasNotif` (linhas ~440-452 — já tem 4 tipos: tarefa/cadencia/renovacao/indicacao).

    1. Estender `TipoNotif`: trocar `'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'` por `'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'`.

    2. Estender `PreferenciasNotif`: adicionar linha
       ```typescript
       documentos: { slack: boolean; email: boolean; push: boolean }
       ```
       como 5ª propriedade.

    3. Adicionar tipos novos (D-16) próximos aos types de notificação:
       ```typescript
       export type AutorDoc = 'interno' | 'cliente'
       export type TagDoc = 'proposta' | 'contrato' | 'relatorio' | 'outro'
       export type StatusDoc = 'pending' | 'aprovado' | 'revisao_solicitada' | 'superseded' | null

       export interface ClienteDoc {
         id: string
         cliente_id: string
         autor_id: string
         autor_tipo: AutorDoc
         tag: TagDoc
         nome_arquivo: string
         mime_type: string
         tamanho_bytes: number
         storage_path: string
         versao: number
         parent_doc_id: string | null
         requer_aprovacao: boolean
         status: StatusDoc
         comentario_cliente: string | null
         created_at: string
         deleted_at: string | null
       }
       ```

    4. **D-13 (RESEARCH Open Q1 RESOLVED):** Estender `MetasConfig` (procurar pela interface; se não existir, criar) adicionando:
       ```typescript
       export interface MetasConfig {
         // ...existentes
         dias_para_aprovacao_pendente?: number  // default 5 (D-13)
       }
       ```

    Definição completa em RESEARCH §12 linhas 1046-1067.
  </action>
  <verify>
    <automated>npx tsc -b 2>&1 | tee /tmp/tsc-out.log; grep -c "documentos\|ClienteDoc\|AutorDoc\|TagDoc\|StatusDoc\|dias_para_aprovacao_pendente" src/types/index.ts | awk '$1 >= 9 { print "TYPES_OK" }'; ! grep -E "error TS" /tmp/tsc-out.log</automated>
  </verify>
  <done>
    TipoNotif inclui 'documentos'. PreferenciasNotif tem 5 propriedades. ClienteDoc/AutorDoc/TagDoc/StatusDoc exportados. MetasConfig.dias_para_aprovacao_pendente opcional. `npx tsc -b` sem erros.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 1b-3: Estender _shared helpers Deno (email.ts, push.ts, perfis.ts) com TipoNotif='documentos'</name>
  <files>
    supabase/functions/_shared/email.ts,
    supabase/functions/_shared/push.ts,
    supabase/functions/_shared/perfis.ts
  </files>
  <read_first>
    @supabase/functions/_shared/email.ts
    @supabase/functions/_shared/push.ts
    @supabase/functions/_shared/perfis.ts
  </read_first>
  <action>
    Esses 3 arquivos têm sua própria cópia de `TipoNotif` (não importam de src/types — arquivos Deno separados do build TS browser).

    1. `_shared/email.ts` (linha ~36): trocar `export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'` por `... | 'documentos'`.

    2. `_shared/push.ts` (linha ~43): mesma extensão.

    3. `_shared/perfis.ts` (linhas ~9-20): estender `PreferenciasNotif` interface adicionando `documentos: PreferenciasTipo` (5ª propriedade). PreferenciasTipo é o tipo `{slack,email,push}` já existente.

    Esta task é puramente declarativa — sem mudanças de runtime behavior. Helper aprovacoes.ts (Plan 02) depende dessas extensões para usar `tipo: 'documentos'` ao chamar sendEmail/sendPush.
  </action>
  <verify>
    <automated>grep -c "'documentos'" supabase/functions/_shared/email.ts supabase/functions/_shared/push.ts | awk -F: '{ if ($2 < 1) { print "MISS " $1; exit 1 } } END { print "OK" }' && grep -c "documentos" supabase/functions/_shared/perfis.ts | awk '$1 >= 1 { print "PERFIS_OK" }'</automated>
  </verify>
  <done>
    3 arquivos atualizados. Cada um contém 'documentos' no TipoNotif ou PreferenciasNotif. Sem mudanças adicionais.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 1b-4: Adicionar query keys clienteDocs + aprovacoesPendentes + bucketUsage em src/lib/query-keys.ts</name>
  <files>src/lib/query-keys.ts</files>
  <read_first>
    @src/lib/query-keys.ts
  </read_first>
  <action>
    Após o bloco `pushSubscriptions` (linhas ~79-82 — pattern exato), adicionar 3 novos namespaces:

    ```typescript
    clienteDocs: {
      all: ['clienteDocs'] as const,
      byCliente: (clienteId: string) => ['clienteDocs', 'cliente', clienteId] as const,
      byId: (id: string) => ['clienteDocs', id] as const,
    },
    aprovacoesPendentes: {
      all: ['aprovacoesPendentes'] as const,
    },
    bucketUsage: {
      byBucket: (bucket: string) => ['bucketUsage', bucket] as const,
    },
    ```

    Definição completa em PATTERNS §Query keys extension (linhas 1046-1059).
  </action>
  <verify>
    <automated>grep -E "clienteDocs|aprovacoesPendentes|bucketUsage" src/lib/query-keys.ts | grep -c "as const" | awk '$1 >= 4 { print "OK" }'</automated>
  </verify>
  <done>
    3 namespaces presentes com pattern `as const`. Hooks Plan 03/04 podem importar `QUERY_KEYS.clienteDocs.byCliente(id)`.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 1b-5: Implementar src/lib/file-validation.ts puro + popular file-validation.test.ts (D-05)</name>
  <files>
    src/lib/file-validation.ts,
    src/lib/__tests__/file-validation.test.ts
  </files>
  <read_first>
    @src/lib/cnpj.ts
    @.planning/phases/07-client-portal-expansion/07-RESEARCH.md
    @src/lib/__tests__/file-validation.test.ts
  </read_first>
  <behavior>
    Test cases (substituem os it.todo de Task 1b-1):
    - validateDoc(file 11MB pdf) retorna `{ code: 'SIZE', message: 'Arquivo maior que 10 MB' }`
    - validateDoc(file vazio) retorna `{ code: 'EMPTY', message: 'Arquivo vazio' }`
    - validateDoc(file .exe) retorna `{ code: 'EXTENSION', message: 'Extensão .exe não permitida' }`
    - validateDoc(file .pdf 100KB type=application/pdf) retorna null
    - validateDoc(file .docx type='') retorna null (Pitfall §2 — file.type vazio é tolerado)
    - validateDoc(file .pdf type='application/zip') retorna `{ code: 'MIME', ... }`
    - validateDocOrThrow(invalid) throws Error com message
    - validateDocOrThrow(valid) não throws
  </behavior>
  <action>
    1. Criar `src/lib/file-validation.ts` exportando per RESEARCH §4 (linhas 566-606):
       - constants `ALLOWED_EXTENSIONS`, `ALLOWED_MIME_TYPES`, `MAX_SIZE_BYTES = 10 * 1024 * 1024`
       - type `DocValidationError = { code: 'EXTENSION' | 'MIME' | 'SIZE' | 'EMPTY'; message: string }`
       - função pura `validateDoc(file: File): DocValidationError | null`
         - check size===0 → EMPTY
         - check size > MAX → SIZE
         - extrair ext, lowercase, check whitelist → EXTENSION
         - if file.type !== '' AND not in ALLOWED_MIME_TYPES → MIME (Pitfall §2: trata '' como indeterminado, NÃO bloqueia)
         - else null
       - função `validateDocOrThrow(file): void` que joga Error com message

    2. Popular `src/lib/__tests__/file-validation.test.ts` com os 8 test cases acima. Usar `mockFileBuilder` de `src/test/storage-mocks.ts`:
       ```typescript
       import { mockFileBuilder } from '@/test/storage-mocks'
       import { validateDoc } from '@/lib/file-validation'

       describe('validateDoc', () => {
         it('rejeita arquivo maior que 10 MB', () => {
           const file = mockFileBuilder({ size: 11 * 1024 * 1024, type: 'application/pdf', name: 'big.pdf' })
           expect(validateDoc(file)?.code).toBe('SIZE')
         })
         // ... outros 7
       })
       ```

    3. Verificar que `npm test -- file-validation` passa todos os 8 cases.
  </action>
  <verify>
    <automated>npm test -- --run src/lib/__tests__/file-validation.test.ts 2>&1 | grep -E "(Tests).*passed" | head -1</automated>
  </verify>
  <done>
    `src/lib/file-validation.ts` criado com validateDoc + validateDocOrThrow + constants exportados. 8 testes passando. Pitfall §2 (file.type vazio tolerado) coberto explicitamente.
  </done>
</task>

</tasks>

<verification>
**Smoke check Slice 1b (executar ao final):**

```bash
# 1. TypeScript compila sem erros novos
rtk npx tsc -b

# 2. ESLint clean nos arquivos novos
rtk npm run lint -- src/lib/file-validation.ts src/types/index.ts src/lib/query-keys.ts src/test/storage-mocks.ts

# 3. Testes Wave 0 todos verdes (todo + 8 reais de file-validation)
rtk npm test -- --run src/lib src/hooks src/components/clientes supabase/functions/_shared
```
</verification>

<success_criteria>
- [ ] src/types/index.ts: TipoNotif += 'documentos', PreferenciasNotif tem documentos, ClienteDoc/AutorDoc/TagDoc/StatusDoc exportados, MetasConfig.dias_para_aprovacao_pendente opcional
- [ ] _shared/email.ts + _shared/push.ts + _shared/perfis.ts estendidos com 'documentos'
- [ ] src/lib/file-validation.ts implementado (validateDoc + validateDocOrThrow + constants)
- [ ] src/lib/query-keys.ts: clienteDocs + aprovacoesPendentes + bucketUsage namespaces
- [ ] src/test/storage-mocks.ts: 3 factories exportadas
- [ ] 10 arquivos de teste stub criados (todos passam com it.todo/describe.skipIf — incluindo os 4 novos componentes BLOCKER #2/#5/WARNING #3: AprovacaoButtons, SolicitarRevisaoModal, DocVersionTimeline, SubirNovaVersaoButton)
- [ ] `npm test` verde no diff
- [ ] `npx tsc -b` verde
- [ ] Coverage requirements: PORTAL-01 (foundation pieces), PORTAL-02 (types), PORTAL-03 (TipoNotif), PORTAL-04 (dias_para_aprovacao_pendente type)
</success_criteria>

<output>
Create `.planning/phases/07-client-portal-expansion/07-01b-SUMMARY.md` when done — incluir:
- Lista dos 10 stub tests + storage-mocks (paths)
- Confirmação tsc + lint + test verde
- Versão final dos types em src/types/index.ts (D-16 + D-13)
</output>
