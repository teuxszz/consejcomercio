import { describe, it, expect, vi, beforeEach } from 'vitest'

// Env vars precisam estar setados ANTES do import de aprovacoes.ts (o módulo
// captura SLACK_BOT_TOKEN e APP_URL no escopo global no module-load).
// vi.hoisted garante execução antes dos imports (que também são hoisted).
vi.hoisted(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
  process.env.APP_URL = 'https://crm.consej.com.br'
})

// Mock dos URL imports do Deno antes de importar aprovacoes.ts
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({}))
vi.mock('https://esm.sh/web-push@3.6.7', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))

// Mocks dos helpers — isolar a unidade sendNotificacaoAprovacao
vi.mock('../email.ts', () => ({
  sendEmail: vi.fn(),
}))
vi.mock('../push.ts', () => ({
  sendPush: vi.fn(),
}))
vi.mock('../slack.ts', () => ({
  postDm: vi.fn(),
}))
vi.mock('../perfis.ts', () => ({
  findSlackUserId: vi.fn(),
  loadPrefs: vi.fn(),
}))

import { sendEmail } from '../email.ts'
import { sendPush } from '../push.ts'
import { postDm } from '../slack.ts'
import { findSlackUserId, loadPrefs } from '../perfis.ts'
import { sendNotificacaoAprovacao } from '../aprovacoes.ts'

const mockedSendEmail   = sendEmail as unknown as ReturnType<typeof vi.fn>
const mockedSendPush    = sendPush as unknown as ReturnType<typeof vi.fn>
const mockedPostDm      = postDm as unknown as ReturnType<typeof vi.fn>
const mockedFindSlackId = findSlackUserId as unknown as ReturnType<typeof vi.fn>
const mockedLoadPrefs   = loadPrefs as unknown as ReturnType<typeof vi.fn>

/** Mock mínimo do supabase client para o SELECT perfis.email/nome. */
function makeSupabaseMock(perfil: { email: string | null; nome: string | null } | null = { email: 'consultor@consej.com.br', nome: 'Gabriel' }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: perfil, error: null })),
        })),
      })),
    })),
  } as never
}

const FULL_PREFS = {
  tarefa:     { slack: true, email: true, push: true },
  cadencia:   { slack: true, email: true, push: true },
  renovacao:  { slack: true, email: true, push: true },
  indicacao:  { slack: true, email: true, push: true },
  documentos: { slack: true, email: true, push: true },
}

beforeEach(() => {
  vi.clearAllMocks()
  // Defaults: env vars exigidas pelo helper
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
  process.env.APP_URL = 'https://crm.consej.com.br'
})

describe('sendNotificacaoAprovacao', () => {
  it('dispara sendEmail + sendPush + sendSlack em paralelo via Promise.allSettled (happy path)', async () => {
    mockedLoadPrefs.mockResolvedValue(FULL_PREFS)
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedSendEmail.mockResolvedValue({ ok: true, status: 'queued', resendId: 'r1' })
    mockedSendPush.mockResolvedValue({ ok: true, status: 'queued', delivered: 1, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'p1',
      evento: 'cliente_aprovou',
      docId: 'doc1',
      clienteNome: 'ACME Ltda',
      docNomeArquivo: 'proposta.pdf',
    })

    expect(result.ok).toBe(true)
    expect(mockedPostDm).toHaveBeenCalledTimes(1)
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendPush).toHaveBeenCalledTimes(1)
    expect(result.slack.ok).toBe(true)
    expect(result.email.ok).toBe(true)
    expect(result.push.ok).toBe(true)
  })

  it('respeita prefs.documentos.email=false → emailP retorna skipped, sendEmail NUNCA chamada', async () => {
    const prefs = { ...FULL_PREFS, documentos: { slack: true, email: false, push: true } }
    mockedLoadPrefs.mockResolvedValue(prefs)
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedSendPush.mockResolvedValue({ ok: true, status: 'queued', delivered: 1, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'p1',
      evento: 'cliente_aprovou',
      docId: 'doc1',
      clienteNome: 'ACME',
      docNomeArquivo: 'doc.pdf',
    })

    expect(mockedSendEmail).not.toHaveBeenCalled()
    expect(result.email).toEqual({ ok: true, skipped: 'email_off' })
    expect(result.ok).toBe(true)
  })

  it('skipSlack=true (D-12) pula canal Slack mantendo email+push (reenviar-lembrete)', async () => {
    mockedLoadPrefs.mockResolvedValue(FULL_PREFS)
    mockedFindSlackId.mockResolvedValue('U123')
    mockedSendEmail.mockResolvedValue({ ok: true, status: 'queued', resendId: 'r1' })
    mockedSendPush.mockResolvedValue({ ok: true, status: 'queued', delivered: 1, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'cliente-perfil-id',
      evento: 'aprovacao_stale',
      docId: 'doc1',
      clienteNome: 'ACME',
      docNomeArquivo: 'contrato.pdf',
      skipSlack: true,
    })

    expect(mockedPostDm).not.toHaveBeenCalled()
    expect(result.slack).toEqual({ ok: true, skipped: 'slack_off' })
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendPush).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('Promise.allSettled isola falha — sendEmail rejeita mas Slack/Push continuam', async () => {
    mockedLoadPrefs.mockResolvedValue(FULL_PREFS)
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedSendEmail.mockRejectedValue(new Error('Resend boom'))
    mockedSendPush.mockResolvedValue({ ok: true, status: 'queued', delivered: 1, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'p1',
      evento: 'cliente_pediu_revisao',
      docId: 'doc1',
      clienteNome: 'ACME',
      docNomeArquivo: 'doc.pdf',
      comentarioCliente: 'falta corrigir cláusula 5',
    })

    expect(mockedPostDm).toHaveBeenCalledTimes(1)
    expect(mockedSendPush).toHaveBeenCalledTimes(1)
    expect(result.slack.ok).toBe(true)
    expect(result.push.ok).toBe(true)
    expect(result.email.ok).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('idempotência — sendEmail retorna skipped_idempotent → result.email.ok=true (skipped é sucesso)', async () => {
    mockedLoadPrefs.mockResolvedValue(FULL_PREFS)
    mockedFindSlackId.mockResolvedValue('U123')
    mockedPostDm.mockResolvedValue({ ok: true, ts: '1.0' })
    mockedSendEmail.mockResolvedValue({ ok: true, status: 'skipped_idempotent' })
    mockedSendPush.mockResolvedValue({ ok: true, status: 'skipped_idempotent', delivered: 0, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'p1',
      evento: 'cliente_subiu_doc',
      docId: 'doc1',
      clienteNome: 'ACME',
      docNomeArquivo: 'rg.jpg',
    })

    expect(result.ok).toBe(true)
    expect(result.email.status).toBe('skipped_idempotent')
  })

  it('sem slack_user_id → wantSlack=false, sendEmail/push disparam normalmente', async () => {
    mockedLoadPrefs.mockResolvedValue(FULL_PREFS)
    mockedFindSlackId.mockResolvedValue(null)
    mockedSendEmail.mockResolvedValue({ ok: true, status: 'queued', resendId: 'r1' })
    mockedSendPush.mockResolvedValue({ ok: true, status: 'queued', delivered: 1, failed: 0, cleaned: 0 })

    const sb = makeSupabaseMock()
    const result = await sendNotificacaoAprovacao(sb, {
      perfilId: 'p1',
      evento: 'cliente_aprovou',
      docId: 'doc1',
      clienteNome: 'ACME',
      docNomeArquivo: 'doc.pdf',
    })

    expect(mockedPostDm).not.toHaveBeenCalled()
    expect(result.slack).toEqual({ ok: true, skipped: 'slack_off' })
    expect(mockedSendEmail).toHaveBeenCalledTimes(1)
    expect(mockedSendPush).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('subjectFor mapeia os 4 eventos em PT-BR — verifica via subject passado ao sendEmail', async () => {
    mockedLoadPrefs.mockResolvedValue({ ...FULL_PREFS, documentos: { slack: false, email: true, push: false } })
    mockedFindSlackId.mockResolvedValue(null)
    mockedSendEmail.mockResolvedValue({ ok: true, status: 'queued' })

    const sb = makeSupabaseMock()

    const cases: Array<{ evento: 'cliente_aprovou' | 'cliente_pediu_revisao' | 'cliente_subiu_doc' | 'aprovacao_stale'; expected: string }> = [
      { evento: 'cliente_aprovou',       expected: 'ACME aprovou doc.pdf' },
      { evento: 'cliente_pediu_revisao', expected: 'ACME pediu revisão em doc.pdf' },
      { evento: 'cliente_subiu_doc',     expected: 'ACME enviou doc.pdf' },
      { evento: 'aprovacao_stale',       expected: 'Aprovação parada há +5 dias — doc.pdf' },
    ]

    for (const c of cases) {
      mockedSendEmail.mockClear()
      await sendNotificacaoAprovacao(sb, {
        perfilId: 'p1',
        evento: c.evento,
        docId: 'doc1',
        clienteNome: 'ACME',
        docNomeArquivo: 'doc.pdf',
      })
      const call = mockedSendEmail.mock.calls[0]?.[1]
      expect(call?.subject).toBe(c.expected)
    }
  })
})
