---
phase: 07-client-portal-expansion
plan: 04a
type: execute
wave: 4
depends_on: [07-02, 07-03]
files_modified:
  - src/hooks/useClienteDocs.ts
  - src/hooks/__tests__/useClienteDocs.test.tsx
  - src/components/clientes/AprovacaoButtons.tsx
  - src/components/clientes/SolicitarRevisaoModal.tsx
  - src/components/clientes/DocVersionTimeline.tsx
  - src/components/clientes/SubirNovaVersaoButton.tsx
  - src/components/clientes/ClienteDocsList.tsx
  - src/components/clientes/__tests__/AprovacaoButtons.test.tsx
  - src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx
  - src/components/clientes/__tests__/DocVersionTimeline.test.tsx
  - src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx
  - src/components/me/NotificacoesPanel.tsx
autonomous: true
requirements: [PORTAL-03]
user_setup: []

must_haves:
  truths:
    - "Cliente em /portal/documentos vê botões 'Aprovar' / 'Solicitar Revisão' APENAS em docs com autor_tipo='interno' + requer_aprovacao=true + status='pending' (D-01)"
    - "Cliente clica 'Aprovar' → status UPDATE para 'aprovado' → trigger Postgres (Plan 02) dispara → consultor recebe notif multi-canal conforme prefs.documentos"
    - "Cliente clica 'Solicitar Revisão' → modal abre → textarea comentário → confirma → status='revisao_solicitada' + comentario_cliente preenchido → trigger → consultor recebe notif com comentário"
    - "Consultor (autor) vê SubirNovaVersaoButton quando o doc próprio está com status='revisao_solicitada' (BLOCKER #2 D-02 revision iter 2). Click dispara useUploadClienteDoc com parentDocId=doc.id → v2 criada → v1 vira superseded automaticamente."
    - "Histórico de versões: DocVersionTimeline mostra v1 (superseded), v2 (atual), com timestamps + autor + status"
    - "NotificacoesPanel matriz 5×3 — linha 'documentos' adicionada com switches Slack/Email/Push"
    - "4 componentes têm tests automatizados — npm test -- AprovacaoButtons SolicitarRevisaoModal DocVersionTimeline SubirNovaVersaoButton verde (WARNING #3)"
  artifacts:
    - path: "src/hooks/useClienteDocs.ts"
      provides: "+ useAprovarDoc + useSolicitarRevisaoDoc mutations"
      contains: "useAprovarDoc"
    - path: "src/components/clientes/AprovacaoButtons.tsx"
      provides: "Aprovar (CheckCircle2 green) + Solicitar Revisão (MessageSquareWarning amber) — só mostra para cliente em pending+interno+requer_aprovacao"
      contains: "useAprovarDoc"
    - path: "src/components/clientes/SolicitarRevisaoModal.tsx"
      provides: "Dialog com textarea + submit"
      contains: "react-hook-form"
    - path: "src/components/clientes/DocVersionTimeline.tsx"
      provides: "Timeline inline de versões + lembretes"
      contains: "ActivityTimeline pattern"
    - path: "src/components/clientes/SubirNovaVersaoButton.tsx"
      provides: "Botão para consultor subir v2 quando cliente pediu revisão (BLOCKER #2 D-02)"
      contains: "parentDocId"
    - path: "src/components/me/NotificacoesPanel.tsx"
      provides: "Matriz 5x3 (linha documentos adicionada)"
      contains: "documentos"
  key_links:
    - from: "src/components/clientes/AprovacaoButtons.tsx"
      to: "src/hooks/useClienteDocs.ts.useAprovarDoc/useSolicitarRevisaoDoc"
      via: "click handler → mutation"
      pattern: "useAprovarDoc"
    - from: "ClienteDocsList actionsSlot"
      to: "AprovacaoButtons + SubirNovaVersaoButton"
      via: "Slice 3 deixou actionsSlot? prop; Plan 04a plugga AprovacaoButtons (portal) e SubirNovaVersaoButton (crm consultor) quando aplicável"
      pattern: "actionsSlot"
    - from: "src/components/clientes/SubirNovaVersaoButton.tsx"
      to: "src/hooks/useClienteDocs.ts.useUploadClienteDoc"
      via: "click → file picker → mutation com parentDocId=doc.id"
      pattern: "parentDocId"
---

<objective>
**Slice 4a — Aprovação UI + Versionamento D-02 + Matriz 5×3**

Plan 04 original foi splitado (BLOCKER #4 revision iter 2 — 9 tasks + 17 files > size cap). Esta
metade contém todas as peças de UI para o fluxo de aprovação cliente↔consultor:

- Hooks `useAprovarDoc` + `useSolicitarRevisaoDoc`
- `AprovacaoButtons` (cliente aprova/pede revisão)
- `SolicitarRevisaoModal` (textarea comentário)
- `DocVersionTimeline` (histórico v1/v2/v3 inline)
- **`SubirNovaVersaoButton`** (BLOCKER #2 D-02 revision iter 2 — consultor sobe v2 quando cliente pediu revisão; v1 vira superseded automaticamente via mutation Plan 03 Task 3.4)
- Plug em `ClienteDocsList` (actionsSlot + historySlot)
- `NotificacoesPanel` matriz 5×3

Plan 04b (depends_on: [07-04a]) entrega o dashboard administrativo + UAT.

Autonomous: true (sem checkpoint manual — todos os componentes Claude monta).

Output:
- 2 mutations + 4 componentes UI + ClienteDocsList plug + NotificacoesPanel 5×3
- Tests automatizados para os 4 componentes novos
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-client-portal-expansion/07-02-SUMMARY.md
@.planning/phases/07-client-portal-expansion/07-03-SUMMARY.md
@.planning/phases/07-client-portal-expansion/07-CONTEXT.md
@.planning/phases/07-client-portal-expansion/07-RESEARCH.md
@.planning/phases/07-client-portal-expansion/07-PATTERNS.md

@src/hooks/useClienteDocs.ts
@src/hooks/useLeads.ts
@src/components/me/NotificacoesPanel.tsx
@src/components/shared/ActivityTimeline.tsx
@src/components/leads/LostReasonModal.tsx
@src/components/clientes/ClienteDocsList.tsx
@src/lib/query-keys.ts
@src/types/index.ts
</context>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cliente UPDATE cliente_docs.status | RLS WITH CHECK valida cliente_id=perfis.cliente_id E só permite 'aprovado'/'revisao_solicitada' |
| Consultor UPDATE cliente_docs.status='superseded' | Acontece via mutation `useUploadClienteDoc` com parentDocId (Plan 03 Task 3.4 — D-02 fix BLOCKER #2) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-09 | Elevation | UPDATE status por cliente | mitigate | RLS WITH CHECK em cliente_docs_update (Plan 01a migration 037): cliente só muda status para 'aprovado' ou 'revisao_solicitada', e só em docs onde autor_tipo='interno' E requer_aprovacao=true |
| T-07-09b | Elevation | UPDATE comentario_cliente | mitigate | Mesma policy WITH CHECK; cliente só preenche comentario_cliente junto com status='revisao_solicitada' |
| T-07-09c | Elevation | UPDATE status='superseded' por cliente | mitigate | RLS rejeita: superseded só vem de fluxo de versionamento controlado pelo consultor (useUploadClienteDoc com parent_doc_id — Plan 03 Task 3.4 idempotent update) |
| T-07-14 (novo) | Tampering | SubirNovaVersaoButton aparece para usuário errado | mitigate | Componente filtra `autor_tipo === 'interno'` (do doc) + `status === 'revisao_solicitada'` + visível para `perfil.id === doc.autor_id` OR coord+ (via useCurrentRole.atLeast). Mesmo que UI vaze, RLS UPDATE/INSERT (Plan 01a) rejeita |
</threat_model>

<tasks>

<task type="auto" tdd="false">
  <name>Task 4a-1: Estender useClienteDocs.ts com useAprovarDoc + useSolicitarRevisaoDoc</name>
  <files>
    src/hooks/useClienteDocs.ts,
    src/hooks/__tests__/useClienteDocs.test.tsx
  </files>
  <read_first>
    @src/hooks/useClienteDocs.ts
    @src/hooks/useLeads.ts
    @src/lib/query-keys.ts
  </read_first>
  <action>
    Adicionar 2 mutations no final de `src/hooks/useClienteDocs.ts`:

    ```typescript
    export function useAprovarDoc() {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: async ({ docId, clienteId }: { docId: string; clienteId: string }) => {
          const { error } = await supabase
            .from('cliente_docs')
            .update({ status: 'aprovado', comentario_cliente: null })
            .eq('id', docId)
          if (error) throw error
        },
        onSuccess: (_, vars) => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.clienteDocs.byCliente(vars.clienteId) })
          qc.invalidateQueries({ queryKey: QUERY_KEYS.aprovacoesPendentes.all })
          toast.success('Documento aprovado')
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : 'Erro ao aprovar documento'),
      })
    }

    export function useSolicitarRevisaoDoc() {
      const qc = useQueryClient()
      return useMutation({
        mutationFn: async ({ docId, clienteId, comentario }: { docId: string; clienteId: string; comentario: string }) => {
          const { error } = await supabase
            .from('cliente_docs')
            .update({ status: 'revisao_solicitada', comentario_cliente: comentario })
            .eq('id', docId)
          if (error) throw error
        },
        onSuccess: (_, vars) => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.clienteDocs.byCliente(vars.clienteId) })
          qc.invalidateQueries({ queryKey: QUERY_KEYS.aprovacoesPendentes.all })
          toast.success('Revisão solicitada')
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : 'Erro ao solicitar revisão'),
      })
    }
    ```

    Adicionar 2 testes em `useClienteDocs.test.tsx`:
    - useAprovarDoc: chama supabase.update com status='aprovado' + comentario_cliente=null; invalida 2 query keys; toast success
    - useSolicitarRevisaoDoc com comentario "Faltou X": status='revisao_solicitada' + comentario_cliente='Faltou X'; invalida queries; toast success
  </action>
  <verify>
    <automated>npm test -- --run src/hooks/__tests__/useClienteDocs.test.tsx 2>&1 | grep -E "Tests.*passed"</automated>
  </verify>
  <done>
    2 novas mutations exportadas. 2 testes novos passando (total agora 9+ em useClienteDocs).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4a-2: AprovacaoButtons + SolicitarRevisaoModal + DocVersionTimeline + SubirNovaVersaoButton + plug em ClienteDocsList</name>
  <files>
    src/components/clientes/AprovacaoButtons.tsx,
    src/components/clientes/SolicitarRevisaoModal.tsx,
    src/components/clientes/DocVersionTimeline.tsx,
    src/components/clientes/SubirNovaVersaoButton.tsx,
    src/components/clientes/ClienteDocsList.tsx,
    src/components/clientes/__tests__/AprovacaoButtons.test.tsx,
    src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx,
    src/components/clientes/__tests__/DocVersionTimeline.test.tsx,
    src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx
  </files>
  <read_first>
    @src/components/clientes/ClienteDocsList.tsx
    @src/components/shared/ActivityTimeline.tsx
    @src/components/leads/LostReasonModal.tsx
    @src/hooks/useClienteDocs.ts
    @src/hooks/useCurrentRole.ts
    @src/hooks/usePerfis.ts
    @src/components/clientes/__tests__/AprovacaoButtons.test.tsx
    @src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx
    @src/components/clientes/__tests__/DocVersionTimeline.test.tsx
    @src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx
  </read_first>
  <behavior>
    **AprovacaoButtons** tests (popular it.todo do Plan 01b):
    - Render: doc autor_tipo='interno' + requer_aprovacao=true + status='pending' + mode='portal' → 2 botões visíveis (Aprovar, Solicitar revisão)
    - Hidden: mode='crm' OR autor_tipo='cliente' OR status='aprovado' → return null
    - Click Aprovar → useAprovarDoc.mutate chamado com {docId, clienteId}
    - Click Solicitar revisão → SolicitarRevisaoModal abre

    **SolicitarRevisaoModal** tests:
    - Render: textarea + 2 buttons (Cancelar, Enviar)
    - Submit com comentário < 5 chars → zod error visível "Descreva o que precisa..."
    - Submit válido → useSolicitarRevisaoDoc.mutate chamado com {docId, clienteId, comentario}; onClose chamado

    **DocVersionTimeline** tests:
    - Render history vazio → null
    - Render history com 2 entries → 2 items ordenados cronologicamente reverso
    - Click chevron → expande/recolhe

    **SubirNovaVersaoButton** tests (BLOCKER #2 D-02):
    - Render: doc autor_tipo='interno' + status='revisao_solicitada' + user é o autor (perfil.id === doc.autor_id) → botão visível
    - Hidden: status='pending' OR autor_tipo='cliente' OR user diferente E não-coord+ → return null
    - Click → trigger upload com parentDocId=doc.id (via useUploadClienteDoc mock — assert mutate chamado com parentDocId)
  </behavior>
  <action>
    **AprovacaoButtons.tsx:**
    ```tsx
    import { CheckCircle2, MessageSquareWarning } from 'lucide-react'
    import { Button } from '@/components/ui/button'
    import { useAprovarDoc } from '@/hooks/useClienteDocs'
    import type { ClienteDoc } from '@/types'
    import { useState } from 'react'
    import { SolicitarRevisaoModal } from './SolicitarRevisaoModal'

    interface Props {
      doc: ClienteDoc
      mode: 'portal' | 'crm'  // só ativos em portal (cliente decide); crm é read-only
    }

    export function AprovacaoButtons({ doc, mode }: Props) {
      const aprovar = useAprovarDoc()
      const [revisaoOpen, setRevisaoOpen] = useState(false)

      // D-01 + D-03: só mostra se doc do interno, requer aprovação, e status pending
      if (mode !== 'portal') return null
      if (doc.autor_tipo !== 'interno' || !doc.requer_aprovacao || doc.status !== 'pending') return null

      return (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            onClick={() => aprovar.mutate({ docId: doc.id, clienteId: doc.cliente_id })}
            disabled={aprovar.isPending}
            style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRevisaoOpen(true)}
            style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d' }}
          >
            <MessageSquareWarning className="w-4 h-4 mr-1" /> Solicitar revisão
          </Button>

          {revisaoOpen && (
            <SolicitarRevisaoModal
              doc={doc}
              onClose={() => setRevisaoOpen(false)}
            />
          )}
        </div>
      )
    }
    ```

    **SolicitarRevisaoModal.tsx** (espelha `LostReasonModal.tsx` pattern — react-hook-form + zod + Dialog shadcn):
    ```tsx
    import { useForm } from 'react-hook-form'
    import { zodResolver } from '@hookform/resolvers/zod'
    import * as z from 'zod'
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
    import { Textarea } from '@/components/ui/textarea'
    import { Button } from '@/components/ui/button'
    import { Label } from '@/components/ui/label'
    import { useSolicitarRevisaoDoc } from '@/hooks/useClienteDocs'
    import type { ClienteDoc } from '@/types'

    const schema = z.object({
      comentario: z.string().min(5, 'Descreva o que precisa ser ajustado (mínimo 5 caracteres)'),
    })
    type FormData = z.infer<typeof schema>

    export function SolicitarRevisaoModal({ doc, onClose }: { doc: ClienteDoc; onClose: () => void }) {
      const solicitar = useSolicitarRevisaoDoc()
      const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
      })

      const onSubmit = async (data: FormData) => {
        await solicitar.mutateAsync({ docId: doc.id, clienteId: doc.cliente_id, comentario: data.comentario })
        onClose()
      }

      return (
        <Dialog open onOpenChange={onClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar revisão — {doc.nome_arquivo}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label>O que precisa ser ajustado?</Label>
                <Textarea {...register('comentario')} rows={5} placeholder="Descreva o ajuste necessário..." />
                {errors.comentario && <p className="text-xs text-red-500 mt-1">{errors.comentario.message}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={solicitar.isPending}>Enviar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )
    }
    ```

    **DocVersionTimeline.tsx** (PATTERNS §12 + ActivityTimeline pattern — RESEARCH §6 linhas 644-675):
    Componente de dropdown inline para histórico de versões + lembretes:
    - Recebe `history: ClienteDoc[]` (versões anteriores) + opcional `lembretes: Array<{ts: string; perfilNome: string}>`
    - Estado `open` toggle via chevron
    - Lista entries em ordem cronológica reversa
    - Icon mapping: Upload (upload), CheckCircle2 (aprovado), MessageSquareWarning (revisao_solicitada), Bell (lembrete)
    - Implementação completa em RESEARCH §6 linhas 644-675 — copiar literal

    **SubirNovaVersaoButton.tsx (BLOCKER #2 D-02 revision iter 2):**
    ```tsx
    import { useRef } from 'react'
    import { Upload } from 'lucide-react'
    import { Button } from '@/components/ui/button'
    import { useUploadClienteDoc } from '@/hooks/useClienteDocs'
    import { useMeuPerfil } from '@/hooks/usePerfis'
    import { useCurrentRole } from '@/hooks/useCurrentRole'
    import type { ClienteDoc } from '@/types'

    interface Props {
      doc: ClienteDoc
      mode: 'portal' | 'crm'  // só ativo em crm (consultor)
    }

    export function SubirNovaVersaoButton({ doc, mode }: Props) {
      const { data: perfil } = useMeuPerfil()
      const { atLeast } = useCurrentRole()
      const upload = useUploadClienteDoc()
      const inputRef = useRef<HTMLInputElement>(null)

      // D-02: só consultor (autor) ou coord+ pode subir v2 quando cliente pediu revisão
      if (mode !== 'crm') return null
      if (doc.autor_tipo !== 'interno' || doc.status !== 'revisao_solicitada') return null
      if (!perfil) return null
      const isAutor = perfil.id === doc.autor_id
      const isCoordOrAbove = atLeast('coordenador')
      if (!isAutor && !isCoordOrAbove) return null

      const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        upload.mutate({
          clienteId: doc.cliente_id,
          file,
          tag: doc.tag,           // herda tag da versão anterior
          requerAprovacao: true,  // nova versão refaz aprovação
          autorId: perfil.id,
          autorTipo: 'interno',
          parentDocId: doc.id,    // D-02 — Plan 03 Task 3.4 marca parent como superseded
        })
        e.target.value = ''  // reset input
      }

      return (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="w-4 h-4 mr-1" />
            Subir nova versão
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".pdf,.docx,.doc,.odt,.jpg,.jpeg,.png,.webp"
            onChange={handleFile}
          />
        </>
      )
    }
    ```

    **Plug em ClienteDocsList.tsx:** localizar o `actionsSlot?` prop deixado em Slice 3 e adicionar `historySlot?: (history: ClienteDoc[]) => ReactNode`:
    ```tsx
    // No DocCard interno, depois da linha de metadata:
    {historySlot && history.length > 0 && historySlot(history)}
    {actionsSlot && actionsSlot(current)}
    ```

    PortalDocumentosPage e ClienteDetailPage DocsTabConsultor passam o actionsSlot apropriado:
    - PortalDocumentosPage (cliente): `actionsSlot={(doc) => <AprovacaoButtons doc={doc} mode="portal" />}`
    - ClienteDetailPage DocsTabConsultor: `actionsSlot={(doc) => <SubirNovaVersaoButton doc={doc} mode="crm" />}`

    **Tests:** popular os 4 arquivos de teste com os cases descritos em `<behavior>`.
  </action>
  <verify>
    <automated>npm test -- --run src/components/clientes/__tests__/AprovacaoButtons.test.tsx src/components/clientes/__tests__/SolicitarRevisaoModal.test.tsx src/components/clientes/__tests__/DocVersionTimeline.test.tsx src/components/clientes/__tests__/SubirNovaVersaoButton.test.tsx 2>&1 | grep -E "Tests.*passed"</automated>
  </verify>
  <done>
    AprovacaoButtons só renderiza para doc do interno + pending + requer_aprovacao + mode='portal'. SolicitarRevisaoModal usa react-hook-form + zod com validação de 5+ chars. DocVersionTimeline pluga em ClienteDocsList via historySlot. **SubirNovaVersaoButton (BLOCKER #2 D-02) plugado em ClienteDocsList mode='crm' — consultor sobe v2 quando cliente pediu revisão; v1 vira superseded automaticamente via mutation Plan 03 Task 3.4.** 4 arquivos de teste passando (WARNING #3).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4a-3: Estender NotificacoesPanel matriz 5×3 (D-08)</name>
  <files>src/components/me/NotificacoesPanel.tsx</files>
  <read_first>
    @src/components/me/NotificacoesPanel.tsx
    @src/types/index.ts
    @.planning/phases/07-client-portal-expansion/07-RESEARCH.md
  </read_first>
  <action>
    Mudança mecânica (RESEARCH §12 linhas 1011-1031, PATTERNS §Phase 7 aplicação linha 114).

    1. Localizar array `TIPOS` (linha ~22-27) e adicionar 5ª entry:
       ```typescript
       const TIPOS: { id: TipoNotif; label: string; descricao: string }[] = [
         { id: 'tarefa',     label: 'Tarefas',     descricao: '...' },
         { id: 'cadencia',   label: 'Cadência',    descricao: '...' },
         { id: 'renovacao',  label: 'Renovação',   descricao: '...' },
         { id: 'indicacao',  label: 'Indicação',   descricao: '...' },
         { id: 'documentos', label: 'Documentos',  descricao: 'Aprovações + uploads em propostas e contratos' },
       ]
       ```

    2. Localizar `DEFAULT_PREFS` (linha ~29-35) e adicionar 5ª entry:
       ```typescript
       const DEFAULT_PREFS: PreferenciasNotif = {
         tarefa:     { slack: false, email: true, push: false },
         cadencia:   { slack: false, email: true, push: false },
         renovacao:  { slack: false, email: true, push: false },
         indicacao:  { slack: false, email: true, push: false },
         documentos: { slack: false, email: true, push: false },  // NOVO Slice 4a
       }
       ```

    3. Nada mais muda — o JSX já itera sobre TIPOS, então a linha aparece automaticamente. TypeScript já valida que PreferenciasNotif tem `documentos` (Slice 1b estendeu types).

    4. Atualizar componente teste se existir (`src/components/me/__tests__/NotificacoesPanel.test.tsx`) para asserir 5 linhas ao invés de 4.
  </action>
  <verify>
    <automated>grep -c "documentos" src/components/me/NotificacoesPanel.tsx | awk '$1 >= 2 { print "OK" }'</automated>
  </verify>
  <done>
    TIPOS array tem 5 entradas. DEFAULT_PREFS tem documentos. Matriz UI cresceu de 4×3 → 5×3 sem outras mudanças.
  </done>
</task>

</tasks>

<verification>
```bash
# Tests verdes
rtk npm test -- --run src/hooks/__tests__/useClienteDocs.test.tsx src/components/clientes/__tests__ src/components/me

# TS + lint
rtk npx tsc -b
rtk npm run lint -- src/components/clientes src/hooks
```
</verification>

<success_criteria>
- [ ] useAprovarDoc + useSolicitarRevisaoDoc hooks implementados e testados (9+ tests em useClienteDocs)
- [ ] AprovacaoButtons só renderiza para autor='interno' + requer_aprovacao + pending + mode='portal' (D-01 + D-03)
- [ ] SolicitarRevisaoModal: zod schema min(5 chars), Dialog shadcn, mutation success → close
- [ ] DocVersionTimeline plugado em ClienteDocsList via historySlot
- [ ] **SubirNovaVersaoButton implementado e plugado em ClienteDocsList mode='crm' (BLOCKER #2 D-02 revision iter 2)** — consultor (autor OU coord+) sobe v2 quando cliente status='revisao_solicitada'; useUploadClienteDoc chamado com parentDocId=doc.id
- [ ] NotificacoesPanel matriz 5×3 (linha 'documentos' renderiza com 3 switches)
- [ ] 4 arquivos de teste populados (AprovacaoButtons, SolicitarRevisaoModal, DocVersionTimeline, SubirNovaVersaoButton) — WARNING #3 revision iter 2
- [ ] PORTAL-03 UI completo (cliente aprova/pede revisão; consultor sobe v2 quando revisão pedida)
- [ ] Threats T-07-09a/b/c e T-07-14 mitigados conforme threat_model
</success_criteria>

<output>
Create `.planning/phases/07-client-portal-expansion/07-04a-SUMMARY.md`:
- 2 mutations + 4 componentes UI adicionados (paths)
- Confirmação ClienteDocsList agora aceita actionsSlot + historySlot
- Test counts para os 4 componentes
- Confirmação de NotificacoesPanel 5×3
</output>
