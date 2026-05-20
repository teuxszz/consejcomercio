import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'

let rpcResp: Record<string, MockResponse> = {}
let lixeiraResp: MockResponse = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() { return createSupabaseMock({ from: { leads_lixeira: lixeiraResp } }).from },
    get rpc() { return createSupabaseMock({ rpc: rpcResp }).rpc },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useDeleteLead, useLeadsLixeira, useRestaurarLead } from '../useLeads'

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
