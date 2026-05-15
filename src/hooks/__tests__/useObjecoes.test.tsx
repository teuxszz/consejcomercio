import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'
import type { Objecao } from '@/types'

// Resposta configurável por teste.
let objecoesResp: MockResponse = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() {
      return createSupabaseMock({ from: { objecoes: objecoesResp } }).from
    },
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useObjecoes, useCreateObjecao } from '../useObjecoes'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const SAMPLE: Objecao[] = [
  {
    id: 'o1', categoria: 'preco', objecao: 'Tá caro', resposta_sugerida: 'Mostre o ROI',
    ativo: true, created_at: '2025-01-01', updated_at: '2025-01-01',
  },
]

describe('useObjecoes', () => {
  beforeEach(() => {
    objecoesResp = { data: [], error: null }
    vi.clearAllMocks()
  })

  it('query resolve a lista de objeções', async () => {
    objecoesResp = { data: SAMPLE, error: null }
    const { result } = renderHook(() => useObjecoes(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].objecao).toBe('Tá caro')
  })

  it('query propaga erro do Supabase', async () => {
    objecoesResp = { data: null, error: { message: 'RLS negou acesso' } }
    const { result } = renderHook(() => useObjecoes(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })

  it('useCreateObjecao expõe mutação chamável', async () => {
    objecoesResp = { data: SAMPLE[0], error: null }
    const { result } = renderHook(() => useCreateObjecao(), { wrapper })
    expect(typeof result.current.mutate).toBe('function')
    expect(result.current.isPending).toBe(false)
  })
})
