import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createSupabaseMock } from '@/test/supabase-mock'

// Mock do supabase com RPC configurável por teste.
let rpcResponse: { data: unknown; error: { message: string } | null } = { data: {}, error: null }
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(() => Promise.resolve(rpcResponse)),
    from: createSupabaseMock().from,
  },
}))

import { DeleteConfirmDialog } from '../shared/DeleteConfirmDialog'

const baseProps = {
  open: true,
  onClose: vi.fn(),
  entidadeTipo: 'cliente' as const,
  entidadeId: 'c-123',
  entidadeLabel: 'ACME Ltda',
}

describe('DeleteConfirmDialog', () => {
  beforeEach(() => {
    rpcResponse = { data: {}, error: null }
    vi.clearAllMocks()
  })

  it('mostra o nome da entidade a excluir', async () => {
    render(<DeleteConfirmDialog {...baseProps} onConfirm={vi.fn()} />)
    expect(await screen.findByText(/ACME Ltda/)).toBeInTheDocument()
  })

  it('lista os impactos retornados pela RPC', async () => {
    rpcResponse = { data: { tarefas_excluidas: 3, contratos_excluidos: 1 }, error: null }
    render(<DeleteConfirmDialog {...baseProps} onConfirm={vi.fn()} />)
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('chama onConfirm ao clicar em Excluir', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} />)
    const btn = await screen.findByRole('button', { name: /excluir/i })
    await userEvent.click(btn)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
  })

  it('bloqueia exclusão quando há indicacoes_bloqueadoras', async () => {
    rpcResponse = { data: { indicacoes_bloqueadoras: 2 }, error: null }
    const onConfirm = vi.fn()
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} />)
    const btn = await screen.findByRole('button', { name: /excluir/i })
    await waitFor(() => expect(btn).toBeDisabled())
  })

  it('cancelar dispara onClose', async () => {
    const onClose = vi.fn()
    render(<DeleteConfirmDialog {...baseProps} onClose={onClose} onConfirm={vi.fn()} />)
    const btn = await screen.findByRole('button', { name: /cancelar/i })
    await userEvent.click(btn)
    expect(onClose).toHaveBeenCalled()
  })
})
