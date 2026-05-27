import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dos URL imports do Deno antes de importar email.ts
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { sendEmail } from '../email.ts'

/** Mock encadeável mínimo para .from(...).insert(...).select(...).single() / .update(...).eq(...) */
function makeSupabaseMock(opts: {
  quotaHoje?: number
  quotaMes?: number
  insertResult?: { id?: string; error?: { code?: string; message?: string } }
}) {
  const inserts: unknown[] = []
  const updates: Array<{ table: string; values: unknown; where: unknown }> = []

  const fromBuilder = (table: string) => {
    let pendingUpdate: unknown = null
    const builder: Record<string, unknown> = {
      insert: vi.fn((values: unknown) => {
        inserts.push({ table, values })
        const res = opts.insertResult ?? { id: 'notif-1' }
        const insertBuilder = {
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve(
                res.error
                  ? { data: null, error: res.error }
                  : { data: { id: res.id ?? 'notif-1' }, error: null },
              ),
            ),
          })),
        }
        return insertBuilder
      }),
      update: vi.fn((values: unknown) => {
        pendingUpdate = values
        return {
          eq: vi.fn((col: string, val: unknown) => {
            updates.push({ table, values: pendingUpdate, where: { [col]: val } })
            return Promise.resolve({ data: null, error: null })
          }),
        }
      }),
    }
    return builder
  }

  return {
    inserts,
    updates,
    client: {
      from: vi.fn((table: string) => fromBuilder(table)),
      rpc: vi.fn(() =>
        Promise.resolve({
          data: [{ hoje: opts.quotaHoje ?? 0, mes: opts.quotaMes ?? 0 }],
          error: null,
        }),
      ),
    },
  }
}

describe('sendEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('cenário 1: happy path — insert OK + Resend 200 → status=queued + UPDATE com resend_id', async () => {
    const sb = makeSupabaseMock({ quotaHoje: 0, quotaMes: 0, insertResult: { id: 'notif-1' } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r_abc' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 'lead-1',
      entidadeTipo: 'lead',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('queued')
    expect(result.resendId).toBe('r_abc')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(sb.inserts.length).toBe(1)
    expect(sb.updates.length).toBe(1) // UPDATE setting resend_id
  })

  it('cenário 2: idempotent skip — INSERT retorna 23505 → status=skipped_idempotent, Resend NÃO chamado', async () => {
    const sb = makeSupabaseMock({
      quotaHoje: 0,
      quotaMes: 0,
      insertResult: { error: { code: '23505', message: 'duplicate key' } },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 }),
    )

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 'lead-1',
      entidadeTipo: 'lead',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('skipped_idempotent')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cenário 3: Resend 429 3x → status=failed + UPDATE com error_msg', async () => {
    const sb = makeSupabaseMock({ quotaHoje: 0, quotaMes: 0, insertResult: { id: 'notif-2' } })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limit', { status: 429 }),
    )

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 'lead-1',
      entidadeTipo: 'lead',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('failed')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const failUpdate = sb.updates.find(u => (u.values as { status?: string }).status === 'failed')
    expect(failUpdate).toBeDefined()
    expect((failUpdate?.values as { error_msg?: string }).error_msg).toBeTruthy()
  }, 10000)

  it('cenário 4: Resend 500, 500, 200 → status=queued na 3ª tentativa', async () => {
    const sb = makeSupabaseMock({ quotaHoje: 0, quotaMes: 0, insertResult: { id: 'notif-3' } })
    let call = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call++
      if (call < 3) return Promise.resolve(new Response('err', { status: 500 }))
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'r_ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 'lead-1',
      entidadeTipo: 'lead',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('queued')
    expect(result.resendId).toBe('r_ok')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  }, 10000)
})
