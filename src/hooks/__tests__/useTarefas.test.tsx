import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'

let tarefasResp: MockResponse = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() { return createSupabaseMock({ from: { tarefas: tarefasResp } }).from },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import {
  useCreateTarefa,
  useMinhasTarefas,
  useConcluirTarefa,
  useDeleteTarefa,
} from '../useTarefas'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useCreateTarefa', () => {
  beforeEach(() => { tarefasResp = { data: [], error: null }; vi.clearAllMocks() })

  it('TASK-01: cria tarefa associada a lead com entidade_tipo preservado', async () => {
    const novasTarefa = {
      id: 't-1', titulo: 'Ligar para cliente', tipo: 'followup' as const,
      prioridade: 'media' as const, status: 'aberta' as const,
      atribuido_a_id: 'u1', criado_por_id: 'u1',
      entidade_tipo: 'lead' as const, entidade_id: 'lead-123',
      notificar: true, data_vencimento: null, data_conclusao: null, notas: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    tarefasResp = { data: novasTarefa, error: null }
    const { result } = renderHook(() => useCreateTarefa(), { wrapper })
    const input = {
      titulo: 'Ligar para cliente', tipo: 'followup' as const,
      prioridade: 'media' as const, status: 'aberta' as const,
      atribuido_a_id: 'u1', criado_por_id: 'u1',
      entidade_tipo: 'lead' as const, entidade_id: 'lead-123',
      notificar: true, data_vencimento: null, data_conclusao: null, notas: null,
    }
    const data = await result.current.mutateAsync(input)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(data.entidade_tipo).toBe('lead')
    expect(data.entidade_id).toBe('lead-123')
  })

  it('TASK-02: cria tarefa interna com entidade_tipo=null e entidade_id=null', async () => {
    const novaTarefa = {
      id: 't-2', titulo: 'Rever proposta', tipo: 'generica' as const,
      prioridade: 'alta' as const, status: 'aberta' as const,
      atribuido_a_id: 'u1', criado_por_id: 'u1',
      entidade_tipo: null, entidade_id: null,
      notificar: true, data_vencimento: null, data_conclusao: null, notas: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    tarefasResp = { data: novaTarefa, error: null }
    const { result } = renderHook(() => useCreateTarefa(), { wrapper })
    const input = {
      titulo: 'Rever proposta', tipo: 'generica' as const,
      prioridade: 'alta' as const, status: 'aberta' as const,
      atribuido_a_id: 'u1', criado_por_id: 'u1',
      entidade_tipo: null, entidade_id: null,
      notificar: true, data_vencimento: null, data_conclusao: null, notas: null,
    }
    const data = await result.current.mutateAsync(input)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(data.entidade_tipo).toBeNull()
    expect(data.entidade_id).toBeNull()
  })
})

describe('useMinhasTarefas', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('TASK-03: retorna tarefas do usuario via atribuido_a_id', async () => {
    const minhas = [
      { id: 't-1', titulo: 'Follow-up', tipo: 'followup', prioridade: 'media', status: 'aberta', atribuido_a_id: 'user-1', entidade_tipo: null, entidade_id: null, data_vencimento: null, data_conclusao: null, notas: null, criado_por_id: 'user-1', notificar: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ]
    tarefasResp = { data: minhas, error: null }
    const { result } = renderHook(() => useMinhasTarefas('user-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0].atribuido_a_id).toBe('user-1')
  })
})

describe('useConcluirTarefa', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('TASK-04: atualiza status para concluida', async () => {
    const concluida = {
      id: 't-1', titulo: 'Tarefa', tipo: 'generica', prioridade: 'media',
      status: 'concluida', atribuido_a_id: 'u1', criado_por_id: 'u1',
      entidade_tipo: null, entidade_id: null, notificar: true,
      data_vencimento: null, data_conclusao: new Date().toISOString(), notas: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    }
    tarefasResp = { data: concluida, error: null }
    const { result } = renderHook(() => useConcluirTarefa(), { wrapper })
    const data = await result.current.mutateAsync('t-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(data.status).toBe('concluida')
    expect(data.data_conclusao).not.toBeNull()
  })
})

describe('useDeleteTarefa', () => {
  beforeEach(() => { tarefasResp = { data: null, error: null }; vi.clearAllMocks() })

  it('resolve sem erro ao remover tarefa', async () => {
    const { result } = renderHook(() => useDeleteTarefa(), { wrapper })
    await result.current.mutateAsync('t-1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
  })
})

it.todo('TarefaCard esconde botao remover para tarefa alheia quando usuario nao eh coordenador+')
