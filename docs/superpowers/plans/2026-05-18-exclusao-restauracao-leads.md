# Exclusão e Restauração de Leads — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir excluir um lead removendo todos os seus reflexos (tarefas, interações, diagnóstico, indicações, reuniões, objeções) e restaurá-lo pela Auditoria com undo completo.

**Architecture:** Abordagem "lixeira com snapshot" — uma migração nova cria a tabela `leads_lixeira` e dois RPCs `SECURITY DEFINER` (`excluir_lead`, `restaurar_lead`). Excluir serializa o lead + relacionados num snapshot JSONB e apaga de verdade; restaurar re-insere a partir do snapshot com os IDs originais. A UI reaproveita `DeleteConfirmDialog` para excluir e ganha um card "Lixeira de leads" na `AuditoriaPage` para restaurar.

**Tech Stack:** Supabase (PostgreSQL, plpgsql, RLS), React + TypeScript, TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-05-18-exclusao-restauracao-leads-design.md`

---

## Notas de contexto (verificadas no código)

- `QUERY_KEYS.audit_logs.all` já existe; **não** existe `leads_lixeira` — será adicionado.
- O delete é bloqueado quando há cliente vinculado, então nunca haverá cliente "desvinculado" num delete de lead — não é preciso snapshot de vínculo de cliente.
- O trigger `prevent_orphan_indicacao` (migração 025) só dispara em `clientes`/`parceiros`/`perfis`, **não** em `leads` — `DELETE FROM leads` não esbarra nele.
- `DeleteConfirmDialog` já aceita `entidadeTipo="lead"`, já chama `inspecionar_exclusao` e já tem estado de erro.
- `useDeleteLead` existe em `src/hooks/useLeads.ts` mas não está ligado a nenhuma tela.
- Papéis: `consultor` < `coordenador` < `gerente` < `diretor`. Funções DB existentes: `is_interno()`, `is_diretor()`.
- Última migração: `031`. A nova é `032`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `supabase/migrations/032_lixeira_leads.sql` | Tabela `leads_lixeira`, helper `is_coordenador_ou_acima()`, RPCs `excluir_lead`/`restaurar_lead`, RLS, grants | Criar |
| `src/types/index.ts` | Interface `LeadLixeira` | Modificar |
| `src/lib/query-keys.ts` | Chave `leads_lixeira` | Modificar |
| `src/hooks/useLeads.ts` | `useDeleteLead` (rewire), `useLeadsLixeira`, `useRestaurarLead` | Modificar |
| `src/hooks/__tests__/useLeads.test.tsx` | Testes dos hooks | Criar |
| `src/pages/LeadDetailPage.tsx` | Ação "Excluir lead" + `DeleteConfirmDialog` | Modificar |
| `src/pages/AuditoriaPage.tsx` | Card "Lixeira de leads" + ação Restaurar | Modificar |
| `tests/e2e/lead-exclusao.spec.ts` | E2E do round-trip excluir→restaurar | Criar |

## Setup

- [ ] **Criar branch de trabalho**

```bash
rtk git checkout -b feat/exclusao-restauracao-leads
```

---

## Task 1: Migração `032_lixeira_leads.sql`

**Files:**
- Create: `supabase/migrations/032_lixeira_leads.sql`

- [ ] **Step 1: Escrever a migração completa**

Criar o arquivo com este conteúdo exato:

```sql
-- Migration 032: Lixeira de leads — exclusão com snapshot e restauração
--
-- Excluir um lead serializa o lead + reflexos (diagnóstico, interações,
-- tarefas) e os IDs de reuniões/indicações/objeções num snapshot JSONB em
-- leads_lixeira, e então apaga de verdade. Restaurar (coordenador+) re-insere
-- a partir do snapshot preservando os IDs originais.

-- ─── 1. Tabela leads_lixeira ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leads_lixeira (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL,        -- id original; NÃO é FK (o lead não existe mais)
  lead_nome         TEXT,
  lead_empresa      TEXT,
  snapshot          JSONB NOT NULL,
  excluido_por      UUID REFERENCES perfis(id) ON DELETE SET NULL,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  restaurado_em     TIMESTAMPTZ,
  restaurado_por    UUID REFERENCES perfis(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_lixeira_pendentes
  ON leads_lixeira(excluido_em DESC) WHERE restaurado_em IS NULL;

-- ─── 2. Helper de papel ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_coordenador_ou_acima()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE id = auth.uid()
      AND role IN ('coordenador', 'gerente', 'diretor')
  );
$$;

-- ─── 3. RPC excluir_lead ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION excluir_lead(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead       leads%ROWTYPE;
  v_snapshot   JSONB;
  v_lixeira_id UUID;
  v_uid        UUID := auth.uid();
  v_nome       TEXT;
BEGIN
  IF NOT public.is_interno() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado.';
  END IF;

  IF EXISTS (SELECT 1 FROM clientes WHERE lead_id = p_id) THEN
    RAISE EXCEPTION 'Este lead já virou cliente; exclua o cliente, não o lead.';
  END IF;

  SELECT jsonb_build_object(
    'lead',           to_jsonb(v_lead),
    'diagnostico',    (SELECT to_jsonb(d) FROM diagnosticos d WHERE d.lead_id = p_id),
    'interacoes',     COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM interacoes_lead i WHERE i.lead_id = p_id), '[]'::jsonb),
    'tarefas',        COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM tarefas t WHERE t.entidade_tipo = 'lead' AND t.entidade_id = p_id), '[]'::jsonb),
    'reunioes_ids',   COALESCE((SELECT jsonb_agg(r.id) FROM reunioes r WHERE r.lead_id = p_id), '[]'::jsonb),
    'indicacoes_ids', COALESCE((SELECT jsonb_agg(ind.id) FROM indicacoes ind WHERE ind.lead_id = p_id), '[]'::jsonb),
    'objecoes_ids',   COALESCE((SELECT jsonb_agg(o.id) FROM objecoes o WHERE o.origem_lead_id = p_id), '[]'::jsonb)
  ) INTO v_snapshot;

  SELECT nome INTO v_nome FROM perfis WHERE id = v_uid;

  INSERT INTO leads_lixeira (lead_id, lead_nome, lead_empresa, snapshot, excluido_por, excluido_por_nome)
  VALUES (p_id, v_lead.nome, v_lead.empresa, v_snapshot, v_uid, v_nome)
  RETURNING id INTO v_lixeira_id;

  -- Cascade apaga diagnóstico + interações; trigger 025 apaga tarefas;
  -- reuniões/indicações/objeções têm o lead_id zerado por SET NULL.
  DELETE FROM leads WHERE id = p_id;

  INSERT INTO audit_logs (tabela, registro_id, acao, valor_antes, usuario)
  VALUES ('leads', p_id, 'excluido', to_jsonb(v_lead), v_nome);

  RETURN v_lixeira_id;
END;
$$;

-- ─── 4. RPC restaurar_lead ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION restaurar_lead(p_lixeira_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     leads_lixeira%ROWTYPE;
  v_snap    JSONB;
  v_lead_id UUID;
  v_uid     UUID := auth.uid();
  v_nome    TEXT;
BEGIN
  IF NOT public.is_coordenador_ou_acima() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM leads_lixeira WHERE id = p_lixeira_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro de lixeira não encontrado.';
  END IF;
  IF v_row.restaurado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este lead já foi restaurado.';
  END IF;

  v_snap    := v_row.snapshot;
  v_lead_id := v_row.lead_id;

  IF EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id) THEN
    RAISE EXCEPTION 'O lead já existe; não é possível restaurar.';
  END IF;

  INSERT INTO leads SELECT * FROM jsonb_populate_record(NULL::leads, v_snap->'lead');

  IF v_snap->'diagnostico' IS NOT NULL AND jsonb_typeof(v_snap->'diagnostico') = 'object' THEN
    INSERT INTO diagnosticos
      SELECT * FROM jsonb_populate_record(NULL::diagnosticos, v_snap->'diagnostico');
  END IF;

  INSERT INTO interacoes_lead
    SELECT * FROM jsonb_populate_recordset(NULL::interacoes_lead, v_snap->'interacoes');

  INSERT INTO tarefas
    SELECT * FROM jsonb_populate_recordset(NULL::tarefas, v_snap->'tarefas');

  -- Re-vínculo: registros que já não existem não casam no WHERE e são ignorados.
  UPDATE reunioes   SET lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'reunioes_ids')::uuid);
  UPDATE indicacoes SET lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'indicacoes_ids')::uuid);
  UPDATE objecoes   SET origem_lead_id = v_lead_id
    WHERE id IN (SELECT jsonb_array_elements_text(v_snap->'objecoes_ids')::uuid);

  SELECT nome INTO v_nome FROM perfis WHERE id = v_uid;

  UPDATE leads_lixeira
    SET restaurado_em = now(), restaurado_por = v_uid
    WHERE id = p_lixeira_id;

  INSERT INTO audit_logs (tabela, registro_id, acao, usuario)
  VALUES ('leads', v_lead_id, 'restaurado', v_nome);

  RETURN v_lead_id;
END;
$$;

-- ─── 5. RLS e grants ─────────────────────────────────────────────────────────

ALTER TABLE leads_lixeira ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_lixeira_select_internos ON leads_lixeira;
CREATE POLICY leads_lixeira_select_internos ON leads_lixeira
  FOR SELECT USING (public.is_interno());
-- Sem policy de INSERT/UPDATE/DELETE: gravação só via RPC SECURITY DEFINER.

GRANT SELECT ON leads_lixeira TO authenticated;
GRANT EXECUTE ON FUNCTION is_coordenador_ou_acima()   TO authenticated;
GRANT EXECUTE ON FUNCTION excluir_lead(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION restaurar_lead(UUID)        TO authenticated;
```

- [ ] **Step 2: Aplicar a migração**

O Gabriel aplica migrações **colando o SQL no SQL Editor do painel Supabase** (não usa `supabase db push`). O agente NÃO executa este passo — deve pausar e pedir que o usuário cole o conteúdo de `032_lixeira_leads.sql` no SQL Editor e confirme a execução.
Expected: aplica sem erro de SQL.

- [ ] **Step 3: Verificar round-trip manualmente**

No SQL Editor, escolher um `lead_id` de teste com diagnóstico/tarefas e rodar:

```sql
-- exclui
SELECT excluir_lead('<LEAD_ID>');
-- confere: lead sumiu, lixeira tem 1 linha pendente
SELECT count(*) FROM leads WHERE id = '<LEAD_ID>';            -- 0
SELECT id, snapshot->'lead'->>'nome' FROM leads_lixeira
  WHERE lead_id = '<LEAD_ID>' AND restaurado_em IS NULL;       -- 1 linha
-- restaura
SELECT restaurar_lead('<LIXEIRA_ID>');
-- confere: lead voltou, diagnóstico/interações de volta
SELECT count(*) FROM leads WHERE id = '<LEAD_ID>';            -- 1
SELECT count(*) FROM diagnosticos WHERE lead_id = '<LEAD_ID>';
```
Expected: contagens conforme comentários; segunda chamada de `restaurar_lead` no mesmo id falha com "já foi restaurado".

- [ ] **Step 4: Commit**

```bash
rtk git add supabase/migrations/032_lixeira_leads.sql
rtk git commit -m "feat(db): migração 032 — lixeira de leads (excluir_lead/restaurar_lead)"
```

---

## Task 2: Tipo `LeadLixeira` e query key

**Files:**
- Modify: `src/types/index.ts` (após a interface `AuditLog`, ~linha 312)
- Modify: `src/lib/query-keys.ts` (objeto `QUERY_KEYS`)

- [ ] **Step 1: Adicionar a interface `LeadLixeira`**

Em `src/types/index.ts`, logo após a interface `AuditLog`:

```typescript
export interface LeadLixeira {
  id: string
  lead_id: string
  lead_nome?: string | null
  lead_empresa?: string | null
  snapshot: Record<string, unknown>
  excluido_por?: string | null
  excluido_por_nome?: string | null
  excluido_em: string
  restaurado_em?: string | null
  restaurado_por?: string | null
}
```

- [ ] **Step 2: Adicionar a query key**

Em `src/lib/query-keys.ts`, dentro de `QUERY_KEYS`, após o bloco `audit_logs`:

```typescript
  leads_lixeira: {
    all: ['leads_lixeira'] as const,
  },
```

- [ ] **Step 3: Verificar compilação**

Run: `rtk npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
rtk git add src/types/index.ts src/lib/query-keys.ts
rtk git commit -m "feat: tipo LeadLixeira e query key leads_lixeira"
```

---

## Task 3: Rewire `useDeleteLead` para o RPC

**Files:**
- Modify: `src/hooks/useLeads.ts:118-130` (função `useDeleteLead`)
- Test: `src/hooks/__tests__/useLeads.test.tsx` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/hooks/__tests__/useLeads.test.tsx` (espelhando `useObjecoes.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'

let rpcResp: Record<string, MockResponse> = {}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() { return createSupabaseMock().from },
    get rpc() { return createSupabaseMock({ rpc: rpcResp }).rpc },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useDeleteLead } from '../useLeads'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useDeleteLead', () => {
  beforeEach(() => { rpcResp = {}; vi.clearAllMocks() })

  it('resolve quando o RPC excluir_lead não retorna erro', async () => {
    rpcResp = { excluir_lead: { data: 'lixeira-1', error: null } }
    const { result } = renderHook(() => useDeleteLead(), { wrapper })
    await result.current.mutateAsync('lead-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('rejeita quando o RPC retorna erro', async () => {
    rpcResp = { excluir_lead: { data: null, error: { message: 'Este lead já virou cliente; exclua o cliente, não o lead.' } } }
    const { result } = renderHook(() => useDeleteLead(), { wrapper })
    await expect(result.current.mutateAsync('lead-1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `rtk npx vitest run src/hooks/__tests__/useLeads.test.tsx`
Expected: FAIL — o `useDeleteLead` atual chama `.from('leads').delete()`, não `rpc('excluir_lead')`, então o teste de erro não rejeita.

- [ ] **Step 3: Reescrever `useDeleteLead`**

Substituir a função `useDeleteLead` em `src/hooks/useLeads.ts`:

```typescript
export function useDeleteLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('excluir_lead', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.audit_logs.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads_lixeira.all })
      toast.success('Lead removido e enviado para a lixeira.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao remover lead'),
  })
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `rtk npx vitest run src/hooks/__tests__/useLeads.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
rtk git add src/hooks/useLeads.ts src/hooks/__tests__/useLeads.test.tsx
rtk git commit -m "feat: useDeleteLead usa RPC excluir_lead"
```

---

## Task 4: Hooks `useLeadsLixeira` e `useRestaurarLead`

**Files:**
- Modify: `src/hooks/useLeads.ts` (adicionar ao final)
- Test: `src/hooks/__tests__/useLeads.test.tsx` (acrescentar)

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `describe` em `useLeads.test.tsx` (e ajustar o mock de `from` para aceitar `leads_lixeira`):

```tsx
// no topo, junto dos outros lets:
let lixeiraResp: MockResponse = { data: [], error: null }
// no vi.mock de supabase, trocar o getter `from` por:
//   get from() { return createSupabaseMock({ from: { leads_lixeira: lixeiraResp } }).from },

import { useLeadsLixeira, useRestaurarLead } from '../useLeads'

describe('useLeadsLixeira', () => {
  beforeEach(() => { lixeiraResp = { data: [], error: null }; vi.clearAllMocks() })

  it('lista a lixeira pendente', async () => {
    lixeiraResp = { data: [{ id: 'lx1', lead_id: 'l1', lead_nome: 'Padaria', excluido_em: '2026-05-18' }], error: null }
    const { result } = renderHook(() => useLeadsLixeira(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })
})

describe('useRestaurarLead', () => {
  beforeEach(() => { rpcResp = {}; vi.clearAllMocks() })

  it('resolve quando restaurar_lead não retorna erro', async () => {
    rpcResp = { restaurar_lead: { data: 'l1', error: null } }
    const { result } = renderHook(() => useRestaurarLead(), { wrapper })
    await result.current.mutateAsync('lx1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })

  it('rejeita quando restaurar_lead retorna erro', async () => {
    rpcResp = { restaurar_lead: { data: null, error: { message: 'Este lead já foi restaurado.' } } }
    const { result } = renderHook(() => useRestaurarLead(), { wrapper })
    await expect(result.current.mutateAsync('lx1')).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `rtk npx vitest run src/hooks/__tests__/useLeads.test.tsx`
Expected: FAIL — `useLeadsLixeira` e `useRestaurarLead` não existem.

- [ ] **Step 3: Implementar os hooks**

Acrescentar ao final de `src/hooks/useLeads.ts` (e importar `LeadLixeira` de `@/types`):

```typescript
export function useLeadsLixeira() {
  return useQuery({
    queryKey: QUERY_KEYS.leads_lixeira.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_lixeira')
        .select('*')
        .is('restaurado_em', null)
        .order('excluido_em', { ascending: false })
      if (error) throw error
      return data as LeadLixeira[]
    },
  })
}

export function useRestaurarLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lixeiraId: string) => {
      const { error } = await supabase.rpc('restaurar_lead', { p_lixeira_id: lixeiraId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.audit_logs.all })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads_lixeira.all })
      toast.success('Lead restaurado.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar lead'),
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `rtk npx vitest run src/hooks/__tests__/useLeads.test.tsx`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
rtk git add src/hooks/useLeads.ts src/hooks/__tests__/useLeads.test.tsx
rtk git commit -m "feat: hooks useLeadsLixeira e useRestaurarLead"
```

---

## Task 5: Ação "Excluir lead" na `LeadDetailPage`

> **Nota de escopo:** a spec (seção 8.2) cita a ação "Excluir" também na `LeadsPage`. Este plano a concentra na `LeadDetailPage` de propósito — a `LeadsPage` renderiza leads via `KanbanBoard` (cards), onde uma ação destrutiva inline é mais arriscada; o detalhe do lead é o lugar natural. O round-trip continua coberto. Se a paridade estrita com a spec for exigida, adicionar depois um item de menu no card do `KanbanBoard`.

**Files:**
- Modify: `src/pages/LeadDetailPage.tsx`

- [ ] **Step 1: Adicionar imports, hook e estado**

No topo de `src/pages/LeadDetailPage.tsx`:
- `import { useLeads, useUpdateLead, useDeleteLead } from '@/hooks/useLeads'`
- `import { DeleteConfirmDialog } from '@/components/shared/DeleteConfirmDialog'`
- adicionar `Trash2` ao import de `lucide-react`.

No corpo do componente:

```typescript
  const deleteLead = useDeleteLead()
  const [deleteOpen, setDeleteOpen] = useState(false)

  async function handleConfirmDelete() {
    if (!lead) return
    try {
      await deleteLead.mutateAsync(lead.id)
      navigate('/leads')
    } catch {
      // erro já exibido via toast pelo hook; mantém o usuário na página
    }
  }
```

- [ ] **Step 2: Adicionar o botão no header**

No header (junto do botão "voltar", ~linha 50), adicionar à direita:

```tsx
<Button
  variant="ghost"
  onClick={() => setDeleteOpen(true)}
  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1.5"
>
  <Trash2 className="w-4 h-4" /> Excluir lead
</Button>
```

- [ ] **Step 3: Renderizar o `DeleteConfirmDialog`**

Antes do fechamento do JSX raiz do componente:

```tsx
<DeleteConfirmDialog
  open={deleteOpen}
  onClose={() => setDeleteOpen(false)}
  entidadeTipo="lead"
  entidadeId={lead?.id ?? null}
  entidadeLabel={lead ? `${lead.nome} (${lead.empresa})` : ''}
  onConfirm={handleConfirmDelete}
/>
```

- [ ] **Step 4: Verificar build e dev server**

Run: `rtk npx tsc -b`
Expected: sem erros. Subir `npm run dev` e abrir um lead — o botão "Excluir lead" aparece; clicar abre o diálogo com a prévia de impacto.

- [ ] **Step 5: Commit**

```bash
rtk git add src/pages/LeadDetailPage.tsx
rtk git commit -m "feat: ação Excluir lead na LeadDetailPage"
```

---

## Task 6: Card "Lixeira de leads" na `AuditoriaPage`

**Files:**
- Modify: `src/pages/AuditoriaPage.tsx`

- [ ] **Step 1: Adicionar imports e hooks**

No topo de `src/pages/AuditoriaPage.tsx`:
- `import { useLeadsLixeira, useRestaurarLead } from '@/hooks/useLeads'`
- `import { useCurrentRole } from '@/hooks/useCurrentRole'`
- `import { Button } from '@/components/ui/button'`
- adicionar `RotateCcw, Trash2` ao import de `lucide-react`.

Acrescentar `'restaurado'` ao mapa `ACAO_COLORS`:

```typescript
  restaurado: { bg: 'rgba(16,185,129,0.15)', color: '#34d399' },
```

No corpo do componente:

```typescript
  const { data: lixeira } = useLeadsLixeira()
  const restaurar = useRestaurarLead()
  const { isCoordenadorOrAcima } = useCurrentRole()
  const pendentes = lixeira ?? []
```

- [ ] **Step 2: Renderizar o card da lixeira acima do log**

Logo antes do `<Card>` do log de atividades, adicionar:

```tsx
{pendentes.length > 0 && (
  <Card className="mb-6">
    <CardHeader>
      <CardTitle className="text-sm flex items-center gap-2">
        <Trash2 className="w-4 h-4" />
        Lixeira de leads ({pendentes.length})
      </CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <div className="divide-y">
        {pendentes.map(item => (
          <div key={item.id} className="flex items-center gap-4 px-5 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-fg2 font-medium truncate">
                {item.lead_nome ?? '—'}
                {item.lead_empresa && <span className="text-fg4"> · {item.lead_empresa}</span>}
              </p>
              <p className="text-xs text-fg4">
                excluído por {item.excluido_por_nome ?? '—'} · {formatDate(item.excluido_em)}
              </p>
            </div>
            {isCoordenadorOrAcima && (
              <Button
                variant="ghost"
                className="gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                disabled={restaurar.isPending}
                onClick={() => restaurar.mutate(item.id)}
              >
                <RotateCcw className="w-4 h-4" /> Restaurar
              </Button>
            )}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Verificar build**

Run: `rtk npx tsc -b`
Expected: sem erros. No dev server, a `AuditoriaPage` mostra o card "Lixeira de leads" quando há pendências; o botão "Restaurar" só aparece para coordenador+.

- [ ] **Step 4: Commit**

```bash
rtk git add src/pages/AuditoriaPage.tsx
rtk git commit -m "feat: card Lixeira de leads com restauração na Auditoria"
```

---

## Task 7: E2E do round-trip

**Files:**
- Create: `tests/e2e/lead-exclusao.spec.ts`

- [ ] **Step 1: Conferir o padrão de e2e existente**

Run: `rtk ls tests/e2e` e ler um spec existente para reaproveitar login/seleção de ambiente (`playwright.config.ts`, helpers).

- [ ] **Step 2: Escrever o spec e2e**

Criar `tests/e2e/lead-exclusao.spec.ts` cobrindo: logar como interno → abrir um lead na `LeadsPage` → clicar "Excluir lead" → confirmar no diálogo → verificar que o lead sumiu da lista → ir para `/auditoria` → conferir o lead no card "Lixeira de leads" → clicar "Restaurar" → voltar a `/leads` e confirmar que o lead reapareceu. Seguir o padrão de login/seletores dos specs existentes.

- [ ] **Step 3: Rodar o e2e**

Run: `rtk npx playwright test tests/e2e/lead-exclusao.spec.ts`
Expected: PASS.

- [ ] **Step 4: Rodar a suíte completa de unit**

Run: `rtk npx vitest run`
Expected: PASS (sem regressões).

- [ ] **Step 5: Commit**

```bash
rtk git add tests/e2e/lead-exclusao.spec.ts
rtk git commit -m "test(e2e): round-trip exclusão e restauração de lead"
```

---

## Encerramento

- [ ] **Verificação final:** `rtk npx tsc -b` + `rtk npx vitest run` + `rtk npm run lint` — tudo verde.
- [ ] Atualizar o `RELATORIO-TESTES.md` se o projeto registra novas suítes lá.
- [ ] Abrir PR de `feat/exclusao-restauracao-leads` para `main` (apenas quando o usuário pedir).

## Riscos e observações

- **`inspecionar_exclusao` × bloqueio de cliente:** se o lead já virou cliente, a prévia do `DeleteConfirmDialog` ainda mostra "clientes perderão o lead de origem", mas o RPC `excluir_lead` bloqueia na confirmação (erro via toast). Comportamento aceitável; não alterar `inspecionar_exclusao` (fora de escopo).
- **`jsonb_populate_record` e schema:** a restauração assume que o schema das tabelas (`leads`, `diagnosticos`, etc.) não mudou de forma incompatível desde a exclusão. Para retenção infinita é um risco teórico; não tratado neste plano.
- **Migração:** confirmar com o usuário como as migrações são aplicadas no ambiente (CLI `supabase db push` vs. SQL Editor) antes da Task 1, Step 2.
