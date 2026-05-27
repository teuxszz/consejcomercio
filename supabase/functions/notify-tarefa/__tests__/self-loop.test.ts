import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks de ambiente Deno ──────────────────────────────────────────────────
// O handler em index.ts chama `serve(cb)` — capturamos o cb para invocar
// manualmente no teste. Deno.env.get devolve stubs constantes.

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

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [{ hoje: 0, mes: 0 }], error: null })),
    auth: { admin: { generateLink: vi.fn(() => Promise.resolve({ data: null, error: null })) } },
  }),
}))

// Mock dos helpers _shared — verificamos que NÃO são chamados no self-loop
const sendEmailMock = vi.fn()
const loadPrefsMock = vi.fn()
const findSlackUserIdMock = vi.fn()
const findDiretoresMock = vi.fn(() => Promise.resolve([]))
const findPerfilNomeMock = vi.fn(() => Promise.resolve('Nome'))

vi.mock('../../_shared/auth.ts', () => ({
  constantTimeAuthCheck: () => true, // bypass auth nos testes
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

// Importa o módulo APÓS configurar os mocks — isso dispara o serve(cb) e
// captura capturedHandler.
beforeEach(async () => {
  sendEmailMock.mockReset()
  loadPrefsMock.mockReset()
  findSlackUserIdMock.mockReset()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
  if (!capturedHandler) {
    await import('../index.ts')
  }
})

function makeRequest(body: unknown): Request {
  return new Request('https://example/notify-tarefa', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer secret-test',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('notify-tarefa — self_loop guard (D-06)', () => {
  it('criado_por_id == atribuido_a_id → returns { ok: true, skipped: "self_loop" } sem chamar Slack/email', async () => {
    const req = makeRequest({
      type: 'INSERT',
      table: 'tarefas',
      record: {
        id: 't1',
        titulo: 'auto',
        descricao: null,
        tipo: 'ligar',
        prioridade: 'media',
        status: 'aberta',
        atribuido_a_id: 'p1',
        criado_por_id: 'p1',
        entidade_tipo: null,
        entidade_id: null,
        data_vencimento: null,
        notificar: true,
      },
      old_record: null,
    })

    const res = await capturedHandler!(req)
    const body = await res.json()
    expect(body.skipped).toBe('self_loop')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(loadPrefsMock).not.toHaveBeenCalled()
    expect(findSlackUserIdMock).not.toHaveBeenCalled()
  })

  it('criado_por_id !== atribuido_a_id → NÃO short-circuita (entra no fluxo de lookup prefs)', async () => {
    // Configurar loadPrefs para retornar prefs com tudo OFF (sem dispatch real)
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: false, email: false },
      cadencia: { slack: false, email: false },
      renovacao: { slack: false, email: false },
      indicacao: { slack: false, email: false },
    })
    findSlackUserIdMock.mockResolvedValue(null)

    const req = makeRequest({
      type: 'INSERT',
      table: 'tarefas',
      record: {
        id: 't1',
        titulo: 'real',
        descricao: null,
        tipo: 'ligar',
        prioridade: 'media',
        status: 'aberta',
        atribuido_a_id: 'p1',
        criado_por_id: 'p2', // criador != atribuído
        entidade_tipo: null,
        entidade_id: null,
        data_vencimento: null,
        notificar: true,
      },
      old_record: null,
    })

    const res = await capturedHandler!(req)
    const body = await res.json()
    expect(body.skipped).not.toBe('self_loop')
    // Pelo menos o loadPrefs deve ter sido invocado para o atribuído
    expect(loadPrefsMock).toHaveBeenCalled()
  })
})
