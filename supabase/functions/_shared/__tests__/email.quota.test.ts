import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { sendEmail, checkQuota } from '../email.ts'

function makeSupabaseMock(quotaHoje: number, quotaMes: number) {
  const inserts: Array<{ values: { status?: string } }> = []
  return {
    inserts,
    client: {
      from: vi.fn(() => ({
        insert: vi.fn((values: { status?: string }) => {
          inserts.push({ values })
          return {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: { id: 'notif-q' }, error: null }),
              ),
            })),
          }
        }),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      rpc: vi.fn(() =>
        Promise.resolve({ data: [{ hoje: quotaHoje, mes: quotaMes }], error: null }),
      ),
    },
  }
}

describe('checkQuota', () => {
  it('estourou=true quando hoje>=100', async () => {
    const sb = makeSupabaseMock(100, 200)
    const q = await checkQuota(sb.client as never)
    expect(q.hoje).toBe(100)
    expect(q.estourou).toBe(true)
  })

  it('estourou=true quando mes>=3000', async () => {
    const sb = makeSupabaseMock(5, 3000)
    const q = await checkQuota(sb.client as never)
    expect(q.estourou).toBe(true)
  })

  it('estourou=false quando ambos abaixo', async () => {
    const sb = makeSupabaseMock(50, 1000)
    const q = await checkQuota(sb.client as never)
    expect(q.estourou).toBe(false)
  })
})

describe('sendEmail (quota)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('cenário 1: hoje>=100 → status=dropped_quota + Resend NÃO chamado', async () => {
    const sb = makeSupabaseMock(100, 200)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 't1',
      entidadeTipo: 'tarefa',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('dropped_quota')
    expect(fetchSpy).not.toHaveBeenCalled()
    const droppedInsert = sb.inserts.find(i => i.values.status === 'dropped_quota')
    expect(droppedInsert).toBeDefined()
  })

  it('cenário 2: mes>=3000 → status=dropped_quota', async () => {
    const sb = makeSupabaseMock(5, 3000)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 't1',
      entidadeTipo: 'tarefa',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('dropped_quota')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cenário 3: ambos abaixo (50/1000) → status=queued normal', async () => {
    const sb = makeSupabaseMock(50, 1000)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'r_norm' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await sendEmail(sb.client as never, {
      perfilId: 'p1',
      toEmail: 'a@b.com',
      tipo: 'tarefa',
      entidadeId: 't1',
      entidadeTipo: 'tarefa',
      subject: 'X',
      html: '<p>X</p>',
    })

    expect(result.status).toBe('queued')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
