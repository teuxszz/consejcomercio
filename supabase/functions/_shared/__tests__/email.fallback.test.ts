import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { findDiretores } from '../perfis.ts'

/** Mock builder para perfis.from('perfis').select('id, email').eq('role', 'diretor') */
function makeSupabaseWithDiretores(diretores: Array<{ id: string; email: string }>) {
  return {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => Promise.resolve({ data: diretores, error: null })),
      }
      return builder
    }),
  }
}

describe('findDiretores', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('cenário A: 2 diretores → retorna array com 2 elementos', async () => {
    const sb = makeSupabaseWithDiretores([
      { id: 'd1', email: 'd1@consej.com' },
      { id: 'd2', email: 'd2@consej.com' },
    ])
    const result = await findDiretores(sb as never)
    expect(result.length).toBe(2)
    expect(result[0].email).toBe('d1@consej.com')
  })

  it('nenhum diretor → retorna []', async () => {
    const sb = makeSupabaseWithDiretores([])
    const result = await findDiretores(sb as never)
    expect(result).toEqual([])
  })

  it('filtra linhas sem id/email (defensivo)', async () => {
    const sb = makeSupabaseWithDiretores([
      { id: 'd1', email: 'd1@consej.com' },
      { id: '', email: '' } as never,
    ])
    const result = await findDiretores(sb as never)
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('d1')
  })
})

describe('dispatch fallback diretor (D-05) — integration shape', () => {
  // Documenta o contrato esperado pelo notify-tarefa (Task 3): quando o
  // destinatário per-user resolve para email NULL, o handler deve chamar
  // findDiretores e disparar sendEmail UMA VEZ por diretor com status
  // 'fallback_diretor' registrado.
  //
  // O teste end-to-end "executor" desta lógica vive em
  // supabase/functions/notify-tarefa/__tests__/parallel.test.ts cenário
  // "fallback diretor" (Task 3). Aqui só validamos a fundação compartilhada.

  it('findDiretores retorna a lista que o caller vai iterar', async () => {
    const sb = makeSupabaseWithDiretores([
      { id: 'd1', email: 'd1@consej.com' },
      { id: 'd2', email: 'd2@consej.com' },
    ])
    const diretores = await findDiretores(sb as never)
    // Simulando o loop que o notify-tarefa fará:
    const sendEmailMock = vi.fn(() => Promise.resolve({ ok: true, status: 'fallback_diretor' as const }))
    const results = await Promise.all(
      diretores.map(d =>
        sendEmailMock({ perfilId: d.id, toEmail: d.email, tipo: 'renovacao', entidadeId: 'contr-1' }),
      ),
    )
    expect(sendEmailMock).toHaveBeenCalledTimes(2)
    expect(results.every(r => r.status === 'fallback_diretor')).toBe(true)
  })
})
