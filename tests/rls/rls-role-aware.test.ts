import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes de RLS role-aware (migração 029).
// Usam JWT REAL de cada role — instanciam o cliente Supabase e fazem login,
// validando o que cada role enxerga. SQL direto ignoraria a RLS.
//
// Pré-requisito: .env.test com QA_DIRETOR_*, QA_CONSULTOR_*, VITE_SUPABASE_*.
// Sem isso, a suíte é PULADA (não falha) — ver describe.skipIf abaixo.

// ── Carrega .env.test ────────────────────────────────────────────────────────
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

describe.skipIf(!configurado)('RLS role-aware (migração 029)', () => {
  let diretor: SupabaseClient
  let consultor: SupabaseClient
  let consultorUid: string

  beforeAll(async () => {
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    diretor = d.client
    consultor = c.client
    consultorUid = c.uid
  })

  it('diretor enxerga ao menos tantos leads quanto o consultor', async () => {
    const { data: dLeads } = await diretor.from('leads').select('id')
    const { data: cLeads } = await consultor.from('leads').select('id')
    expect((dLeads?.length ?? 0)).toBeGreaterThanOrEqual(cLeads?.length ?? 0)
  })

  it('consultor só vê leads próprios ou sem responsável (can_see_responsavel)', async () => {
    const { data, error } = await consultor.from('leads').select('id, responsavel_id')
    expect(error).toBeNull()
    for (const lead of data ?? []) {
      const ok = lead.responsavel_id === consultorUid || lead.responsavel_id === null
      expect(ok, `lead ${lead.id} tem responsavel_id ${lead.responsavel_id}`).toBe(true)
    }
  })

  it('consultor só vê clientes próprios ou sem responsável', async () => {
    const { data, error } = await consultor.from('clientes').select('id, responsavel_id')
    expect(error).toBeNull()
    for (const c of data ?? []) {
      expect(c.responsavel_id === consultorUid || c.responsavel_id === null).toBe(true)
    }
  })

  it('consultor só vê contratos próprios ou sem responsável', async () => {
    const { data, error } = await consultor.from('contratos').select('id, responsavel_id')
    expect(error).toBeNull()
    for (const ct of data ?? []) {
      expect(ct.responsavel_id === consultorUid || ct.responsavel_id === null).toBe(true)
    }
  })

  it('WITH CHECK: consultor não cria lead atribuído a outro responsável', async () => {
    // responsavel_id falso (uuid aleatório) deve ser barrado pela policy
    const { error } = await consultor.from('leads').insert({
      nome: '[QA-RLS-TEST]',
      empresa: 'QA',
      segmento: 'outro',
      telefone: '',
      origem: 'outro',
      status: 'classificacao',
      responsavel_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error, 'insert com responsavel_id alheio deveria ser barrado pela RLS').not.toBeNull()
  })
})

describe.skipIf(configurado)('RLS role-aware — PULADO', () => {
  it('configure .env.test (usuários QA) para rodar os testes de RLS', () => {
    expect(true).toBe(true)
  })
})
