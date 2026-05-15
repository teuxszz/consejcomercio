import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function Boom(): never {
  throw new Error('falha proposital')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renderiza os filhos normalmente quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>conteúdo ok</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('conteúdo ok')).toBeInTheDocument()
  })

  it('mostra o fallback quando um filho lança erro de render', () => {
    // Silencia o console.error esperado do React + do boundary.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /recarregar/i })).toBeInTheDocument()
    expect(screen.getByText(/falha proposital/)).toBeInTheDocument()
  })
})
