import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Perfil } from '@/hooks/usePerfis'

const PERFIS: Perfil[] = [
  { id: 'u1', nome: 'Luna Melo', cargo: 'Diretora', created_at: '2025-01-01' },
  { id: 'u2', nome: 'Ana Carolina', created_at: '2025-01-01' },
]

vi.mock('@/hooks/usePerfis', () => ({
  usePerfis: () => ({ data: PERFIS }),
}))

import { ResponsavelBadge } from '../shared/ResponsavelBadge'

describe('ResponsavelBadge', () => {
  it('mostra o nome do responsável quando o perfil existe', () => {
    render(<ResponsavelBadge perfilId="u1" />)
    expect(screen.getByText('Luna Melo')).toBeInTheDocument()
  })

  it('mostra estado vazio quando perfilId é null', () => {
    render(<ResponsavelBadge perfilId={null} />)
    expect(screen.getByText('Sem responsável')).toBeInTheDocument()
  })

  it('mostra estado vazio quando perfilId não existe na lista', () => {
    render(<ResponsavelBadge perfilId="inexistente" />)
    expect(screen.getByText('Sem responsável')).toBeInTheDocument()
  })

  it('respeita emptyLabel customizado', () => {
    render(<ResponsavelBadge perfilId={null} emptyLabel="Não atribuído" />)
    expect(screen.getByText('Não atribuído')).toBeInTheDocument()
  })

  it('showName=false esconde o nome', () => {
    render(<ResponsavelBadge perfilId="u1" showName={false} />)
    expect(screen.queryByText('Luna Melo')).not.toBeInTheDocument()
  })

  it('tooltip (title) inclui cargo quando disponível', () => {
    const { container } = render(<ResponsavelBadge perfilId="u1" />)
    const badge = container.querySelector('[title]')
    expect(badge?.getAttribute('title')).toContain('Luna Melo')
    expect(badge?.getAttribute('title')).toContain('Diretora')
  })

  it('perfil sem cargo: tooltip mostra só o nome', () => {
    const { container } = render(<ResponsavelBadge perfilId="u2" />)
    const badge = container.querySelector('[title]')
    expect(badge?.getAttribute('title')).toBe('Ana Carolina')
  })
})
