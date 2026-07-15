import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

const useGoogleCalendarStatusMock = vi.fn()
const useConectarGoogleAgendaMock = vi.fn()
const useCapturarTokenGoogleMock = vi.fn()
const useDesconectarGoogleAgendaMock = vi.fn()

vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendarStatus: (...args: unknown[]) => useGoogleCalendarStatusMock(...args),
  useConectarGoogleAgenda: (...args: unknown[]) => useConectarGoogleAgendaMock(...args),
  useCapturarTokenGoogle: (...args: unknown[]) => useCapturarTokenGoogleMock(...args),
  useDesconectarGoogleAgenda: (...args: unknown[]) => useDesconectarGoogleAgendaMock(...args),
}))

import { ConectarGoogleAgendaCard } from '../ConectarGoogleAgendaCard'

function wrapper({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  return <MemoryRouter initialEntries={initialEntries ?? ['/me?tab=notificacoes']}>{children}</MemoryRouter>
}

describe('ConectarGoogleAgendaCard', () => {
  const conectarMutate = vi.fn()
  const desconectarMutate = vi.fn()
  const capturarMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useConectarGoogleAgendaMock.mockReturnValue({ mutate: conectarMutate, isPending: false })
    useDesconectarGoogleAgendaMock.mockReturnValue({ mutate: desconectarMutate, isPending: false })
    useCapturarTokenGoogleMock.mockReturnValue({ mutate: capturarMutate, isPending: false })
  })

  it('renderiza "Conectar Google Agenda" quando desconectado', () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: false, expira_em: null },
      isLoading: false,
    })

    render(<ConectarGoogleAgendaCard />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Conectar Google Agenda' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Conectar Google Agenda' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desconectar' })).toBeNull()
  })

  it('renderiza "Conectado" e botão "Desconectar" quando conectado', () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: true, expira_em: '2026-07-20T12:00:00.000Z' },
      isLoading: false,
    })

    render(<ConectarGoogleAgendaCard />, { wrapper })

    expect(screen.getByRole('heading', { name: 'Conectado ✅' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conectar Google Agenda' })).toBeNull()
  })

  it('clicar em "Conectar Google Agenda" chama useConectarGoogleAgenda().mutate', () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: false, expira_em: null },
      isLoading: false,
    })

    render(<ConectarGoogleAgendaCard />, { wrapper })

    fireEvent.click(screen.getByRole('button', { name: 'Conectar Google Agenda' }))
    expect(conectarMutate).toHaveBeenCalledTimes(1)
  })

  it('clicar em "Desconectar" chama useDesconectarGoogleAgenda().mutate', () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: true, expira_em: null },
      isLoading: false,
    })

    render(<ConectarGoogleAgendaCard />, { wrapper })

    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    expect(desconectarMutate).toHaveBeenCalledTimes(1)
  })

  it('não renderiza nada enquanto isLoading', () => {
    useGoogleCalendarStatusMock.mockReturnValue({ data: undefined, isLoading: true })

    const { container } = render(<ConectarGoogleAgendaCard />, { wrapper })
    expect(container).toBeEmptyDOMElement()
    expect(capturarMutate).not.toHaveBeenCalled()
  })

  it('captura o token uma vez quando ?google_linked=1 está presente e limpa o param', async () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: false, expira_em: null },
      isLoading: false,
    })
    capturarMutate.mockImplementation((_arg, opts?: { onSettled?: () => void }) => {
      opts?.onSettled?.()
    })

    render(<ConectarGoogleAgendaCard />, {
      wrapper: (props) => wrapper({ ...props, initialEntries: ['/me?tab=notificacoes&google_linked=1'] }),
    })

    await waitFor(() => expect(capturarMutate).toHaveBeenCalledTimes(1))
  })

  it('NÃO captura o token quando ?google_linked=1 está ausente', () => {
    useGoogleCalendarStatusMock.mockReturnValue({
      data: { conectado: false, expira_em: null },
      isLoading: false,
    })

    render(<ConectarGoogleAgendaCard />, { wrapper })

    expect(capturarMutate).not.toHaveBeenCalled()
  })
})
