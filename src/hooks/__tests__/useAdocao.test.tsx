import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'

let auditLogsResp: MockResponse = { data: [], error: null }
let leadsResp:     MockResponse = { data: [], error: null }
let tarefasResp:   MockResponse = { data: [], error: null }
let perfisResp:    MockResponse = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() {
      return createSupabaseMock({
        from: {
          audit_logs: auditLogsResp,
          leads:      leadsResp,
          tarefas:    tarefasResp,
          perfis:     perfisResp,
        },
      }).from
    },
  },
}))

import { useAdocaoLogins, useLeadsEsquecidos, useAdocaoAtividade } from '../useAdocao'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useAdocaoLogins', () => {
  beforeEach(() => { auditLogsResp = { data: [], error: null }; vi.clearAllMocks() })

  it('retorna logins de audit_logs com acao=login dos ultimos 7 dias', async () => {
    auditLogsResp = {
      data: [{ usuario: 'joao@consej.com', registro_id: 'p-1', created_at: new Date().toISOString() }],
      error: null,
    }
    const { result } = renderHook(() => useAdocaoLogins(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0].usuario).toBe('joao@consej.com')
  })
})

describe('useLeadsEsquecidos', () => {
  beforeEach(() => { leadsResp = { data: [], error: null }; vi.clearAllMocks() })

  it('retorna leads com status ativo e updated_at antigo', async () => {
    leadsResp = {
      data: [{ id: 'l-1', nome: 'Empresa X', empresa: 'Empresa X', status: 'classificacao', updated_at: '2026-05-01T00:00:00Z', responsavel_id: 'p-1', responsavel: 'Joao' }],
      error: null,
    }
    const { result } = renderHook(() => useLeadsEsquecidos(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data![0].status).toBe('classificacao')
  })
})

describe('useAdocaoAtividade', () => {
  beforeEach(() => {
    perfisResp    = { data: [], error: null }
    auditLogsResp = { data: [], error: null }
    leadsResp     = { data: [], error: null }
    tarefasResp   = { data: [], error: null }
    vi.clearAllMocks()
  })

  it('retorna array de perfis com metricas agregadas', async () => {
    perfisResp    = { data: [{ id: 'p-1', nome: 'Maria', email: 'maria@consej.com', role: 'consultor', tipo: 'interno' }], error: null }
    auditLogsResp = { data: [{ registro_id: 'p-1', created_at: new Date().toISOString() }], error: null }
    leadsResp     = { data: [{ id: 'l-1', responsavel_id: 'p-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }], error: null }
    tarefasResp   = { data: [{ id: 't-1', criado_por_id: 'p-1', created_at: new Date().toISOString() }], error: null }
    const { result } = renderHook(() => useAdocaoAtividade(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    const p = result.current.data![0]
    expect(p.nome).toBe('Maria')
    expect(p.leadsCriados).toBe(1)
    expect(p.tarefasCriadas).toBe(1)
    expect(p.ultimoLogin).not.toBeNull()
  })
})
