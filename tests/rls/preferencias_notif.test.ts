import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para perfis.preferencias_notif (migration 035).
//
// Valida:
//   - Consultor lê SUA própria coluna preferencias_notif (RLS ok)
//   - Consultor NÃO consegue UPDATE em preferencias_notif de OUTRO perfil
//   - Smart default: perfil sem slack_user_id → tarefa.email=true, tarefa.slack=false
//
// Pré-requisito: .env.test com QA_DIRETOR_*, QA_CONSULTOR_*, VITE_SUPABASE_*.
// Sem isso, suíte é PULADA (não falha) — describe.skipIf abaixo.

const envPath = resolve(__dirname, '../../.env.test')
const env: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const QA = {
  diretorEmail: env.QA_DIRETOR_EMAIL,
  diretorPass: env.QA_DIRETOR_PASSWORD,
  consultorEmail: env.QA_CONSULTOR_EMAIL,
  consultorPass: env.QA_CONSULTOR_PASSWORD,
}

const configurado = !!(URL && ANON && QA.diretorEmail && QA.diretorPass && QA.consultorEmail && QA.consultorPass)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}

interface PrefsRow {
  preferencias_notif: {
    tarefa?: { slack?: boolean; email?: boolean }
    cadencia?: { slack?: boolean; email?: boolean }
    renovacao?: { slack?: boolean; email?: boolean }
    indicacao?: { slack?: boolean; email?: boolean }
  } | null
  slack_user_id: string | null
}

describe.skipIf(!configurado)('RLS — perfis.preferencias_notif (migration 035)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let consultorUid: string
  let diretorUid: string

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    consultor = c.client
    diretor = d.client
    consultorUid = c.uid
    diretorUid = d.uid
  })

  it('consultor consegue ler própria preferencias_notif', async () => {
    const { data, error } = await consultor
      .from('perfis')
      .select('preferencias_notif, slack_user_id')
      .eq('id', consultorUid)
      .single<PrefsRow>()
    expect(error).toBeNull()
    expect(data?.preferencias_notif).toBeDefined()
    // 4 tipos esperados
    expect(data?.preferencias_notif).toHaveProperty('tarefa')
    expect(data?.preferencias_notif).toHaveProperty('cadencia')
    expect(data?.preferencias_notif).toHaveProperty('renovacao')
    expect(data?.preferencias_notif).toHaveProperty('indicacao')
  })

  it('smart default: e-mail sempre ON; Slack reflete presença de slack_user_id', async () => {
    const { data } = await consultor
      .from('perfis')
      .select('preferencias_notif, slack_user_id')
      .eq('id', consultorUid)
      .single<PrefsRow>()
    expect(data?.preferencias_notif?.tarefa?.email).toBe(true)
    const hasSlack = data?.slack_user_id !== null && data?.slack_user_id !== undefined
    expect(data?.preferencias_notif?.tarefa?.slack).toBe(hasSlack)
  })

  it('consultor NÃO consegue UPDATE em preferencias_notif de outro perfil (diretor)', async () => {
    const { error, data } = await consultor
      .from('perfis')
      .update({
        preferencias_notif: {
          tarefa:    { slack: false, email: false },
          cadencia:  { slack: false, email: false },
          renovacao: { slack: false, email: false },
          indicacao: { slack: false, email: false },
        },
      })
      .eq('id', diretorUid)
      .select('id')

    // RLS impede a escrita — ou retorna erro, ou retorna data vazia
    // (depende de como a policy está formulada; ambos provam que não atualizou)
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'consultor não pode tocar prefs de outro perfil').toBe(true)
  })
})

describe.skipIf(configurado)('RLS — perfis.preferencias_notif — PULADO', () => {
  it('configure .env.test (usuários QA) para rodar os testes de RLS', () => {
    expect(true).toBe(true)
  })
})
