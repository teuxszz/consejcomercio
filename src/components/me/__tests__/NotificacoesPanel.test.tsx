import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { PreferenciasNotif } from '@/types'

// Mock Switch para um <input type="checkbox"> simples — Radix Switch usa
// pointer events que jsdom não simula consistentemente. Esta substituição
// preserva role=switch (via input role) e dispara onCheckedChange via change event.
vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked?: boolean
    onCheckedChange?: (v: boolean) => void
    'aria-label'?: string
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}))

vi.mock('@/hooks/usePerfis', () => {
  const STABLE = { data: { id: 'perfil-1', nome: 'Gabriel', email: 'g@x.com' }, isLoading: false }
  return { useMeuPerfil: () => STABLE }
})

const usePreferenciasMock = vi.fn()
const useSalvarMock = vi.fn()

vi.mock('@/hooks/usePreferenciasNotif', () => ({
  usePreferenciasNotif: (...args: unknown[]) => usePreferenciasMock(...args),
  useSalvarPrefs: (...args: unknown[]) => useSalvarMock(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { NotificacoesPanel } from '../NotificacoesPanel'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

const DEFAULT_PREFS: PreferenciasNotif = {
  tarefa:    { slack: true, email: true },
  cadencia:  { slack: true, email: true },
  renovacao: { slack: true, email: true },
  indicacao: { slack: true, email: true },
}

describe('NotificacoesPanel', () => {
  beforeEach(() => {
    usePreferenciasMock.mockReset()
    useSalvarMock.mockReset()
    vi.clearAllMocks()
  })

  it('renderiza matriz 4×2 com exatamente 8 Switches', () => {
    usePreferenciasMock.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    useSalvarMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })

    render(<NotificacoesPanel />, { wrapper })

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(8)
    // Cada linha do tipo aparece
    expect(screen.getByText('Tarefas')).toBeTruthy()
    expect(screen.getByText('Cadência')).toBeTruthy()
    expect(screen.getByText('Renovação')).toBeTruthy()
    expect(screen.getByText('Indicação')).toBeTruthy()
  })

  it('togglar 1 switch + clicar Salvar chama useSalvarPrefs uma vez com o objeto INTEIRO (D-08 atomicidade)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    usePreferenciasMock.mockReturnValue({ data: DEFAULT_PREFS, isLoading: false })
    useSalvarMock.mockReturnValue({ mutateAsync, isPending: false })

    render(<NotificacoesPanel />, { wrapper })

    // Switch substituído por mock simples (ver vi.mock acima); plain click flippa o estado.
    const tarefaEmailSwitch = screen.getByLabelText('Tarefas via E-mail')
    // sanity check do estado inicial
    expect(tarefaEmailSwitch.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      fireEvent.click(tarefaEmailSwitch)
    })

    // Re-query (componente re-renderiza com nova instância)
    const tarefaEmailAfter = screen.getByLabelText('Tarefas via E-mail')
    await waitFor(() =>
      expect(tarefaEmailAfter.getAttribute('aria-checked')).toBe('false'),
    )

    const salvarBtn = screen.getByRole('button', { name: /salvar preferências/i }) as HTMLButtonElement
    expect(salvarBtn.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(salvarBtn)
    })

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    const arg = mutateAsync.mock.calls[0][0] as { perfilId: string; prefs: PreferenciasNotif }
    expect(arg.perfilId).toBe('perfil-1')
    // tarefa.email invertido
    expect(arg.prefs.tarefa.email).toBe(false)
    // outros 3 tipos inalterados (atomicidade — coluna inteira)
    expect(arg.prefs.cadencia).toEqual(DEFAULT_PREFS.cadencia)
    expect(arg.prefs.renovacao).toEqual(DEFAULT_PREFS.renovacao)
    expect(arg.prefs.indicacao).toEqual(DEFAULT_PREFS.indicacao)
    // Slack do tarefa também intocado
    expect(arg.prefs.tarefa.slack).toBe(true)
  })
})
