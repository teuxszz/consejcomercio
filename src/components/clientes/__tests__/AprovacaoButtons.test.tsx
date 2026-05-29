import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClienteDoc } from '@/types'

// Plan 04a — D-01: par de botões "Aprovar" + "Solicitar revisão" exibido no
// Portal do cliente quando autor_tipo='interno' + requer_aprovacao=true +
// status='pending'. Hidden no CRM mode.

const aprovarMutate = vi.fn()

vi.mock('@/hooks/useClienteDocs', () => ({
  useAprovarDoc: () => ({ mutate: aprovarMutate, isPending: false }),
  useSolicitarRevisaoDoc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

// SolicitarRevisaoModal renderiza um marcador simples para verificarmos
// que o click no "Solicitar revisão" abriu a modal sem invocar o componente real.
vi.mock('@/components/clientes/SolicitarRevisaoModal', () => ({
  SolicitarRevisaoModal: ({ onClose: _onClose }: { onClose: () => void }) => (
    <div data-testid="revisao-modal" />
  ),
}))

import { AprovacaoButtons } from '@/components/clientes/AprovacaoButtons'

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
    requer_aprovacao: true,
    status: 'pending',
    comentario_cliente: null,
    created_at: '2026-05-29T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  aprovarMutate.mockReset()
})

describe('AprovacaoButtons', () => {
  it('renderiza apenas para mode=portal + status=pending + requer_aprovacao=true', () => {
    render(<AprovacaoButtons doc={makeDoc()} mode="portal" />)
    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /solicitar revisão/i }),
    ).toBeInTheDocument()
  })

  it('hidden quando mode=crm (consultor não aprova doc próprio)', () => {
    const { container } = render(
      <AprovacaoButtons doc={makeDoc()} mode="crm" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando autor_tipo=cliente', () => {
    const { container } = render(
      <AprovacaoButtons
        doc={makeDoc({ autor_tipo: 'cliente' })}
        mode="portal"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando status!=pending (e.g. aprovado)', () => {
    const { container } = render(
      <AprovacaoButtons doc={makeDoc({ status: 'aprovado' })} mode="portal" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando requer_aprovacao=false', () => {
    const { container } = render(
      <AprovacaoButtons
        doc={makeDoc({ requer_aprovacao: false })}
        mode="portal"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('click "Aprovar" dispara useAprovarDoc com { docId, clienteId }', () => {
    render(<AprovacaoButtons doc={makeDoc()} mode="portal" />)
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }))
    expect(aprovarMutate).toHaveBeenCalledWith({ docId: 'd1', clienteId: 'c1' })
  })

  it('click "Solicitar revisão" abre SolicitarRevisaoModal', () => {
    render(<AprovacaoButtons doc={makeDoc()} mode="portal" />)
    expect(screen.queryByTestId('revisao-modal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /solicitar revisão/i }))
    expect(screen.getByTestId('revisao-modal')).toBeInTheDocument()
  })
})
