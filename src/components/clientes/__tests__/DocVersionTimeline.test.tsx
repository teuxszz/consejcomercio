import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClienteDoc } from '@/types'

// Plan 04a — Timeline inline de versões anteriores (D-02).
// - history vazio: retorna null
// - history populado: renderiza botão "Ver versões anteriores (N)"
//   que expande/colapsa via ChevronDown.

import { DocVersionTimeline } from '@/components/clientes/DocVersionTimeline'

function makeDoc(overrides: Partial<ClienteDoc> = {}): ClienteDoc {
  return {
    id: 'd1',
    cliente_id: 'c1',
    autor_id: 'p1',
    autor_tipo: 'interno',
    tag: 'proposta',
    nome_arquivo: 'oferta.pdf',
    mime_type: 'application/pdf',
    tamanho_bytes: 1024,
    storage_path: 'c1/d1.pdf',
    versao: 1,
    parent_doc_id: null,
    requer_aprovacao: false,
    status: null,
    comentario_cliente: null,
    created_at: '2026-05-29T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('DocVersionTimeline', () => {
  it('history vazio: renderiza null', () => {
    const { container } = render(<DocVersionTimeline history={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('history populado: renderiza botão "Ver versões anteriores (N)"', () => {
    const history = [
      makeDoc({ id: 'd-v2', versao: 2, status: 'superseded' }),
      makeDoc({ id: 'd-v1', versao: 1, status: 'superseded' }),
    ]
    render(<DocVersionTimeline history={history} />)
    expect(screen.getByText(/Ver versões anteriores \(2\)/i)).toBeInTheDocument()
    // lista colapsada por padrão (aria-expanded=false; lista role=list ausente)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('click no botão expande lista com versões em ordem fornecida', () => {
    const history = [
      makeDoc({ id: 'd-v2', versao: 2, status: 'aprovado' }),
      makeDoc({ id: 'd-v1', versao: 1, status: 'superseded' }),
    ]
    render(<DocVersionTimeline history={history} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver versões anteriores/i }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('v2')
    expect(items[1]).toHaveTextContent('v1')
    // status chips renderizados
    expect(screen.getByText('aprovado')).toBeInTheDocument()
    expect(screen.getByText('superseded')).toBeInTheDocument()
  })

  it('mapeia status para classe CSS apropriada (cores)', () => {
    const history = [
      makeDoc({ id: 'd-v3', versao: 3, status: 'revisao_solicitada' }),
    ]
    render(<DocVersionTimeline history={history} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver versões anteriores/i }))
    const chip = screen.getByText('revisao_solicitada')
    expect(chip.className).toMatch(/amber/)
  })
})
