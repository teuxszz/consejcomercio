import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts', () => ({
  timingSafeEqual: () => true,
}))
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { openDmChannel, postDm } from '../slack.ts'

describe('openDmChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna { ok:true, channel } quando Slack responde OK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: { id: 'D123' } }), { status: 200 }),
    )
    const r = await openDmChannel('xoxb-token', 'U123')
    expect(r.ok).toBe(true)
    expect(r.channel).toBe('D123')
  })

  it('passa o token como Bearer no header Authorization', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, channel: { id: 'D1' } }), { status: 200 }),
    )
    await openDmChannel('xoxb-abc', 'U123')
    const call = fetchSpy.mock.calls[0]
    const init = call[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer xoxb-abc')
  })

  it('retorna { ok:false, error } quando Slack responde ok:false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'user_not_found' }), { status: 200 }),
    )
    const r = await openDmChannel('xoxb-token', 'U_BAD')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('user_not_found')
  })
})

describe('postDm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fluxo happy: open + post → { ok:true, ts }', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const u = url.toString()
      if (u.includes('conversations.open')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, channel: { id: 'D1' } }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '1700.0001' }), { status: 200 }))
    })
    const r = await postDm('xoxb', 'U123', 'oi', [])
    expect(r.ok).toBe(true)
    expect(r.ts).toBe('1700.0001')
  })

  it('falha em open propaga error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'invalid_user' }), { status: 200 }),
    )
    const r = await postDm('xoxb', 'U_BAD', 'oi', [])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('conversations.open falhou')
  })

  it('429 dispara retry (3x) e desiste após esgotar', async () => {
    let postCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const u = url.toString()
      if (u.includes('conversations.open')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, channel: { id: 'D1' } }), { status: 200 }))
      }
      postCalls++
      return Promise.resolve(new Response('rate', { status: 429 }))
    })
    // Atalho de tempo: stub do setTimeout para resolver imediatamente
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    const r = await postDm('xoxb', 'U123', 'oi', [])
    expect(r.ok).toBe(false)
    expect(postCalls).toBe(3)
  })

  it('token customizado vai no header de ambas as chamadas', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const u = url.toString()
      if (u.includes('conversations.open')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, channel: { id: 'D1' } }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '1' }), { status: 200 }))
    })
    await postDm('xoxb-custom', 'U1', 'oi', [])
    const calls = fetchSpy.mock.calls
    const openHeaders = (calls[0][1] as RequestInit).headers as Record<string, string>
    const postHeaders = (calls[1][1] as RequestInit).headers as Record<string, string>
    expect(openHeaders.Authorization).toBe('Bearer xoxb-custom')
    expect(postHeaders.Authorization).toBe('Bearer xoxb-custom')
  })
})
