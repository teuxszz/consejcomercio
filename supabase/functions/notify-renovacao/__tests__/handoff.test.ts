import { describe, it, expect, vi, beforeEach } from 'vitest'

// D-07 hand-off regression test:
// Garante que notify-renovacao lê contratos.responsavel_id no MOMENTO do
// disparo do cron — não snapshot. Se o responsável muda entre o schedule e o
// dispatch, o sendEmail é chamado com o valor CORRENTE (novo responsável).

let capturedHandler: ((req: Request) => Promise<Response>) | null = null

vi.stubGlobal('Deno', {
  env: {
    get: (k: string) => {
      const env: Record<string, string> = {
        SLACK_BOT_TOKEN: 'xoxb-test',
        SLACK_LEADS_CHANNEL_ID: 'C123',
        WEBHOOK_RENOVACAO_SECRET: 'secret-test',
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

// O responsavel_id "atual" no momento da query — mutável entre testes para
// simular hand-off ocorrendo entre cron-schedule e dispatch.
let responsavelAtual: string | null = 'responsavel-novo'

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'notificacoes_renovacao_enviadas') {
        return {
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        }
      }
      if (table === 'contratos') {
        // SELECT hidratado — retorna responsavelAtual no momento da chamada
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'contrato-1',
                    data_fim: '2026-06-01',
                    valor_mensal: 5000,
                    valor_total: 60000,
                    tipo: 'consultoria',
                    cliente_id: 'cli-1',
                    responsavel_id: responsavelAtual,  // ← lido no momento, não cached
                    cliente: { nome: 'Cliente X', empresa: 'Empresa Y' },
                  },
                  error: null,
                }),
              ),
            })),
          })),
        }
      }
      if (table === 'perfis') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: { email: 'novo@consej.com', nome: 'Novo Responsável' },
                  error: null,
                }),
              ),
            })),
          })),
        }
      }
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }
    }),
    rpc: vi.fn(() => Promise.resolve({ data: [{ hoje: 0, mes: 0 }], error: null })),
    auth: { admin: { generateLink: vi.fn(() => Promise.resolve({ data: null, error: null })) } },
  }),
}))

const sendEmailMock = vi.fn(() => Promise.resolve({ ok: true, status: 'queued' as const }))
const loadPrefsMock = vi.fn()
const findDiretoresMock = vi.fn(() => Promise.resolve([] as Array<{ id: string; email: string }>))

vi.mock('../../_shared/auth.ts', () => ({
  constantTimeAuthCheck: () => true,
}))
vi.mock('../../_shared/email.ts', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  generateMagicLink: vi.fn(() => Promise.resolve('https://app.test/me?tab=notificacoes')),
}))
vi.mock('../../_shared/perfis.ts', () => ({
  loadPrefs: (...args: unknown[]) => loadPrefsMock(...args),
  findDiretores: (...args: unknown[]) => findDiretoresMock(...args),
}))
vi.mock('../../_shared/templates/render.ts', () => ({
  renderRenovacao: () => '<p>renovacao</p>',
}))

beforeEach(async () => {
  sendEmailMock.mockClear()
  sendEmailMock.mockResolvedValue({ ok: true, status: 'queued' })
  loadPrefsMock.mockReset()
  findDiretoresMock.mockReset()
  findDiretoresMock.mockResolvedValue([])

  // Slack post: succeed para chegar ao dispatchEmailRenovacao
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true, ts: '1700.0001' }), { status: 200 }),
  )

  if (!capturedHandler) {
    await import('../index.ts')
  }
})

function makeRequest(body: unknown): Request {
  return new Request('https://example/notify-renovacao', {
    method: 'POST',
    headers: { Authorization: 'Bearer secret-test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('notify-renovacao — D-07 hand-off de responsável', () => {
  it('lê responsavel_id ATUAL no dispatch (não snapshot), envia email para o novo', async () => {
    // Cenário: contratos.responsavel_id mudou para 'responsavel-novo'
    responsavelAtual = 'responsavel-novo'
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: true, email: true },
      cadencia: { slack: true, email: true },
      renovacao: { slack: true, email: true },
      indicacao: { slack: true, email: true },
    })

    const req = makeRequest({ contrato_id: 'contrato-1', dias_antes: 30 })
    const res = await capturedHandler!(req)
    expect(res.status).toBe(200)

    // sendEmail chamado UMA vez com perfilId = novo responsável (não algum valor anterior)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const call = sendEmailMock.mock.calls[0]
    const params = call[1] as { perfilId: string; tipo: string; entidadeTipo: string }
    expect(params.perfilId).toBe('responsavel-novo')
    expect(params.tipo).toBe('renovacao')
    expect(params.entidadeTipo).toBe('contrato')
  })

  it('responsavel_id NULL aciona fallback diretor (D-05)', async () => {
    responsavelAtual = null
    findDiretoresMock.mockResolvedValue([
      { id: 'diretor-1', email: 'd1@consej.com' },
      { id: 'diretor-2', email: 'd2@consej.com' },
    ])
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: true, email: true },
      cadencia: { slack: true, email: true },
      renovacao: { slack: true, email: true },
      indicacao: { slack: true, email: true },
    })

    const req = makeRequest({ contrato_id: 'contrato-1', dias_antes: 60 })
    await capturedHandler!(req)

    // 2 diretores → 2 chamadas sendEmail
    expect(sendEmailMock).toHaveBeenCalledTimes(2)
    expect(findDiretoresMock).toHaveBeenCalled()
  })

  it('prefs.renovacao.email=false NÃO dispara sendEmail', async () => {
    responsavelAtual = 'responsavel-novo'
    loadPrefsMock.mockResolvedValue({
      tarefa: { slack: true, email: true },
      cadencia: { slack: true, email: true },
      renovacao: { slack: true, email: false },  // ← email OFF
      indicacao: { slack: true, email: true },
    })

    const req = makeRequest({ contrato_id: 'contrato-1', dias_antes: 30 })
    await capturedHandler!(req)

    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
