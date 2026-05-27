import { describe, it, expect, vi, beforeEach } from 'vitest'

let capturedHandler: ((req: Request) => Promise<Response>) | null = null

vi.stubGlobal('Deno', {
  env: {
    get: (k: string) => {
      const env: Record<string, string> = {
        SLACK_BOT_TOKEN: 'xoxb-test',
        WEBHOOK_TAREFA_SECRET: 'secret-test',
        APP_URL: 'https://app.test',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        RESEND_API_KEY: 'resend-test',
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

// Tracker para o lookup de destinatário (supabase.from('perfis').select('email, nome'))
let destinatarioEmail: string | null = 'a@b.com'

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => {
            if (table === 'perfis') {
              return Promise.resolve({
                data: { email: destinatarioEmail, nome: 'Destinatário' },
                error: null,
              })
            }
            return Promise.resolve({ data: null, error: null })
          }),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [{ hoje: 0, mes: 0 }], error: null })),
    auth: { admin: { generateLink: vi.fn(() => Promise.resolve({ data: null, error: null })) } },
  }),
}))

const sendEmailMock = vi.fn(() => Promise.resolve({ ok: true, status: 'queued' as const }))
const loadPrefsMock = vi.fn()
const findSlackUserIdMock = vi.fn()
const findDiretoresMock = vi.fn(() => Promise.resolve([] as Array<{ id: string; email: string }>))
const findPerfilNomeMock = vi.fn(() => Promise.resolve('Nome'))

vi.mock('../../_shared/auth.ts', () => ({
  constantTimeAuthCheck: () => true,
}))
vi.mock('../../_shared/email.ts', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  generateMagicLink: vi.fn(() => Promise.resolve('https://app.test/me')),
}))
vi.mock('../../_shared/perfis.ts', () => ({
  loadPrefs: (...args: unknown[]) => loadPrefsMock(...args),
  findSlackUserId: (...args: unknown[]) => findSlackUserIdMock(...args),
  findDiretores: (...args: unknown[]) => findDiretoresMock(...args),
  findPerfilNome: (...args: unknown[]) => findPerfilNomeMock(...args),
}))
vi.mock('../../_shared/templates/render.ts', () => ({
  renderTarefa: () => '<p>html</p>',
}))

beforeEach(async () => {
  sendEmailMock.mockClear()
  sendEmailMock.mockResolvedValue({ ok: true, status: 'queued' })
  loadPrefsMock.mockReset()
  findSlackUserIdMock.mockReset()
  findDiretoresMock.mockReset()
  findDiretoresMock.mockResolvedValue([])
  destinatarioEmail = 'a@b.com'
  // Slack postDm / openDmChannel via fetch — mock 200 OK
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = url.toString()
    if (u.includes('slack.com/api/conversations.open')) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, channel: { id: 'D123' } }), { status: 200 }))
    }
    if (u.includes('slack.com/api/chat.postMessage')) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, ts: '1700.0001' }), { status: 200 }))
    }
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
  if (!capturedHandler) {
    await import('../index.ts')
  }
})

function makeRequest(body: unknown): Request {
  return new Request('https://example/notify-tarefa', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret-test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const tarefaBase = {
  id: 't1',
  titulo: 'Ligar para João',
  descricao: null,
  tipo: 'ligar',
  prioridade: 'media',
  status: 'aberta',
  atribuido_a_id: 'p1',
  criado_por_id: 'p2',
  entidade_tipo: null,
  entidade_id: null,
  data_vencimento: null,
  notificar: true,
}

describe('notify-tarefa — Promise.all dispatch (D-03)', () => {
  it('ambos ON → postDm chamado + sendEmail chamado (1x)', async () => {
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: true, email: true },
      cadencia: { slack: true, email: true },
      renovacao: { slack: true, email: true },
      indicacao: { slack: true, email: true },
    })
    findSlackUserIdMock.mockResolvedValue('U123')

    const req = makeRequest({ type: 'INSERT', table: 'tarefas', record: tarefaBase, old_record: null })
    const res = await capturedHandler!(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    // postDm faz 2 fetches Slack (open + postMessage)
    const slackCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      c[0]?.toString().includes('slack.com'),
    )
    expect(slackCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('só email → sendEmail 1x, NENHUMA chamada Slack', async () => {
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: false, email: true },
      cadencia: { slack: false, email: true },
      renovacao: { slack: false, email: true },
      indicacao: { slack: false, email: true },
    })
    findSlackUserIdMock.mockResolvedValue('U123')

    const req = makeRequest({ type: 'INSERT', table: 'tarefas', record: tarefaBase, old_record: null })
    await capturedHandler!(req)

    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const slackCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      c[0]?.toString().includes('slack.com'),
    )
    expect(slackCalls.length).toBe(0)
  })

  it('só slack → sendEmail NÃO chamado, postDm chamado', async () => {
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: true, email: false },
      cadencia: { slack: true, email: false },
      renovacao: { slack: true, email: false },
      indicacao: { slack: true, email: false },
    })
    findSlackUserIdMock.mockResolvedValue('U123')

    const req = makeRequest({ type: 'INSERT', table: 'tarefas', record: tarefaBase, old_record: null })
    await capturedHandler!(req)

    expect(sendEmailMock).not.toHaveBeenCalled()
    const slackCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      c[0]?.toString().includes('slack.com'),
    )
    expect(slackCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('nenhum (ambos OFF) → nem email nem slack', async () => {
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: false, email: false },
      cadencia: { slack: false, email: false },
      renovacao: { slack: false, email: false },
      indicacao: { slack: false, email: false },
    })
    findSlackUserIdMock.mockResolvedValue('U123')

    const req = makeRequest({ type: 'INSERT', table: 'tarefas', record: tarefaBase, old_record: null })
    await capturedHandler!(req)

    expect(sendEmailMock).not.toHaveBeenCalled()
    const slackCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      c[0]?.toString().includes('slack.com'),
    )
    expect(slackCalls.length).toBe(0)
  })

  it('fallback diretor (D-05): destinatário sem email → sendEmail para cada diretor com prefs.email=true', async () => {
    destinatarioEmail = null // destinatário não tem email
    findDiretoresMock.mockResolvedValue([
      { id: 'd1', email: 'd1@consej.com' },
      { id: 'd2', email: 'd2@consej.com' },
    ])
    // loadPrefs chamado para destinatário original (p1) + para cada diretor
    // Sequência de retornos: 1º (p1) sem matter, depois p1 again no email loop,
    // depois d1 e d2.
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: false, email: true },
      cadencia: { slack: false, email: true },
      renovacao: { slack: false, email: true },
      indicacao: { slack: false, email: true },
    })
    findSlackUserIdMock.mockResolvedValue(null)

    const req = makeRequest({ type: 'INSERT', table: 'tarefas', record: tarefaBase, old_record: null })
    const res = await capturedHandler!(req)
    const body = await res.json()

    expect(body.fallback_diretor).toBe(true)
    // sendEmail chamado uma vez por diretor (2 diretores)
    expect(sendEmailMock).toHaveBeenCalledTimes(2)
    expect(findDiretoresMock).toHaveBeenCalled()
  })
})
