import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClienteDoc } from '@/types'

// Plan 04a (BLOCKER #2 D-02 revision iter 2) — Botão visível ao consultor
// (autor OU coord+) quando autor_tipo='interno' + status='revisao_solicitada'.
// Click dispara useUploadClienteDoc com parentDocId=doc.id.

const uploadMutate = vi.fn()
const meuPerfilState: { data: { id: string } | null } = { data: { id: 'p1' } }
const currentRoleState: { atLeast: (m: string) => boolean } = {
  atLeast: () => false, // por padrão NÃO é coord+
}

vi.mock('@/hooks/useClienteDocs', () => ({
  useUploadClienteDoc: () => ({ mutate: uploadMutate, isPending: false }),
}))
vi.mock('@/hooks/usePerfis', () => ({
  useMeuPerfil: () => meuPerfilState,
}))
vi.mock('@/hooks/useCurrentRole', () => ({
  useCurrentRole: () => currentRoleState,
}))

import { SubirNovaVersaoButton } from '@/components/clientes/SubirNovaVersaoButton'

function makeDoc(overrides: Partial<ClienteDoc> = {}): ClienteDoc {
  return {
    id: 'd-rev',
    cliente_id: 'c1',
    autor_id: 'p1', // mesmo que meuPerfilState.data.id por padrão
    autor_tipo: 'interno',
    tag: 'proposta',
    nome_arquivo: 'oferta.pdf',
    mime_type: 'application/pdf',
    tamanho_bytes: 1024,
    storage_path: 'c1/d-rev.pdf',
    versao: 1,
    parent_doc_id: null,
    requer_aprovacao: true,
    status: 'revisao_solicitada',
    comentario_cliente: 'Ajustar cláusula 4',
    created_at: '2026-05-29T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  uploadMutate.mockReset()
  meuPerfilState.data = { id: 'p1' }
  currentRoleState.atLeast = () => false
})

describe('SubirNovaVersaoButton', () => {
  it('renderiza para autor_tipo=interno + status=revisao_solicitada + autor', () => {
    render(<SubirNovaVersaoButton doc={makeDoc()} mode="crm" />)
    expect(
      screen.getByRole('button', { name: /subir nova versão/i }),
    ).toBeInTheDocument()
  })

  it('hidden quando mode=portal', () => {
    const { container } = render(
      <SubirNovaVersaoButton doc={makeDoc()} mode="portal" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando autor_tipo=cliente', () => {
    const { container } = render(
      <SubirNovaVersaoButton
        doc={makeDoc({ autor_tipo: 'cliente' })}
        mode="crm"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando status != revisao_solicitada (e.g. pending)', () => {
    const { container } = render(
      <SubirNovaVersaoButton
        doc={makeDoc({ status: 'pending' })}
        mode="crm"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hidden quando user NÃO é autor E NÃO é coord+', () => {
    meuPerfilState.data = { id: 'outro-id' }
    currentRoleState.atLeast = () => false
    const { container } = render(
      <SubirNovaVersaoButton doc={makeDoc()} mode="crm" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('visível quando user NÃO é autor MAS é coord+', () => {
    meuPerfilState.data = { id: 'outro-id' }
    currentRoleState.atLeast = (min: string) => min === 'coordenador'
    render(<SubirNovaVersaoButton doc={makeDoc()} mode="crm" />)
    expect(
      screen.getByRole('button', { name: /subir nova versão/i }),
    ).toBeInTheDocument()
  })

  it('change no input dispara useUploadClienteDoc com parentDocId=doc.id', () => {
    const { container } = render(
      <SubirNovaVersaoButton doc={makeDoc()} mode="crm" />,
    )
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    expect(input).toBeTruthy()
    const file = new File(['x'], 'oferta-v2.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    expect(uploadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'c1',
        file,
        tag: 'proposta',
        requerAprovacao: true,
        autorId: 'p1',
        autorTipo: 'interno',
        parentDocId: 'd-rev',
      }),
    )
  })
})
