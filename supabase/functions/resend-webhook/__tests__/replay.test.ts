import { describe, it, expect, vi, beforeEach } from 'vitest'

// Garante que processar o MESMO evento (mesmo svix-id + mesmo payload) duas
// vezes é idempotente: o UPDATE escreve os mesmos valores e a chamada inteira
// continua retornando 200. Pitfall 3 — dedup natural via UPDATE.

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

const updateMock = vi.fn(() => Promise.resolve({ data: null, error: null }))
// row inicial — queued. Após 1ª chamada de delivered, vira delivered.
let currentRow: { id: string; status: string } | null = { id: 'notif-1', status: 'queued' }

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: currentRow, error: null })),
        })),
      })),
      update: vi.fn((updates: Record<string, unknown>) => {
        updateMock(updates)
        // Simula efeito do UPDATE no estado local — próxima leitura vê o novo status
        if (currentRow && typeof updates.status === 'string') {
          currentRow = { ...currentRow, status: updates.status as string }
        }
        return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) }
      }),
    })),
  }),
}))

vi.mock('../verify.ts', () => ({
  verifySvixSignature: vi.fn(() => Promise.resolve(true)),
  isReplayValid: vi.fn(() => true),
}))

beforeEach(async () => {
  updateMock.mockClear()
  currentRow = { id: 'notif-1', status: 'queued' }
  if (!capturedHandler) {
    await import('../index.ts')
  }
})

function makeRequest(svixId: string, body: unknown): Request {
  return new Request('https://example/resend-webhook', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,placeholder',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('resend-webhook — replay/dedup', () => {
  it('mesmo svix-id processado 2x: 1ª aplica status, 2ª é monotonic-noop mas ainda 200', async () => {
    const payload = {
      type: 'email.delivered',
      created_at: '2026-05-28T10:00:00Z',
      data: { email_id: 'r1' },
    }

    // 1ª chamada: aplica status=delivered + delivered_at
    const res1 = await capturedHandler!(makeRequest('evt_dup_1', payload))
    expect(res1.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(1)
    const firstCall = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect(firstCall.status).toBe('delivered')
    expect(firstCall.delivered_at).toBe('2026-05-28T10:00:00Z')

    // 2ª chamada com MESMO svix-id e payload: status já é 'delivered'.
    // STATUS_RANK monotonic: novo rank (1) NÃO > atual rank (1), então status NÃO entra no updates.
    // delivered_at AINDA é escrito (defensive), mas com mesmo valor — idempotente.
    const res2 = await capturedHandler!(makeRequest('evt_dup_1', payload))
    expect(res2.status).toBe(200)
    expect(updateMock).toHaveBeenCalledTimes(2)
    const secondCall = updateMock.mock.calls[1][0] as Record<string, unknown>
    expect(secondCall.delivered_at).toBe('2026-05-28T10:00:00Z')
    expect(secondCall.status).toBeUndefined()  // monotonic — status não regride nem repete
  })
})
