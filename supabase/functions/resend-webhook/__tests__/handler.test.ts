import { describe, it, expect, vi, beforeEach } from 'vitest'

let capturedHandler: ((req: Request) => Promise<Response>) | null = null

vi.stubGlobal('Deno', {
  env: {
    get: (k: string) => {
      const env: Record<string, string> = {
        WEBHOOK_RESEND_SECRET: 'whsec_test',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      }
      return env[k]
    },
  },
})

vi.mock('https://deno.land/std@0.224.0/http/server.ts', () => ({
  serve: (cb: (req: Request) => Promise<Response>) => {
    capturedHandler = cb
  },
}))

// Tracker para a row atual de notificacoes_envios — mutável entre testes
let currentRow: { id: string; status: string } | null = { id: 'notif-1', status: 'queued' }
const updateMock = vi.fn(() => Promise.resolve({ data: null, error: null }))

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: vi.fn((_table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: currentRow, error: null })),
        })),
      })),
      update: vi.fn((updates: Record<string, unknown>) => {
        updateMock(updates)
        return {
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }),
    })),
  }),
}))

// Mock verify.ts — assume signature válida e replay OK por default.
const verifyMock = vi.fn(() => Promise.resolve(true))
const replayMock = vi.fn(() => true)
vi.mock('../verify.ts', () => ({
  verifySvixSignature: (...args: unknown[]) => verifyMock(...args),
  isReplayValid: (...args: unknown[]) => replayMock(...args),
}))

beforeEach(async () => {
  updateMock.mockClear()
  verifyMock.mockReset()
  verifyMock.mockResolvedValue(true)
  replayMock.mockReset()
  replayMock.mockReturnValue(true)
  currentRow = { id: 'notif-1', status: 'queued' }

  if (!capturedHandler) {
    await import('../index.ts')
  }
})

function makeRequest(body: unknown): Request {
  return new Request('https://example/resend-webhook', {
    method: 'POST',
    headers: {
      'svix-id': 'evt_1',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,placeholder',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('resend-webhook — handler', () => {
  it('email.delivered: atualiza status=delivered + delivered_at', async () => {
    currentRow = { id: 'notif-1', status: 'queued' }
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({
      delivered_at: '2026-05-28T10:00:00Z',
      status: 'delivered',
    })
  })

  it('email.opened: atualiza status=opened + opened_at', async () => {
    currentRow = { id: 'notif-1', status: 'delivered' }
    const req = makeRequest({
      type: 'email.opened',
      created_at: '2026-05-28T10:05:00Z',
      data: { email_id: 'r1' },
    })
    await capturedHandler!(req)
    expect(updateMock).toHaveBeenCalledWith({
      opened_at: '2026-05-28T10:05:00Z',
      status: 'opened',
    })
  })

  it('email.bounced: atualiza status=bounced + bounced_at + error_msg', async () => {
    currentRow = { id: 'notif-1', status: 'queued' }
    const req = makeRequest({
      type: 'email.bounced',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1', bounce: { message: 'invalid recipient' } },
    })
    await capturedHandler!(req)
    expect(updateMock).toHaveBeenCalledWith({
      bounced_at: '2026-05-28T10:00:00Z',
      error_msg: 'invalid recipient',
      status: 'bounced',
    })
  })

  it('STATUS_RANK monotonic: delivered (rank 1) chegando após opened (rank 2) NÃO regride status', async () => {
    currentRow = { id: 'notif-1', status: 'opened' }
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:10:00Z',
      data: { email_id: 'r1' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)
    // delivered_at é escrito, mas status NÃO muda
    expect(updateMock).toHaveBeenCalledTimes(1)
    const updates = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(updates.delivered_at).toBe('2026-05-28T10:10:00Z')
    expect(updates.status).toBeUndefined()
  })

  it('email.sent é pulado (equivalente a queued)', async () => {
    const req = makeRequest({
      type: 'email.sent',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('email.sent')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('signature inválida retorna 401', async () => {
    verifyMock.mockResolvedValue(false)
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(401)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('timestamp skew retorna 401', async () => {
    replayMock.mockReturnValue(false)
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(401)
  })

  it('resend_id desconhecido retorna 200 com skipped', async () => {
    currentRow = null
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r_unknown' },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('unknown resend_id')
  })

  it('payload sem email_id retorna 200 com skipped', async () => {
    const req = makeRequest({
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: {} as { email_id: string },
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('no email_id')
  })

  it('headers svix ausentes retornam 401', async () => {
    const req = new Request('https://example/resend-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'r1' } }),
    })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(401)
  })
})
