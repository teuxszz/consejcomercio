import { describe, it, expect, vi, beforeEach } from 'vitest'

// Env vars precisam estar setados ANTES do import de sla.ts (o módulo captura
// SLACK_BOT_TOKEN/SLACK_GERENCIA_CHANNEL_ID/APP_URL no escopo global no
// module-load — mesmo padrão de aprovacoes.ts/google-calendar.ts).
vi.hoisted(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
  process.env.SLACK_GERENCIA_CHANNEL_ID = 'C_GERENCIA_TEST'
  process.env.APP_URL = 'https://crm.consej.com.br'
})

// Mock dos URL imports do Deno antes de importar sla.ts
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))

// Mocks dos helpers — isolar a unidade sendNotificacaoSla
vi.mock('../slack.ts', () => ({
  postDm: vi.fn(),
}))
vi.mock('../perfis.ts', () => ({
  findSlackUserId: vi.fn(),
  findPerfilNome: vi.fn(),
}))
vi.mock('../google-calendar.ts', () => ({
  getValidAccessToken: vi.fn(),
  createFollowupEvent: vi.fn(),
}))

import { postDm } from '../slack.ts'
import { findSlackUserId, findPerfilNome } from '../perfis.ts'
import { getValidAccessToken, createFollowupEvent } from '../google-calendar.ts'
import { sendNotificacaoSla } from '../sla.ts'

const mockedPostDm = postDm as unknown as ReturnType<typeof vi.fn>
const mockedFindSlackId = findSlackUserId as unknown as ReturnType<typeof vi.fn>
const mockedFindPerfilNome = findPerfilNome as unknown as ReturnType<typeof vi.fn>
const mockedGetValidAccessToken = getValidAccessToken as unknown as ReturnType<typeof vi.fn>
const mockedCreateFollowupEvent = createFollowupEvent as unknown as ReturnType<typeof vi.fn>

type MockResp = { data: unknown; error: unknown }

/** Builder encadeável mínimo — cada método devolve o próprio builder; maybeSingle/single/await resolvem a resposta configurada. */
function makeBuilder(response: MockResp) {
  const builder: Record<string, unknown> = {}
  const chainMethods = ['select', 'update', 'insert', 'eq', 'is', 'delete']
  for (const m of chainMethods) builder[m] = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve(response))
  builder.single = vi.fn(() => Promise.resolve(response))
  builder.then = (resolve: (v: MockResp) => unknown) => resolve(response)
  return builder
}

/**
 * Mock encadeável de supabase.from() com fila de respostas POR TABELA —
 * cada chamada consecutiva a from(mesmaTabela) consome a próxima resposta
 * da fila (permite simular CAS → hidratação → update em sequência).
 */
function makeSupabaseMock(responses: Record<string, MockResp[]>) {
  const queues: Record<string, MockResp[]> = {}
  for (const k of Object.keys(responses)) queues[k] = [...responses[k]]

  const from = vi.fn((table: string) => {
    const q = queues[table]
    const next = q && q.length > 0 ? q.shift()! : { data: null, error: null }
    return makeBuilder(next)
  })

  return { from } as never
}

const LEAD_ROW = { id: 'lead-1', nome: 'ACME Ltda', empresa: 'ACME', responsavel_id: 'resp-1' }
const SLA_ROW = { deadline_at: '2026-08-01T15:00:00.000Z' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
  process.env.SLACK_GERENCIA_CHANNEL_ID = 'C_GERENCIA_TEST'
  process.env.APP_URL = 'https://crm.consej.com.br'
  mockedFindPerfilNome.mockResolvedValue('Gabriel')
})

describe('sendNotificacaoSla', () => {
  it('warning, CAS ganha → postDm chamado 1x (sempre, mesmo com prefs off), retorna ok', async () => {
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedGetValidAccessToken.mockResolvedValue(null)

    const sb = makeSupabaseMock({
      lead_sla: [
        { data: { lead_id: 'lead-1' }, error: null }, // CAS ganho
        { data: SLA_ROW, error: null }, // hidratação deadline_at
      ],
      leads: [{ data: LEAD_ROW, error: null }],
      notificacoes_envios: [{ data: { id: 'n1' }, error: null }],
    })

    const result = await sendNotificacaoSla(sb, { evento: 'warning', leadId: 'lead-1' })

    expect(mockedPostDm).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.skipped).toBeUndefined()
  })

  it('warning, CAS perde (0 linhas — já enviado/concorrente) → skipped, postDm NUNCA chamado', async () => {
    const sb = makeSupabaseMock({
      lead_sla: [{ data: null, error: null }], // CAS perdido
    })

    const result = await sendNotificacaoSla(sb, { evento: 'warning', leadId: 'lead-1' })

    expect(result).toEqual({ ok: true, skipped: 'already_sent' })
    expect(mockedPostDm).not.toHaveBeenCalled()
  })

  it('warning, sem token Google → createFollowupEvent NUNCA chamado; DM ainda enviada (fallback Slack-only)', async () => {
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedGetValidAccessToken.mockResolvedValue(null)

    const sb = makeSupabaseMock({
      lead_sla: [
        { data: { lead_id: 'lead-1' }, error: null },
        { data: SLA_ROW, error: null },
      ],
      leads: [{ data: LEAD_ROW, error: null }],
      notificacoes_envios: [{ data: { id: 'n1' }, error: null }],
    })

    const result = await sendNotificacaoSla(sb, { evento: 'warning', leadId: 'lead-1' })

    expect(mockedCreateFollowupEvent).not.toHaveBeenCalled()
    expect(mockedPostDm).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.calendar?.skipped).toBe('no_token')
  })

  it('warning, com token Google → createFollowupEvent chamado; calendar_event_id persistido em lead_sla', async () => {
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedGetValidAccessToken.mockResolvedValue('access-token-x')
    mockedCreateFollowupEvent.mockResolvedValue({ ok: true, eventId: 'evt-1' })

    const sb = makeSupabaseMock({
      lead_sla: [
        { data: { lead_id: 'lead-1' }, error: null }, // CAS ganho
        { data: SLA_ROW, error: null }, // hidratação
        { data: null, error: null }, // update calendar_event_id
      ],
      leads: [{ data: LEAD_ROW, error: null }],
      notificacoes_envios: [{ data: { id: 'n1' }, error: null }],
    })

    const result = await sendNotificacaoSla(sb, { evento: 'warning', leadId: 'lead-1' })

    expect(mockedCreateFollowupEvent).toHaveBeenCalledTimes(1)
    expect(result.calendar?.ok).toBe(true)
    const fromCalls = (sb.from as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(fromCalls.filter((c: unknown[]) => c[0] === 'lead_sla').length).toBe(3)
  })

  it('escalonamento, CAS ganha, com SLACK_GERENCIA_CHANNEL_ID → postToChannel (chat.postMessage) chamado 1x', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ts: '2.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const sb = makeSupabaseMock({
      lead_sla: [
        { data: { lead_id: 'lead-1' }, error: null },
        { data: SLA_ROW, error: null },
      ],
      leads: [{ data: LEAD_ROW, error: null }],
      notificacoes_envios: [{ data: { id: 'n1' }, error: null }],
    })

    const result = await sendNotificacaoSla(sb, { evento: 'escalonamento', leadId: 'lead-1' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.skipped).toBeUndefined()
  })

  it('escalonamento, sem SLACK_GERENCIA_CHANNEL_ID → fail-safe: skipped, nada postado, sem throw (D-04)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const originalChannel = process.env.SLACK_GERENCIA_CHANNEL_ID
    delete process.env.SLACK_GERENCIA_CHANNEL_ID

    vi.resetModules()
    const { sendNotificacaoSla: freshSend } = await import('../sla.ts')

    const sb = makeSupabaseMock({
      lead_sla: [{ data: { lead_id: 'lead-1' }, error: null }], // CAS ganho
      notificacoes_envios: [{ data: { id: 'n1' }, error: null }],
    })

    const result = await freshSend(sb, { evento: 'escalonamento', leadId: 'lead-1' })

    expect(result).toEqual({ ok: true, skipped: 'no_gerencia_channel' })
    expect(fetchSpy).not.toHaveBeenCalled()

    process.env.SLACK_GERENCIA_CHANNEL_ID = originalChannel
  })

  it('escalonamento, CAS perde → skipped already_sent, sem postar', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const sb = makeSupabaseMock({
      lead_sla: [{ data: null, error: null }], // CAS perdido
    })

    const result = await sendNotificacaoSla(sb, { evento: 'escalonamento', leadId: 'lead-1' })

    expect(result).toEqual({ ok: true, skipped: 'already_sent' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
