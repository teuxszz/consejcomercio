import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para push_subscriptions (migration 036, Phase 6 D-15).
//
// Wave 0 scaffold (RED) — Plan 02 implementa a migration; Plan 04 implementa
// useSubscribePush hook. Casos cobrem o threat register §T-06-02 + T-06-04:
//
//   - consultor SELECT só vê próprias (perfil_id = auth.uid())
//   - diretor SELECT vê todas via public.is_at_least('coordenador')
//   - INSERT com perfil_id != auth.uid() bloqueado pela WITH CHECK
//   - DELETE: usuário deleta só as suas
//   - upsert ON CONFLICT(perfil_id,endpoint) DO UPDATE atualiza last_seen_at
//
// Bootstrap copiado de tests/rls/notificacoes_envios.test.ts (Phase 5 analog).
// Pré-requisito: .env.test com QA_*, VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY.
// Sem isso, suíte é PULADA via describe.skipIf.

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

const FAKE_KEYS = { p256dh: 'BNZ-mock-p256dh-key-base64url', auth: 'mock-auth-secret' }

describe.skipIf(!configurado)('RLS — push_subscriptions (migration 036)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  let consultorUid: string
  let diretorUid: string

  // Endpoints fixture distintos por device para não colidir no UNIQUE (perfil_id, endpoint).
  const TAG = '[RLS-TEST-036]'
  const seedEndpoints = {
    c1: `https://fcm.googleapis.com/fcm/send/${TAG}-c1`,
    c2: `https://fcm.googleapis.com/fcm/send/${TAG}-c2`,
    d1: `https://fcm.googleapis.com/fcm/send/${TAG}-d1`,
  }

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    diretor = d.client
    consultorUid = c.uid
    diretorUid = d.uid

    // Seed via service_role (bypassa RLS) — limpa primeiro para idempotência.
    await service.from('push_subscriptions').delete().in('endpoint', Object.values(seedEndpoints))

    const rows = [
      { perfil_id: consultorUid, endpoint: seedEndpoints.c1, p256dh: FAKE_KEYS.p256dh, auth: FAKE_KEYS.auth, user_agent: 'test-c1' },
      { perfil_id: consultorUid, endpoint: seedEndpoints.c2, p256dh: FAKE_KEYS.p256dh, auth: FAKE_KEYS.auth, user_agent: 'test-c2' },
      { perfil_id: diretorUid,   endpoint: seedEndpoints.d1, p256dh: FAKE_KEYS.p256dh, auth: FAKE_KEYS.auth, user_agent: 'test-d1' },
    ]
    await service.from('push_subscriptions').insert(rows)
  })

  // RED scaffolds — Plan 02 aplica migration, depois esses testes passam.

  it.todo('consultor SELECT só vê linhas próprias (perfil_id = auth.uid())')
  it.todo('diretor SELECT vê linhas de qualquer perfil (is_at_least(\"coordenador\"))')
  it.todo('INSERT como consultor com perfil_id = diretorUid é bloqueado por WITH CHECK')
  it.todo('INSERT como consultor com perfil_id = auth.uid() é permitido')
  it.todo('DELETE como consultor só remove próprias rows (DELETE em diretorUid retorna 0 affected)')
  it.todo('upsert ON CONFLICT (perfil_id, endpoint) DO UPDATE atualiza last_seen_at sem violar UNIQUE')

  // Sanity check do bootstrap — não falha em RED (testa só fixture):
  it('bootstrap seed: service_role criou 3 fixture rows (sanity)', async () => {
    const { data, error } = await service
      .from('push_subscriptions')
      .select('id, perfil_id, endpoint')
      .in('endpoint', Object.values(seedEndpoints))
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(3)
  })
})

describe.skipIf(configurado)('RLS — push_subscriptions — PULADO (configure .env.test)', () => {
  it('configure .env.test (VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, QA_*) para rodar', () => {
    expect(true).toBe(true)
  })
})
