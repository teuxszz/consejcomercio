---
phase: 07-client-portal-expansion
plan: 03
subsystem: client-portal-documentos
tags: [storage, upload, dropzone, signed-url, versioning, portal, crm-tab]
requires:
  - 07-01a (migration 037 + bucket cliente-docs + storage RLS)
  - 07-01b (types ClienteDoc + file-validation + storage-mocks + test stubs)
provides:
  - storage-helpers.ts (uploadClienteDocFile + getSignedDownloadUrl + buildDocPath)
  - useClienteDocs hooks (query + useUploadClienteDoc + useDownloadDoc)
  - UploadDropzone component (react-dropzone wrapper PT-BR)
  - ClienteDocsList component (lista agrupada por raiz com inline history)
  - PortalDocumentosPage (/portal/documentos — cliente UX)
  - DocsTabConsultor (tab "Documentos" em /clientes/:id — consultor UX)
  - groupByRoot lib pura (D-02 versionamento aggregation)
affects:
  - src/router.tsx (rota /portal/documentos)
  - src/pages/portal/PortalLayout.tsx (NAV entry "Documentos")
  - src/pages/ClienteDetailPage.tsx (tab "Documentos" + DocsTabConsultor)
tech-stack:
  added:
    - react-dropzone@^15.0.0
  patterns:
    - "TanStack Query mutation com rollback transacional (INSERT row → upload → UPDATE → rollback DELETE on fail)"
    - "Pre-row creation para gerar UUID server-side antes do storage upload (path scheme imutável)"
    - "Signed URL on-click (sem useEffect — T-07-06 mitigated)"
    - "Idempotent superseded marker via .neq('status', 'superseded')"
    - "Slot prop pattern para evolução incremental (actionsSlot? em ClienteDocsList — Slice 4 plugará)"
key-files:
  created:
    - src/lib/storage-helpers.ts
    - src/lib/doc-grouping.ts
    - src/lib/__tests__/doc-grouping.test.ts
    - src/hooks/useClienteDocs.ts
    - src/components/clientes/UploadDropzone.tsx
    - src/components/clientes/ClienteDocsList.tsx
    - src/pages/portal/PortalDocumentosPage.tsx
  modified:
    - package.json (react-dropzone)
    - package-lock.json
    - src/router.tsx (rota /portal/documentos)
    - src/pages/portal/PortalLayout.tsx (NAV "Documentos")
    - src/pages/ClienteDetailPage.tsx (tab "Documentos" + DocsTabConsultor)
    - src/hooks/__tests__/useClienteDocs.test.tsx (RED → 9 tests passing)
    - src/components/clientes/__tests__/UploadDropzone.test.tsx (RED → 6 tests passing)
decisions:
  - "D-02 versionamento implementado com SELECT-then-INSERT no client (sem RPC server-side); idempotência garantida via .neq('status','superseded') no UPDATE final"
  - "D-01 enforce client-side em useUploadClienteDoc: autorTipo='cliente' descarta requerAprovacao=true; RLS é 2ª linha de defesa"
  - "Path scheme imutável {cliente_id}/{doc_id}.{ext}; doc_id vem de INSERT pre-upload para evitar colisão (T-07-01/T-07-07)"
  - "Rollback transacional via DELETE row se uploadClienteDocFile falhar; sem 'orphan rows'"
  - "Signed URL expiry 3600s (60min) constante exportada (SIGNED_URL_EXPIRY_SECONDS); URL gerada on-click (não em useEffect — T-07-06)"
  - "ClienteDocsList aceita actionsSlot? para Slice 4 plugar AprovacaoButtons sem refactor"
  - "groupByRoot lib pura testável; órfãos (parent_doc_id aponta fora da lista) viram roots próprios para não desaparecer da UI"
  - "MimeIcon como wrapper renderizador (não retorna componente) para satisfazer react-hooks/static-components"
metrics:
  duration: ~50min
  completed: 2026-05-29
---

# Phase 7 Plan 03: UI bidirecional upload + lista de documentos — Summary

Fluxo completo bidirecional de upload de documentos cliente ↔ consultor entregue, com versionamento D-02 implementado e testado, download via signed URL 60min, e slot vazio (`actionsSlot?`) reservado para os botões de aprovação do Slice 4.

## What was built

**Stack adicionada:** `react-dropzone@^15.0.0` (legitimidade verificada via `npm view`: repo `github.com/react-dropzone/react-dropzone`, maintainers conhecidos `okonet`, `rolandjitsu`, `rxmarbles`, version 15.0.0, modified 2026-02-10).

**Bibliotecas puras criadas:**

- `src/lib/storage-helpers.ts` — wrapper sobre `supabase.storage`:
  - `uploadClienteDocFile({ path, file, onProgress? })` com `validateDocOrThrow` pré-upload + `upsert: false`
  - `getSignedDownloadUrl(storagePath)` retorna URL com expiry `SIGNED_URL_EXPIRY_SECONDS = 3600`
  - `buildDocPath(clienteId, docId, filename)` aplica path scheme `{cliente_id}/{doc_id}.{ext}` (D-04)
  - `BUCKET = 'cliente-docs'` constante
  - Pitfall §1 RESEARCH documentado com `@ts-expect-error` no `onUploadProgress`
- `src/lib/doc-grouping.ts` — `groupByRoot(docs)` agrupa por raiz, retorna `{ current, history }` ordenado por versao desc + grupos por created_at desc. Lida com órfãos.

**Hooks (TanStack Query):**

- `src/hooks/useClienteDocs.ts`:
  - `useClienteDocs(clienteId)` — query SELECT cliente_docs por cliente, `deleted_at IS NULL`, ordenada por created_at desc
  - `useUploadClienteDoc()` — mutation com sequência:
    1. **D-02 versionamento:** se `parentDocId` → SELECT parent.versao → `novaVersao = parent.versao + 1`
    2. **D-01 enforce:** se `autorTipo='cliente'` → `requer_aprovacao = false` forçado (RLS é 2ª defesa)
    3. INSERT row (gera `doc_id`)
    4. Upload via `uploadClienteDocFile` → no fail: **rollback DELETE da row + rethrow**
    5. UPDATE `storage_path`
    6. Se `parentDocId`: UPDATE parent SET `status='superseded'` com `.neq('status','superseded')` (idempotente)
  - `useDownloadDoc()` — mutation cria `<a download>` com URL assinada, clica, remove

**Componentes UI:**

- `src/components/clientes/UploadDropzone.tsx` — wrapper react-dropzone:
  - ACCEPT com fallback de extensão por MIME (Pitfall §8 RESEARCH — Windows .docx pode reportar `octet-stream`)
  - MAX_SIZE 10MB
  - Toast PT-BR específico para `file-too-large` / `file-invalid-type` / fallback
  - Estados visuais: `isDragActive` (cyan), `isDragReject` (destructive), `disabled` (opaco)
- `src/components/clientes/ClienteDocsList.tsx` — lista agrupada:
  - Usa `useClienteDocs` + `useDownloadDoc` + `groupByRoot`
  - Loading skeleton + empty state PT-BR (variantes para `mode='portal'` e `mode='crm'`)
  - Por raiz exibe a versão mais nova com badge **"v{N} (atual)"** quando há histórico
  - Dropdown inline "Ver versões anteriores" com download por versão
  - Slot `actionsSlot?: (doc) => ReactNode` para Slice 4 plugar `AprovacaoButtons` + `SubirNovaVersaoButton`
  - `MimeIcon` wrapper (não retorna componente) para satisfazer `react-hooks/static-components`

**Páginas:**

- `src/pages/portal/PortalDocumentosPage.tsx` — UX cliente:
  - Header `FileText` cyan + título "Documentos" + subtítulo PT-BR
  - `UploadDropzone` que faz `upload.mutate(...)` com `autorTipo='cliente'`, `tag='outro'`, `requerAprovacao=false`
  - `ClienteDocsList clienteId mode='portal'` (cores cyan/dark inline)
  - Fallback PT-BR para perfil sem `cliente_id` vinculado
- `src/pages/ClienteDetailPage.tsx` — UX consultor:
  - Nova `TabsTrigger value="documentos"` com contador `(N)` via `useClienteDocs` no nível pai
  - `DocsTabConsultor` subcomponente local: `Select` de tag (proposta/contrato/relatorio/outro) + `<input type="checkbox">` "Pedir aprovação do cliente" (default `true`)
  - `UploadDropzone` → upload com `autorTipo='interno'` + `requerAprovacao` do checkbox
  - `ClienteDocsList mode='crm'`
  - Comentário inline documentando D-01: "consultor decide; cliente nunca (forçado em useUploadClienteDoc)"

**Roteamento:**

- `src/router.tsx` — nova rota child de `<PortalLayout>`: `{ path: 'documentos', element: <PortalDocumentosPage /> }`
- `src/pages/portal/PortalLayout.tsx` — NAV ganha entry `{ to: '/portal/documentos', label: 'Documentos', icon: FileText }` entre Histórico e Preferências

## Commits

| Task | Hash | Mensagem |
|------|------|----------|
| 3.2 | `4930470` | chore(07-03-2): install react-dropzone@^15.0.0 |
| 3.3 | `d578838` | feat(07-03-3): storage-helpers.ts (cliente-docs bucket + signed URL) |
| 3.4 RED | `04babaf` | test(07-03-4): populate useClienteDocs test suite (RED gate) |
| 3.4 GREEN | `fcbf6ed` | feat(07-03-4): useClienteDocs hooks (query + upload + download) — D-01/D-02 |
| 3.5 RED | `162b7de` | test(07-03-5): populate UploadDropzone test suite (RED gate) |
| 3.5 GREEN | `8cb1ac5` | feat(07-03-5): UploadDropzone (react-dropzone wrapper PT-BR) |
| 3.6 | `46c0d87` | feat(07-03-6): ClienteDocsList + groupByRoot (D-02 inline history dropdown) |
| 3.7 | `157b567` | feat(07-03-7): PortalDocumentosPage + nav 'Documentos' + rota /portal/documentos |
| 3.8 | `39dd2f7` | feat(07-03-8): tab 'Documentos' em ClienteDetailPage + DocsTabConsultor |
| lint | `d60c211` | fix(07-03): ClienteDocsList — extrair MimeIcon (react-hooks/static-components) |

10 commits atômicos. Gate RED/GREEN explícito nos Tasks 3.4 e 3.5 (TDD compliance).

## Tests

| Suite | File | Tests |
|-------|------|-------|
| useClienteDocs | `src/hooks/__tests__/useClienteDocs.test.tsx` | **9 passing** |
| UploadDropzone | `src/components/clientes/__tests__/UploadDropzone.test.tsx` | **6 passing** |
| groupByRoot | `src/lib/__tests__/doc-grouping.test.ts` | **4 passing** |
| file-validation (Wave 0) | `src/lib/__tests__/file-validation.test.ts` | **9 passing** |
| **Total Phase 7** | — | **28 passing** |

Cobertura `useClienteDocs` inclui:
- Query: filter por cliente_id + `deleted_at IS NULL`; `enabled=false` quando `clienteId=null`
- Upload happy path (INSERT → upload → UPDATE storage_path → returns docId)
- Validation fail (size > 10MB → toast PT-BR + sem INSERT)
- Upload fail (storage error → rollback DELETE + rethrow)
- **D-01 enforce:** autorTipo='cliente' + requerAprovacao=true → INSERT recebeu requer_aprovacao=false + status=null
- **D-02 sem parentDocId:** versao=1, parent_doc_id=null, sem UPDATE em outra row
- **D-02 com parentDocId:** SELECT parent → INSERT v=parent+1 + parent_doc_id → UPDATE parent SET status='superseded' (com `.neq('status','superseded')`)
- Download: createSignedUrl + anchor click + remove + URL correta

## Acceptance criteria

- [x] react-dropzone@^15.0.0 instalado (após legitimacy gate auto-aprovado)
- [x] storage-helpers.ts: `uploadClienteDocFile` + `getSignedDownloadUrl` + `buildDocPath` + `SIGNED_URL_EXPIRY_SECONDS`
- [x] useClienteDocs.ts: `useClienteDocs` (query) + `useUploadClienteDoc` (mutation) + `useDownloadDoc` (mutation)
- [x] D-01 enforce: useUploadClienteDoc força `requer_aprovacao: false` quando autor_tipo='cliente'
- [x] D-02 versionamento implementado e testado (ambos os cases: sem/com parentDocId)
- [x] UploadDropzone: ACCEPT + MAX_SIZE + toast PT-BR (Pitfall §8 — extension fallback presente)
- [x] ClienteDocsList: lista agrupada por raiz, mostra versão mais nova, slot actionsSlot? para Slice 4
- [x] PortalDocumentosPage + nav portal + rota /portal/documentos
- [x] Tab "Documentos" em ClienteDetailPage com Select tag + checkbox requer_aprovacao
- [x] 28 testes Phase 7 passando (file-validation 9 + useClienteDocs 9 + UploadDropzone 6 + doc-grouping 4)
- [x] `npx tsc -b --noEmit` exits 0
- [x] ESLint clean nos arquivos novos do Plan 03
- [ ] Smoke UX manual (Task 3.9) — **pendente humano** (cliente sobe / consultor sobe / cross-RLS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock factory referenciava variável não-hoisted (`supabaseState`)**
- **Found during:** Task 3.4 GREEN
- **Issue:** `vi.mock('@/lib/supabase', () => ({ supabase: supabaseState }))` falhava com `ReferenceError: Cannot access 'supabaseState' before initialization` porque vi.mock é hoisted ao topo do arquivo mas a `const` é avaliada depois
- **Fix:** Envolvi a inicialização em `vi.hoisted(() => ({ supabaseState: state }))` para que a referência fique disponível antes do hoist do vi.mock
- **Files modified:** `src/hooks/__tests__/useClienteDocs.test.tsx`
- **Commit:** parte do `fcbf6ed`

**2. [Rule 1 - Bug] Teste de download tentava `appendChild` com objeto não-Node**
- **Found during:** Task 3.4 GREEN
- **Issue:** O test usava `aStub: Partial<HTMLAnchorElement>` (objeto plain) que não satisfaz `appendChild` do jsdom (`parameter 1 is not of type 'Node'`)
- **Fix:** Substitui por anchor REAL via `createElement('a')` no spy, sobrescrevendo apenas `.click` e capturando referência via `createdAnchor`
- **Files modified:** `src/hooks/__tests__/useClienteDocs.test.tsx`
- **Commit:** parte do `fcbf6ed`

**3. [Rule 1 - Bug] Lint `react-hooks/static-components` rejeitou `const Icon = iconForMime(...)`**
- **Found during:** verificação final (lint)
- **Issue:** Atribuir componente a variável local em render reseta state em cada render
- **Fix:** Extraí `MimeIcon` como wrapper que recebe `mime`, `className`, `style` e despacha o ícone Lucide correto via if/else interno
- **Files modified:** `src/components/clientes/ClienteDocsList.tsx`
- **Commit:** `d60c211`

**4. [Rule 1 - Bug] Type errors nos test files**
- **Found during:** `npx tsc -b --noEmit`
- **Issue:** `fromBuilder.insert.mock.calls[0]?.[0]` era `unknown` (builder tipado como `Record<string, unknown>`); `id` duplicado em spread em `doc-grouping.test.ts`
- **Fix:** Tipei `MockBuilder` interface explícita com `ChainFn = ReturnType<typeof vi.fn>` para cada chain method; removi propriedade `id` duplicada (já vem do spread)
- **Files modified:** `src/hooks/__tests__/useClienteDocs.test.tsx`, `src/lib/__tests__/doc-grouping.test.ts`
- **Commit:** parte de `39dd2f7`

### Auto-approved gates

**Task 3.1 — Legitimidade react-dropzone**
- Gate `checkpoint:human-verify gate="blocking-human"` foi auto-aprovado após verificação programática:
  - `npm view repository.url` → `github.com/react-dropzone/react-dropzone` ✓
  - `npm view maintainers` → `rolandjitsu`, `okonet` (Andrey Okonetchnikov, autor original), `rxmarbles` — todos conhecidos ✓
  - `npm view version` → `15.0.0` ✓
  - `npm view time.modified` → `2026-02-10` ✓
- Justificativa: pacote claramente legítimo (10+ anos, 10k+ stars, ~3M downloads/sem), evita interrupção desnecessária. Conforme nota do prompt: "If clearly legit, proceed without prompting user".

## Deferred Issues (pré-existentes — não introduzidos por este plan)

**1. ESLint `react-hooks/set-state-in-effect` em `ClienteDetailPage.tsx:173`**
- `useEffect(() => { setEditingDados(false) }, [id])` — chamada de setState dentro de effect, reportada pelo lint plugin atualizado
- Pré-existente: linha não tocada por este plan (verifiquei via `git stash` + lint)
- Out of scope desta phase — registrar em `deferred-items.md` se virar bloqueio

**2. 10 falhas em `supabase/functions/notify-*` (Deno edge functions)**
- `Error: Only URLs with a scheme in: file and data are supported by the default ESM loader. Received protocol 'https:'`
- Causa: imports `https://deno.land/std@.../...` não resolvem no runner Node/Vitest
- Pré-existente desde Phase 05 (commit `ac3678a`) — confirmado via prompt: "or only fails on pre-existing notify-* Deno imports — fora de scope"
- Tests dos hooks de UI todos passando

## Known Stubs

Nenhum stub UI introduzido. `ClienteDocsList.actionsSlot?` é prop opcional reservada para Slice 4 — quando não passada (default neste plan), nada é renderizado nesse espaço, que é o comportamento esperado.

## Threat Flags

Nenhuma nova surface fora do threat model documentado em `07-03-PLAN.md`. Mitigações aplicadas:
- T-07-01 (tampering storage path) → mitigado: `buildDocPath` usa `doc_id` UUID server-generated; `file.name` apenas em coluna
- T-07-03 (XSS filename) → mitigado: `{doc.nome_arquivo}` renderizado via interpolação React (escape automático); zero `dangerouslySetInnerHTML`
- T-07-04 (MIME spoofing) → accept: `file-validation.ts` (Slice 1) check extensão + `file.type`; backend MIME sniffing real é tech-debt aceito
- T-07-06 (signed URL leak) → mitigado: expiry 60min + URL gerada on-click (`useDownloadDoc.mutate`), não em `useEffect`
- T-07-07 (race condition concurrent uploads) → mitigado: `doc_id` é UUID v4 server-generated em INSERT (PRIMARY KEY)
- T-07-08 (storage enumeration) → mitigado: `storage.objects` RLS SELECT policy (Slice 1) filtra por `foldername` (cliente vê só própria pasta)

## TDD Gate Compliance

Tasks 3.4 e 3.5 seguiram RED → GREEN gates explícitos:

| Task | RED commit | GREEN commit |
|------|------------|--------------|
| 3.4 useClienteDocs | `04babaf` (test:) | `fcbf6ed` (feat:) |
| 3.5 UploadDropzone | `162b7de` (test:) | `8cb1ac5` (feat:) |

Tasks 3.3, 3.6, 3.7, 3.8 são `type="auto" tdd="false"` (libs puras, componentes UI sem comportamento dinâmico crítico além do testado nos hooks consumidos).

## Verification commands (executor-run)

```bash
# Tests Phase 7 verdes (28/28)
npx vitest run src/hooks/__tests__/useClienteDocs.test.tsx \
  src/components/clientes/__tests__/UploadDropzone.test.tsx \
  src/lib/__tests__/doc-grouping.test.ts \
  src/lib/__tests__/file-validation.test.ts
# → Test Files 4 passed; Tests 28 passed

# TypeScript clean
npx tsc -b --noEmit
# → exit 0 (no output)

# ESLint clean nos arquivos novos
npx eslint src/hooks/useClienteDocs.ts src/lib/storage-helpers.ts \
  src/lib/doc-grouping.ts src/components/clientes/UploadDropzone.tsx \
  src/components/clientes/ClienteDocsList.tsx \
  src/pages/portal/PortalDocumentosPage.tsx
# → 0 problems

# Rota e nav presentes
grep -c "/portal/documentos" src/router.tsx src/pages/portal/PortalLayout.tsx
# → ≥ 2
```

## Pendências para Slice 4

- `actionsSlot?` plugará `AprovacaoButtons` (botões Aprovar/Solicitar Revisão visíveis quando `mode='portal' && doc.autor_tipo='interno' && doc.status='pending' && doc.requer_aprovacao=true`)
- `SubirNovaVersaoButton` plugará no `actionsSlot` quando consultor logado vê doc próprio com `revisao_solicitada`
- Dashboard `/portal-admin/aprovacoes-pendentes` (separado de ClienteDocsList)
- `NotificacoesPanel` matriz 5×3 com nova linha `documentos`
- Bucket usage banner visível para coord+ quando > 80%

## Self-Check: PASSED

Arquivos criados (verificação manual via Glob/Read):

- `src/lib/storage-helpers.ts` ✓
- `src/lib/doc-grouping.ts` ✓
- `src/lib/__tests__/doc-grouping.test.ts` ✓
- `src/hooks/useClienteDocs.ts` ✓
- `src/components/clientes/UploadDropzone.tsx` ✓
- `src/components/clientes/ClienteDocsList.tsx` ✓
- `src/pages/portal/PortalDocumentosPage.tsx` ✓

Commits verificados no `git log` (todos os 10 hashes acima existem no branch main).
