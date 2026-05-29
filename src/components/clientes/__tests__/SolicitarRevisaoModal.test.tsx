import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { ClienteDoc } from '@/types'

// Plan 04a — Modal acionada pelo AprovacaoButtons. zod min(5). Submit chama
// useSolicitarRevisaoDoc e fecha modal no success.

const solicitarMutate = vi.fn()

vi.mock('@/hooks/useClienteDocs', () => ({
  useSolicitarRevisaoDoc: () => ({
    mutateAsync: solicitarMutate,
    isPending: false,
  }),
}))

import { SolicitarRevisaoModal } from '@/components/clientes/SolicitarRevisaoModal'

function makeDoc(): ClienteDoc {
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
  }
}

beforeEach(() => {
  solicitarMutate.mockReset()
})

describe('SolicitarRevisaoModal', () => {
  it('renderiza textarea + botões Cancelar/Enviar', () => {
    render(<SolicitarRevisaoModal doc={makeDoc()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/O que precisa ser ajustado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar/i })).toBeInTheDocument()
  })

  it('valida comentário com zod min(5) — exibe erro inline', async () => {
    render(<SolicitarRevisaoModal doc={makeDoc()} onClose={vi.fn()} />)
    const textarea = screen.getByLabelText(/O que precisa ser ajustado/i)
    fireEvent.change(textarea, { target: { value: 'abc' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() =>
      expect(screen.getByText(/mínimo 5 caracteres/i)).toBeInTheDocument(),
    )
    expect(solicitarMutate).not.toHaveBeenCalled()
  })

  it('submit válido chama useSolicitarRevisaoDoc com { docId, clienteId, comentario } + onClose', async () => {
    solicitarMutate.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<SolicitarRevisaoModal doc={makeDoc()} onClose={onClose} />)
    const textarea = screen.getByLabelText(/O que precisa ser ajustado/i)
    fireEvent.change(textarea, {
      target: { value: 'Faltou ajustar a cláusula 4' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    })
    await waitFor(() =>
      expect(solicitarMutate).toHaveBeenCalledWith({
        docId: 'd1',
        clienteId: 'c1',
        comentario: 'Faltou ajustar a cláusula 4',
      }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('click Cancelar fecha modal sem chamar mutation', () => {
    const onClose = vi.fn()
    render(<SolicitarRevisaoModal doc={makeDoc()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
    expect(solicitarMutate).not.toHaveBeenCalled()
  })
})
