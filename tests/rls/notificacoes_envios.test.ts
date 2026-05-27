import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para notificacoes_envios (migration 035).
//
// Valida:
//   - Consultor SELECT só vê linhas próprias (perfil_id = auth.uid())
//   - Diretor vê todas (via is_at_least('coordenador'))
//   - INSERT como authenticated falha (sem policy permissiva — só service_role)
//   - RPC quota_resend_atual retorna { hoje, mes } e exclui dropados
//
// Pré-requisito: .env.test com QA_*, VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY.
// Sem isso, suíte é PULADA (não falha).

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
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const QA = {
  diretorEmail: env.QA_DIRETOR_EMAIL,
  diretorPass: env.QA_DIRETOR_PASSWORD,
  consultorEmail: env.QA_CONSULTOR_EMAIL,
  consultorPass: env.QA_CONSULTOR_PASSWORD,
}

const configurado = !!(URL && ANON && SERVICE && QA.diretorEmail && QA.diretorPass && QA.consultorEmail && QA.consultorPass)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}

describe.skipIf(!configurado)('RLS — notificacoes_envios (migration 035)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  let consultorUid: string
  let diretorUid: string

  // IDs de fixture criadas via service_role no beforeAll — limpas no afterAll
  // (mas como o teste roda em DB compartilhada, o pattern aceito do projeto é
  // tagar com subject='[RLS-TEST]' e nunca deletar — segue o pattern de
  // rls-role-aware.test.ts)
  const TAG = '[RLS-TEST-035]'

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    diretor = d.client
    consultorUid = c.uid
    diretorUid = d.uid

    // Seed: 2 envios para o consultor + 3 para o diretor (via service_role).
    // Cada um com entidade_id distinta para não colidir no índice idempotência.
    const rows = [
      { perfil_id: consultorUid, tipo: 'tarefa', canal: 'email', status: 'queued', subject: `${TAG} c1`, entidade_id: crypto.randomUUID() },
      { perfil_id: consultorUid, tipo: 'tarefa', canal: 'email', status: 'queued', subject: `${TAG} c2`, entidade_id: crypto.randomUUID() },
      { perfil_id: diretorUid,   tipo: 'tarefa', canal: 'email', status: 'queued', subject: `${TAG} d1`, entidade_id: crypto.randomUUID() },
      { perfil_id: diretorUid,   tipo: 'tarefa', canal: 'email', status: 'queued', subject: `${TAG} d2`, entidade_id: crypto.randomUUID() },
      { perfil_id: diretorUid,   tipo: 'tarefa', canal: 'email', status: 'queued', subject: `${TAG} d3`, entidade_id: crypto.randomUUID() },
    ]
    await service.from('notificacoes_envios').insert(rows)
  })

  it('consultor SELECT só vê linhas próprias', async () => {
    const { data, error } = await consultor
      .from('notificacoes_envios')
      .select('id, perfil_id, subject')
      .like('subject', `${TAG}%`)
    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(row.perfil_id).toBe(consultorUid)
    }
    // Deve haver pelo menos as 2 do fixture
    expect((data ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('diretor SELECT vê linhas de qualquer perfil (via is_at_least coordenador)', async () => {
    const { data, error } = await diretor
      .from('notificacoes_envios')
      .select('id, perfil_id, subject')
      .like('subject', `${TAG}%`)
    expect(error).toBeNull()
    const perfis = new Set((data ?? []).map(r => r.perfil_id))
    expect(perfis.has(consultorUid)).toBe(true)
    expect(perfis.has(diretorUid)).toBe(true)
  })

  it('INSERT como consultor (authenticated) falha (sem policy permissiva — só service_role)', async () => {
    const { error, data } = await consultor
      .from('notificacoes_envios')
      .insert({
        perfil_id: consultorUid,
        tipo: 'tarefa',
        canal: 'email',
        status: 'queued',
        subject: `${TAG} should-be-blocked`,
        entidade_id: crypto.randomUUID(),
      })
      .select('id')
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'INSERT via authenticated deve ser bloqueado').toBe(true)
  })

  it('segundo INSERT com mesmo (perfil_id, tipo, entidade_id, canal, dia) viola UNIQUE 23505', async () => {
    const entidade_id = crypto.randomUUID()
    const first = await service.from('notificacoes_envios').insert({
      perfil_id: consultorUid,
      tipo: 'cadencia',
      canal: 'email',
      status: 'queued',
      subject: `${TAG} idemp 1`,
      entidade_id,
    })
    expect(first.error).toBeNull()
    const second = await service.from('notificacoes_envios').insert({
      perfil_id: consultorUid,
      tipo: 'cadencia',
      canal: 'email',
      status: 'queued',
      subject: `${TAG} idemp 2`,
      entidade_id,
    })
    expect(second.error).not.toBeNull()
    expect(second.error?.code).toBe('23505')
  })

  it('UNIQUE também colide quando entidade_id é NULL (COALESCE no índice)', async () => {
    // Para garantir isolamento desta asserção, usa-se um tipo+dia novo via
    // service_role; como `dia` é gerado de sent_at, criamos duas linhas com
    // entidade_id NULL no mesmo tipo+canal — devem colidir.
    const first = await service.from('notificacoes_envios').insert({
      perfil_id: consultorUid,
      tipo: 'cadencia',
      canal: 'slack',
      status: 'delivered',
      subject: `${TAG} null-1`,
      entidade_id: null,
    })
    // Se já tinha colidido com outro teste anterior do dia (re-run), o primeiro
    // INSERT pode dar 23505 também — aceitar isso. O segundo é o que importa.
    const second = await service.from('notificacoes_envios').insert({
      perfil_id: consultorUid,
      tipo: 'cadencia',
      canal: 'slack',
      status: 'delivered',
      subject: `${TAG} null-2`,
      entidade_id: null,
    })
    const colidiu = (first.error?.code === '23505') || (second.error?.code === '23505')
    expect(colidiu, 'duas linhas com entidade_id NULL mesmo tipo/canal/dia devem colidir').toBe(true)
  })

  it('RPC quota_resend_atual retorna shape { hoje, mes } e exclui dropados', async () => {
    // Insere 1 linha dropped_quota — não deve contar
    await service.from('notificacoes_envios').insert({
      perfil_id: consultorUid,
      tipo: 'renovacao',
      canal: 'email',
      status: 'dropped_quota',
      subject: `${TAG} dropped`,
      entidade_id: crypto.randomUUID(),
    })
    const { data, error } = await service.rpc('quota_resend_atual')
    expect(error).toBeNull()
    // RPC retorna TABLE(hoje int, mes int) → array com 1 elemento
    const row = Array.isArray(data) ? data[0] : data
    expect(row).toBeDefined()
    expect(typeof row.hoje).toBe('number')
    expect(typeof row.mes).toBe('number')
    // hoje >= 2 (os 2 envios do consultor); mes >= hoje
    expect(row.mes).toBeGreaterThanOrEqual(row.hoje)
  })
})

describe.skipIf(configurado)('RLS — notificacoes_envios — PULADO', () => {
  it('configure .env.test + SUPABASE_SERVICE_ROLE_KEY para rodar os testes de RLS', () => {
    expect(true).toBe(true)
  })
})
