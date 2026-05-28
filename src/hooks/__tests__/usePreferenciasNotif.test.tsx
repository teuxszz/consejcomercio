import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PreferenciasNotif } from '@/types'

// ─── Manual supabase mock — track update calls for PATCH-atomic assertion ─────

const updateMock = vi.fn()
const eqUpdateMock = vi.fn()
const selectUpdateMock = vi.fn()
const singleUpdateMock = vi.fn()

let selectResp: { data: { preferencias_notif: PreferenciasNotif | null } | null; error: unknown } = {
  data: null,
  error: null,
}
let updateResp: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabase', () => {
  const builderFor = (table: string) => {
    if (table !== 'perfis') return {}
    const selectBuilder = {
      eq: vi.fn(() => selectBuilder),
      maybeSingle: vi.fn(() => Promise.resolve(selectResp)),
    }
    return {
      select: vi.fn(() => selectBuilder),
      update: (payload: unknown) => {
        updateMock(payload)
        const b = {
          eq: (...args: unknown[]) => {
            eqUpdateMock(...args)
            return b
          },
          select: (...args: unknown[]) => {
            selectUpdateMock(...args)
            return b
          },
          single: () => {
            singleUpdateMock()
            return Promise.resolve(updateResp)
          },
        }
        return b
      },
    }
  }
  return { supabase: { from: vi.fn((t: string) => builderFor(t)) } }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { usePreferenciasNotif, useSalvarPrefs } from '../usePreferenciasNotif'
import { toast } from 'sonner'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, Wrapper }
}

const DEFAULT_PREFS: PreferenciasNotif = {
  // push: false — fixture Phase 5 não exercita push; Plan 03/04 cobrem.
  tarefa:     { slack: true,  email: true,  push: false },
  cadencia:   { slack: false, email: true,  push: false },
  renovacao:  { slack: true,  email: true,  push: false },
  indicacao:  { slack: true,  email: false, push: false },
  documentos: { slack: false, email: true,  push: false }, // Phase 7 D-16 default
}

describe('usePreferenciasNotif', () => {
  beforeEach(() => {
    selectResp = { data: null, error: null }
    updateResp = { data: null, error: null }
    updateMock.mockClear()
    eqUpdateMock.mockClear()
    selectUpdateMock.mockClear()
    singleUpdateMock.mockClear()
    vi.clearAllMocks()
  })

  it('query devolve preferencias_notif do banco', async () => {
    selectResp = { data: { preferencias_notif: DEFAULT_PREFS }, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePreferenciasNotif('perfil-1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(DEFAULT_PREFS)
  })

  it('query desabilitada quando perfilId é null', async () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePreferenciasNotif(null), { wrapper: Wrapper })
    // enabled=false ⇒ fica em fetchStatus=idle (não dispara request)
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('useSalvarPrefs PATCH atômico — UPDATE chamado UMA vez com o objeto inteiro (R5)', async () => {
    updateResp = { data: { id: 'perfil-1', preferencias_notif: DEFAULT_PREFS }, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSalvarPrefs(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1', prefs: DEFAULT_PREFS })
    })

    // 1 chamada update com o objeto INTEIRO de 4 tipos x 2 canais
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(updateMock).toHaveBeenCalledWith({ preferencias_notif: DEFAULT_PREFS })
    expect(eqUpdateMock).toHaveBeenCalledWith('id', 'perfil-1')
    // Garante atomicidade: as 5 chaves devem ter chegado de uma vez (Phase 7 D-16 adicionou documentos)
    const payload = updateMock.mock.calls[0][0] as { preferencias_notif: PreferenciasNotif }
    expect(Object.keys(payload.preferencias_notif).sort()).toEqual([
      'cadencia',
      'documentos',
      'indicacao',
      'renovacao',
      'tarefa',
    ])
  })

  it('optimistic update aplica e rollback no erro', async () => {
    selectResp = { data: { preferencias_notif: DEFAULT_PREFS }, error: null }
    updateResp = { data: null, error: { message: 'RLS negou' } }
    const { qc, Wrapper } = makeWrapper()

    // Semeia cache primeiro
    const { result: q } = renderHook(() => usePreferenciasNotif('perfil-1'), { wrapper: Wrapper })
    await waitFor(() => expect(q.current.isSuccess).toBe(true))

    const { result } = renderHook(() => useSalvarPrefs(), { wrapper: Wrapper })

    const NEW_PREFS: PreferenciasNotif = {
      ...DEFAULT_PREFS,
      tarefa: { slack: false, email: false, push: false },
    }

    await act(async () => {
      try {
        await result.current.mutateAsync({ perfilId: 'perfil-1', prefs: NEW_PREFS })
      } catch {
        // expected
      }
    })

    // Rollback: cache voltou para DEFAULT_PREFS
    const cached = qc.getQueryData(['preferenciasNotif', 'perfil-1'])
    expect(cached).toEqual(DEFAULT_PREFS)
    expect(toast.error).toHaveBeenCalled()
  })
})
