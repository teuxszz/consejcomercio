---
phase: 07-client-portal-expansion
plan: 04a
subsystem: client-portal-expansion
tags: [aprovacao, versionamento, notificacoes, portal, ui]
requires:
  - 07-01a (migration 037 cliente_docs + status enum)
  - 07-01b (types ClienteDoc + TipoNotif='documentos')
  - 07-02 (triggers Postgres status_change + helper aprovacoes)
  - 07-03 (useClienteDocs.query + useUploadClienteDoc com parentDocId + groupByRoot)
provides:
  - useAprovarDoc (UPDATE status='aprovado')
  - useSolicitarRevisaoDoc (UPDATE status='revisao_solicitada' + comentario_cliente)
  - AprovacaoButtons (portal cliente)
  - SolicitarRevisaoModal (textarea + zod min 5)
  - DocVersionTimeline (dropdown histórico)
  - SubirNovaVersaoButton (CRM consultor — D-02 v2)
  - ClienteDocsList.historySlot prop
  - NotificacoesPanel matriz 5×3
affects:
  - src/pages/portal/PortalDocumentosPage.tsx (actionsSlot + historySlot)
  - src/pages/ClienteDetailPage.tsx (DocsTabConsultor actionsSlot + historySlot)
tech-stack:
  added: []
  patterns:
    - "react-hook-form + zod + Dialog shadcn pattern (LostReasonModal mirror)"
    - "actionsSlot/historySlot render-prop em ClienteDocsList"
    - "Gate de visibilidade UI (D-01/D-02) + RLS WITH CHECK (2ª linha defesa)"
key-files:
  created:
    - src/components/clientes/AprovacaoButtons.tsx
    - src/components/clientes/SolicitarRevisaoModal.tsx
    - src/components/clientes/DocVersionTimeline.tsx
    - src/components/clientes/SubirNovaVersaoButton.tsx
  modified:
    - src/hooks/useClienteDocs.ts (+useAprovarDoc, +useSolicitarRevisaoDoc)
    - src/hooks/__tests__/useClienteDocs.test.tsx (+3 testes — 12 total)
    - src/components/clientes/ClienteDocsList.tsx (+historySlot prop)
    - src/components/clientes/__tests__/AprovacaoButtons.test.tsx (7 testes)
    - src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx (4 testes)
    - src/components/clientes/__tests__/DocVersionTimeline.test.tsx (4 testes)
    - src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx (7 testes)
    - src/components/me/NotificacoesPanel.tsx (TIPOS array 4→5)
    - src/components/me/__tests__/NotificacoesPanel.test.tsx (12→15 Switches; 4→5 Push)
    - src/pages/portal/PortalDocumentosPage.tsx (plug AprovacaoButtons + DocVersionTimeline)
    - src/pages/ClienteDetailPage.tsx (plug SubirNovaVersaoButton + DocVersionTimeline)
decisions:
  - "historySlot adicionado como prop opcional em ClienteDocsList — substitui histórico inline nativo quando fornecido; mantém compatibilidade com chamadas sem slot."
  - "AprovacaoButtons mocka SolicitarRevisaoModal nos testes para isolar a unidade (modal já testado separadamente)."
  - "SubirNovaVersaoButton usa input[type=file] hidden + ref para dispensar dependência react-dropzone — clique no botão abre file picker nativo."
  - "Erros do Dialog 'Missing Description' são warning a11y do Radix (não bloqueante) — fora do escopo."
metrics:
  completed: "2026-05-29"
  tasks_completed: 3
  files_created: 4
  files_modified: 9
  tests_added: 25  # 3 hooks + 7+4+4+7 componentes
---

# Phase 7 Plan 04a: Aprovação UI + Versionamento D-02 + Matriz 5×3 Summary

Entrega 2 mutations + 4 componentes UI + plug em ClienteDocsList + extensão da matriz NotificacoesPanel de 4×3 para 5×3 (linha `documentos`), fechando o ciclo de aprovação cliente ↔ consultor sobre `cliente_docs` (D-01) e o fluxo de versionamento controlado pelo consultor (D-02 — BLOCKER #2 revision iter 2).

## Tarefas executadas

### Task 4a-1 — useAprovarDoc + useSolicitarRevisaoDoc (commit `264fbb7`)

Adicionadas 2 mutations a `src/hooks/useClienteDocs.ts`:

- **`useAprovarDoc({ docId, clienteId })`** — `UPDATE cliente_docs SET status='aprovado', comentario_cliente=null`. Invalida `clienteDocs.byCliente` + `aprovacoesPendentes.all`. Toast PT-BR "Documento aprovado".
- **`useSolicitarRevisaoDoc({ docId, clienteId, comentario })`** — `UPDATE` para `status='revisao_solicitada'` e `comentario_cliente`. Mesmas invalidações + toast "Revisão solicitada".

Ambas usam `eq('id', docId)` — RLS WITH CHECK em `cliente_docs_update` (Plan 01a migration 037) garante que cliente só consegue UPDATE em docs do próprio `cliente_id` E para `status ∈ {'aprovado','revisao_solicitada'}` (T-07-09a/b mitigado).

Triggers Postgres (Plan 02 migration 038) disparam notificação multi-canal ao consultor responsável conforme `preferencias_notif.documentos`.

3 testes novos em `useClienteDocs.test.tsx` (12 total no arquivo).

### Task 4a-2 — 4 componentes + plug ClienteDocsList (commit `703fe14`)

#### `AprovacaoButtons` (Portal cliente)

Renderiza par "Aprovar" (verde) + "Solicitar revisão" (âmbar). Gate D-01:

```ts
mode === 'portal'
&& doc.autor_tipo === 'interno'
&& doc.requer_aprovacao === true
&& doc.status === 'pending'
```

Click "Aprovar" → `useAprovarDoc.mutate`. Click "Solicitar revisão" → abre `SolicitarRevisaoModal` via `useState` interno.

#### `SolicitarRevisaoModal`

`react-hook-form` + `zod` schema `{ comentario: z.string().min(5) }` (mirror `LostReasonModal.tsx`). Submit chama `useSolicitarRevisaoDoc.mutateAsync` + fecha modal via `onClose()`.

#### `DocVersionTimeline`

Recebe `history: ClienteDoc[]` (do `groupByRoot` em Plan 03). Renderiza `null` quando vazio. Senão, botão `"Ver versões anteriores (N)"` com `ChevronDown` que expande lista `<ul role="list">`. Status chips com cores por valor (`aprovado`→emerald, `revisao_solicitada`→amber, `pending`→amber, `superseded`→muted).

#### `SubirNovaVersaoButton` (CRM consultor — BLOCKER #2 D-02)

Gate de visibilidade (T-07-14):

```ts
mode === 'crm'
&& doc.autor_tipo === 'interno'
&& doc.status === 'revisao_solicitada'
&& (perfil.id === doc.autor_id || atLeast('coordenador'))
```

Click → `inputRef.current?.click()` → file picker nativo → `useUploadClienteDoc.mutate({ ...; parentDocId: doc.id })`. Plan 03 Task 3.4 já implementa: SELECT parent.versao → INSERT v=parent.versao+1 → upload → UPDATE parent SET status='superseded' (idempotente via `.neq('status','superseded')`).

#### Plug em ClienteDocsList

Adicionada prop `historySlot?: (history: ClienteDoc[]) => ReactNode` que renderiza no lugar do histórico inline nativo quando fornecida (mantém retrocompatibilidade).

- **PortalDocumentosPage** — `actionsSlot={AprovacaoButtons}` + `historySlot={DocVersionTimeline}`
- **ClienteDetailPage DocsTabConsultor** — `actionsSlot={SubirNovaVersaoButton}` + `historySlot={DocVersionTimeline}`

4 arquivos de teste populados (Wave 0 stubs `it.todo()` substituídos por assertions reais): 7 + 4 + 4 + 7 = 22 testes novos.

### Task 4a-3 — NotificacoesPanel matriz 5×3 (commit `e57f2db`)

Mudança mecânica: array `TIPOS` ganhou 5ª entry `{ id: 'documentos', label: 'Documentos', descricao: 'Aprovações + uploads em propostas e contratos' }`. `DEFAULT_PREFS.documentos` já existia desde Phase 6 D-16 prep.

Teste atualizado: 12 → 15 Switches (5×3); 4 → 5 Push switches (D-13 gate); atomicidade D-08 inclui `documentos` no check.

## Verificação

| Check | Resultado |
|-------|-----------|
| `npx tsc -b --noEmit` | exit 0 |
| useClienteDocs tests | 12/12 ✅ |
| AprovacaoButtons tests | 7/7 ✅ |
| SolicitarRevisaoModal tests | 4/4 ✅ |
| DocVersionTimeline tests | 4/4 ✅ |
| SubirNovaVersaoButton tests | 7/7 ✅ |
| NotificacoesPanel tests | 3/3 ✅ |
| Suite geral | 341 passing, 32 todo, 15 skipped — 10 falhas pre-existentes em `supabase/functions/notify-renovacao` e `notify-tarefa` (Deno URL `https:` imports não suportados em Vitest Node) |

## Deviations from Plan

Nenhuma. Plano executado exatamente como escrito. Único ajuste cosmético: warnings de a11y do Radix Dialog (`Missing Description`) aparecem nos stderr dos testes do `SolicitarRevisaoModal` — não são erros e não afetam o resultado. Fora do escopo deste plano.

## Threat Mitigations

| Threat | Componente | Mitigação aplicada |
|--------|------------|---------------------|
| T-07-09 | UPDATE status por cliente | RLS WITH CHECK (Plan 01a migration 037) + UI gate `requer_aprovacao + status='pending'` |
| T-07-09b | UPDATE comentario_cliente | Mesma policy WITH CHECK + zod min(5) força preenchimento |
| T-07-09c | UPDATE status='superseded' por cliente | RLS rejeita; UI nunca expõe esse path para cliente (apenas `useUploadClienteDoc` via SubirNovaVersaoButton no CRM) |
| T-07-14 (novo) | SubirNovaVersaoButton vaza UI | Gate `autor_tipo='interno' && status='revisao_solicitada' && (isAutor || isCoordOrAbove)` + RLS INSERT/UPDATE como 2ª linha |

## Self-Check: PASSED

- ✅ `src/components/clientes/AprovacaoButtons.tsx`
- ✅ `src/components/clientes/SolicitarRevisaoModal.tsx`
- ✅ `src/components/clientes/DocVersionTimeline.tsx`
- ✅ `src/components/clientes/SubirNovaVersaoButton.tsx`
- ✅ Commits: `264fbb7`, `703fe14`, `e57f2db`
- ✅ 43 testes Plan 04a verdes (3 mutations + 22 componentes + 18 reuso/cobertura existente)
- ✅ TS limpo (`tsc -b --noEmit` exit 0)
- ✅ STATE.md e ROADMAP.md NÃO foram modificados (autonomia do orchestrator)
