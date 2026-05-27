import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/hooks/useCurrentRole', () => ({
  useCurrentRole: vi.fn(),
}))
vi.mock('@/hooks/usePerfis', () => ({
  useMeuPerfil: () => ({ data: null, isLoading: false }),
}))
vi.mock('@/hooks/useAdocao', () => ({
  useAdocaoAtividade: () => ({ data: [], isLoading: false }),
  useLeadsEsquecidos: () => ({ data: [], isLoading: false }),
}))
// Plan 05-03 adicionou QuotaResendBanner em AdocaoPage; ele importa useQuotaResend
// → supabase. Mockamos pra evitar boot do client real (env vars ausentes em CI).
vi.mock('@/hooks/useQuotaResend', () => ({
  useQuotaResend: () => ({ data: { hoje: 0, mes: 0 } }),
}))

import { useCurrentRole } from '@/hooks/useCurrentRole'
import { AdocaoPage } from '../AdocaoPage'

const mockUseCurrentRole = vi.mocked(useCurrentRole)

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('AdocaoPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('consultor vê tela de acesso restrito', () => {
    mockUseCurrentRole.mockReturnValue({
      role: 'consultor', isLoading: false,
      isDiretor: false, isGerenteOrAcima: false, isCoordenadorOrAcima: false,
      hasRole: () => false, atLeast: () => false,
    })
    render(<AdocaoPage />, { wrapper })
    expect(screen.getByText('Acesso restrito')).toBeTruthy()
  })

  it('coordenador vê a página de Adoção', () => {
    mockUseCurrentRole.mockReturnValue({
      role: 'coordenador', isLoading: false,
      isDiretor: false, isGerenteOrAcima: false, isCoordenadorOrAcima: true,
      hasRole: () => true, atLeast: (min: string) => ['consultor', 'coordenador'].includes(min),
    })
    render(<AdocaoPage />, { wrapper })
    expect(screen.getByText('Adoção')).toBeTruthy()
  })
})
