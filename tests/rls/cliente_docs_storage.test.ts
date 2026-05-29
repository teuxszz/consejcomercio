import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para o bucket privado `cliente-docs` (storage.objects).
//
// Policies usam storage.foldername(name)[1] para extrair `cliente_id` do path
// `{cliente_id}/{doc_id}.{ext}` (T-07-01 mitigação).
//
// Casos cobertos (consultor + diretor — cliente fixture não existe em .env.test):
//   1. consultor upload em pasta de cliente próprio (responsavel_id) → sucesso
//   2. consultor upload em pasta de cliente alheio → rejeitado
//   3. consultor SELECT (storage.list) só enumera objetos do próprio cliente
//   4. diretor SELECT (storage.list) enumera tudo (coord+ via is_at_least)
//
// Casos cliente login (próprio cliente_id_associado) ficam para o E2E spec e UAT.

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

const configurado = !!(
  URL && ANON && SERVICE && QA.diretorEmail && QA.diretorPass && QA.consultorEmail && QA.consultorPass
)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}

const TAG = '[RLS-STORAGE-037]'
const BUCKET = 'cliente-docs'

describe.skipIf(!configurado)('RLS — storage.objects cliente-docs (migration 037)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  let clienteProprioId: string
  let clienteAlheioId: string

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    diretor = d.client

    // Seed 2 clientes
    await service.from('clientes').delete().like('nome', `${TAG}%`)
    const { data: cli1 } = await service
      .from('clientes')
      .insert({ nome: `${TAG} cliente-proprio`, responsavel_id: c.uid })
      .select('id')
      .single()
    const { data: cli2 } = await service
      .from('clientes')
      .insert({ nome: `${TAG} cliente-alheio`, responsavel_id: d.uid })
      .select('id')
      .single()
    clienteProprioId = (cli1 as { id: string }).id
    clienteAlheioId = (cli2 as { id: string }).id

    // Seed um objeto via service_role na pasta alheia — necessário para o teste
    // de SELECT (consultor não deve listar). Cleanup idempotente primeiro.
    const seedPath = `${clienteAlheioId}/${TAG}-seed.txt`
    await service.storage.from(BUCKET).remove([seedPath]).catch(() => undefined)
    const blob = new Blob(['seed'], { type: 'text/plain' })
    await service.storage.from(BUCKET).upload(seedPath, blob, { upsert: true })
  })

  it(`${TAG} consultor upload em pasta de cliente próprio é permitido`, async () => {
    const path = `${clienteProprioId}/${TAG}-proprio.txt`
    // Cleanup
    await service.storage.from(BUCKET).remove([path]).catch(() => undefined)

    const blob = new Blob(['data-proprio'], { type: 'text/plain' })
    const { error } = await consultor.storage.from(BUCKET).upload(path, blob, { upsert: true })
    expect(error).toBeNull()
  })

  it(`${TAG} consultor upload em pasta de cliente alheio é rejeitado`, async () => {
    const path = `${clienteAlheioId}/${TAG}-alheio.txt`
    const blob = new Blob(['data-alheio'], { type: 'text/plain' })
    const { error } = await consultor.storage.from(BUCKET).upload(path, blob, { upsert: true })
    expect(error).not.toBeNull()
  })

  it(`${TAG} consultor list só enumera objetos do próprio cliente`, async () => {
    // List da pasta alheia deve retornar vazio (ou erro)
    const { data, error } = await consultor.storage.from(BUCKET).list(clienteAlheioId)
    // RLS filtra: ou retorna data=[] ou data=null com error não-fatal
    if (!error) {
      expect((data ?? []).filter(o => o.name.startsWith(TAG)).length).toBe(0)
    }
  })

  it(`${TAG} diretor list enumera qualquer pasta (coord+)`, async () => {
    const { data, error } = await diretor.storage.from(BUCKET).list(clienteAlheioId)
    expect(error).toBeNull()
    expect((data ?? []).some(o => o.name.includes(`${TAG}-seed`))).toBe(true)
  })
})

describe.skipIf(configurado)('RLS — storage cliente-docs — PULADO (configure .env.test)', () => {
  it('configure .env.test (VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, QA_*) para rodar', () => {
    expect(true).toBe(true)
  })
})
