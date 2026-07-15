import { describe, it, expect, vi, beforeEach } from 'vitest'

// Env vars precisam estar setados ANTES do import de google-calendar.ts (o
// módulo captura GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no escopo global no
// module-load — mesmo padrão de aprovacoes.test.ts / email.ts).
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-id-test'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret-test'
})

// Mock dos URL imports do Deno antes de importar google-calendar.ts
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

import { refreshAccessToken, createFollowupEvent, getValidAccessToken } from '../google-calendar.ts'

/** Mock encadeável mínimo para .from('google_calendar_tokens').select(...).eq(...).maybeSingle() / .update(...).eq(...) */
function makeSupabaseMock(opts: {
  row?: { refresh_token: string; access_token: string | null; access_token_expires_at: string | null } | null
}) {
  const updates: Array<{ values: unknown; perfilId: unknown }> = []

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: opts.row ?? null, error: null })),
        })),
      })),
      update: vi.fn((values: unknown) => ({
        eq: vi.fn((_col: string, val: unknown) => {
          updates.push({ values, perfilId: val })
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    })),
  }

  return { client, updates }
}

describe('google-calendar.ts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('refreshAccessToken', () => {
    it('fetch 200 → { accessToken, expiresAt }', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'novo-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const before = Date.now()
      const result = await refreshAccessToken('refresh-abc')

      expect(result).not.toBeNull()
      expect(result?.accessToken).toBe('novo-token')
      expect(result?.expiresAt.getTime()).toBeGreaterThan(before + 3500 * 1000)
    })

    it('fetch não-2xx (invalid_grant) → null', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      )

      const result = await refreshAccessToken('refresh-revogado')
      expect(result).toBeNull()
    })
  })

  describe('createFollowupEvent', () => {
    const deadline = new Date('2026-08-01T15:00:00.000Z')

    it('200 → { ok:true, eventId }', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ id: 'evt-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await createFollowupEvent(
        'access-token-x',
        'ACME Ltda',
        deadline,
        'lead-1',
        'https://crm.consej.com.br',
      )

      expect(result).toEqual({ ok: true, eventId: 'evt-123' })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, init] = fetchSpy.mock.calls[0]
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body.description).toContain('https://crm.consej.com.br/leads/lead-1')
      expect(body.summary).toBe('Fazer follow-up com Lead ACME Ltda')
    })

    it('não-2xx → { ok:false, status }', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 401 }))

      const result = await createFollowupEvent(
        'access-token-expirado',
        'ACME Ltda',
        deadline,
        'lead-1',
        'https://crm.consej.com.br',
      )

      expect(result).toEqual({ ok: false, status: 401 })
    })
  })

  describe('getValidAccessToken', () => {
    it('token ainda válido (expira > agora + buffer) → devolve sem chamar refresh', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const sb = makeSupabaseMock({
        row: {
          refresh_token: 'refresh-abc',
          access_token: 'token-ainda-valido',
          access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      })

      const result = await getValidAccessToken(sb.client as never, 'perfil-1')

      expect(result).toBe('token-ainda-valido')
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(sb.updates.length).toBe(0)
    })

    it('token expirado → chama refresh, persiste novo token/expiry, devolve', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'token-refrescado', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      const sb = makeSupabaseMock({
        row: {
          refresh_token: 'refresh-abc',
          access_token: 'token-velho',
          access_token_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
        },
      })

      const result = await getValidAccessToken(sb.client as never, 'perfil-1')

      expect(result).toBe('token-refrescado')
      expect(sb.updates.length).toBe(1)
      expect((sb.updates[0].values as { access_token: string }).access_token).toBe('token-refrescado')
      expect(sb.updates[0].perfilId).toBe('perfil-1')
    })

    it('refresh falha (null) → devolve null (desconectado)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 400 }))
      const sb = makeSupabaseMock({
        row: {
          refresh_token: 'refresh-revogado',
          access_token: null,
          access_token_expires_at: null,
        },
      })

      const result = await getValidAccessToken(sb.client as never, 'perfil-1')

      expect(result).toBeNull()
      expect(sb.updates.length).toBe(0)
    })

    it('sem linha para o perfil (nunca conectou) → devolve null sem chamar refresh', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const sb = makeSupabaseMock({ row: null })

      const result = await getValidAccessToken(sb.client as never, 'perfil-1')

      expect(result).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
