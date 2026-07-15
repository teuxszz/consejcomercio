import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para google_calendar_tokens (migration 042 — Phase 999.1 Plan 02).
//
// Valida (SLA-06):
//   - Nenhum usuário authenticated consegue SELECT em google_calendar_tokens,
//     nem da própria linha (T-999.1-01 — refresh_token é credencial de
//     terceiro de longa vida; RLS de leitura é ZERO).
//   - O usuário consegue gravar (INSERT/UPDATE) apenas a própria linha
//     (perfil_id = auth.uid()); gravar com perfil_id de outro usuário é
//     bloqueado por WITH CHECK (T-999.1-08).
//   - O RPC google_calendar_status() devolve só { conectado, expira_em },
//     nunca o token.
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

describe.skipIf(!configurado)('RLS — google_calendar_tokens (migration 042)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  let consultorUid: string
  let diretorUid: string

  // [RLS-TEST-042] — DB compartilhada; fixtures tagueadas em refresh_token e
  // limpas via service_role no beforeAll para idempotência entre re-runs
  // (perfil_id é PK — não dá para ter 2 linhas para o mesmo usuário).
  const TAG = '[RLS-TEST-042]'

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    diretor = d.client
    consultorUid = c.uid
    diretorUid = d.uid

    // Limpa fixtures de re-runs anteriores antes de semear.
    await service.from('google_calendar_tokens').delete().in('perfil_id', [consultorUid, diretorUid])

    // Semeia uma linha de token dummy para o consultor via service_role
    // (bypassa RLS — único jeito de popular a tabela para os testes de SELECT).
    const { error: seedError } = await service.from('google_calendar_tokens').insert({
      perfil_id: consultorUid,
      refresh_token: `${TAG}-refresh-dummy`,
      access_token: `${TAG}-access-dummy`,
      access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    if (seedError) throw new Error(`Falha ao semear fixture: ${seedError.message}`)
  })

  it('SLA-06: consultor autenticado NÃO consegue SELECT em google_calendar_tokens, nem da própria linha', async () => {
    const { data, error } = await consultor
      .from('google_calendar_tokens')
      .select('perfil_id, refresh_token')
      .eq('perfil_id', consultorUid)
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'SELECT via authenticated deve ser bloqueado mesmo para a própria linha').toBe(true)
  })

  it('diretor também NÃO consegue SELECT em google_calendar_tokens (sem policy SELECT alguma para authenticated)', async () => {
    const { data, error } = await diretor
      .from('google_calendar_tokens')
      .select('perfil_id')
      .eq('perfil_id', consultorUid)
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'SELECT via authenticated deve ser bloqueado inclusive para diretor').toBe(true)
  })

  it('consultor consegue upsert (UPDATE) apenas da própria linha (perfil_id = auth.uid())', async () => {
    const { error } = await consultor
      .from('google_calendar_tokens')
      .update({ refresh_token: `${TAG}-updated-by-owner` })
      .eq('perfil_id', consultorUid)
    expect(error).toBeNull()

    // Verifica a escrita via service_role (consultor não consegue ler de volta).
    const check = await service
      .from('google_calendar_tokens')
      .select('refresh_token')
      .eq('perfil_id', consultorUid)
      .maybeSingle()
    expect(check.data?.refresh_token).toBe(`${TAG}-updated-by-owner`)
  })

  it('consultor NÃO consegue gravar (INSERT) linha com perfil_id de outro usuário (bloqueado por WITH CHECK)', async () => {
    const { error, data } = await consultor
      .from('google_calendar_tokens')
      .insert({ perfil_id: diretorUid, refresh_token: `${TAG}-should-be-blocked` })
      .select('perfil_id')
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'INSERT com perfil_id != auth.uid() deve ser bloqueado pela WITH CHECK').toBe(true)

    // Confirma via service_role que nenhuma linha foi criada para o diretor.
    const check = await service
      .from('google_calendar_tokens')
      .select('perfil_id')
      .eq('perfil_id', diretorUid)
    expect((check.data ?? []).length).toBe(0)
  })

  it('consultor NÃO consegue gravar (UPDATE) a linha de outro usuário (bloqueado por USING/WITH CHECK)', async () => {
    // Garante que existe uma linha do diretor via service_role para tentar o UPDATE contra.
    await service.from('google_calendar_tokens').insert({
      perfil_id: diretorUid,
      refresh_token: `${TAG}-diretor-seed`,
    })

    const { error, data } = await consultor
      .from('google_calendar_tokens')
      .update({ refresh_token: `${TAG}-tampered` })
      .eq('perfil_id', diretorUid)
      .select('perfil_id')
    const blocked = error !== null || (data ?? []).length === 0
    expect(blocked, 'UPDATE em linha de outro usuário deve ser bloqueado').toBe(true)

    const check = await service
      .from('google_calendar_tokens')
      .select('refresh_token')
      .eq('perfil_id', diretorUid)
      .maybeSingle()
    expect(check.data?.refresh_token).toBe(`${TAG}-diretor-seed`)
  })

  it('RPC google_calendar_status() devolve shape { conectado, expira_em } e nunca expõe o token', async () => {
    const { data, error } = await consultor.rpc('google_calendar_status')
    expect(error).toBeNull()
    // RPC retorna TABLE(conectado boolean, expira_em timestamptz) — Supabase JS empacota como array
    const row = Array.isArray(data) ? data[0] : data
    expect(row).toBeDefined()
    expect(typeof row.conectado).toBe('boolean')
    expect(row.conectado).toBe(true)
    expect(row).not.toHaveProperty('refresh_token')
    expect(row).not.toHaveProperty('access_token')
  })

  it('RPC google_calendar_status() devolve conectado=false quando o perfil nunca conectou', async () => {
    // Diretor tem uma linha seed nesta suíte (fixture de UPDATE bloqueado) —
    // limpa antes de testar o caso "nunca conectou" para não colidir.
    await service.from('google_calendar_tokens').delete().eq('perfil_id', diretorUid)

    const { data, error } = await diretor.rpc('google_calendar_status')
    expect(error).toBeNull()
    const row = Array.isArray(data) ? data[0] : data
    expect(row).toBeDefined()
    expect(row.conectado).toBe(false)
    expect(row.expira_em).toBeNull()
  })
})

describe.skipIf(configurado)('RLS — google_calendar_tokens — PULADO', () => {
  it('configure .env.test + SUPABASE_SERVICE_ROLE_KEY para rodar os testes de RLS', () => {
    expect(true).toBe(true)
  })
})
