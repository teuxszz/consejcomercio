import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const useCurrentRoleMock = vi.fn()

vi.mock('@/hooks/useCurrentRole', () => ({
  useCurrentRole: (...args: unknown[]) => useCurrentRoleMock(...args),
}))

vi.mock('@/hooks/usePerfis', () => ({
  useMeuPerfil: () => ({ data: { id: 'meu-perfil', nome: 'Gabriel' }, isLoading: false }),
  usePerfis:    () => ({ data: [
    { id: 'p1', nome: 'Ana',  email: 'ana@x.com',  tipo: 'interno', created_at: '2025-01-01' },
    { id: 'p2', nome: 'Beto', email: 'beto@x.com', tipo: 'interno', created_at: '2025-01-01' },
  ], isLoading: false }),
}))

vi.mock('@/hooks/useNotificacoesEnvios', () => ({
  useNotificacoesEnvios: () => ({ data: [], isLoading: false }),
}))

vi.mock('@/hooks/useReenviarNotificacao', () => ({
  useReenviarNotificacao: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { NotificacoesHistoricoPage } from '../NotificacoesHistoricoPage'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('NotificacoesHistoricoPage', () => {
  beforeEach(() => {
    useCurrentRoleMock.mockReset()
    vi.clearAllMocks()
  })

  it('coordenador+ vê dropdown "Filtrar por usuário"', () => {
    useCurrentRoleMock.mockReturnValue({
      role: 'coordenador',
      isLoading: false,
      isDiretor: false,
      isGerenteOrAcima: false,
      isCoordenadorOrAcima: true,
      hasRole: () => true,
      atLeast: () => true,
    })

    render(<NotificacoesHistoricoPage />, { wrapper })

    expect(screen.getByText(/Filtrar por usuário/i)).toBeTruthy()
    // O SelectTrigger tem role=combobox (forçado via prop)
    expect(screen.getByRole('combobox', { name: /filtrar por usuário/i })).toBeTruthy()
  })

  it('consultor NÃO vê o dropdown (D-17 role gate)', () => {
    useCurrentRoleMock.mockReturnValue({
      role: 'consultor',
      isLoading: false,
      isDiretor: false,
      isGerenteOrAcima: false,
      isCoordenadorOrAcima: false,
      hasRole: () => false,
      atLeast: () => false,
    })

    render(<NotificacoesHistoricoPage />, { wrapper })

    expect(screen.queryByText(/Filtrar por usuário/i)).toBeNull()
    expect(screen.queryByRole('combobox', { name: /filtrar por usuário/i })).toBeNull()
  })
})
