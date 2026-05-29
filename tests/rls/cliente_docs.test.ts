import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Testes RLS para cliente_docs (migration 037, Phase 7 D-08/D-14).
//
// Bootstrap copiado de tests/rls/notificacoes_envios.test.ts (mesmo pattern).
// Pré-requisito: .env.test com QA_DIRETOR_*, QA_CONSULTOR_*, VITE_SUPABASE_*,
// SUPABASE_SERVICE_ROLE_KEY. Sem isso, suíte é PULADA via describe.skipIf.
//
// Casos cobertos:
//   1. consultor SELECT vê só docs de clientes onde é responsavel_id
//   2. diretor SELECT vê todos via is_at_least('coordenador')
//   3. authenticated DELETE → RLS rejeita (sem policy permissiva)
//   4. consultor INSERT em cliente fora da sua responsabilidade → RLS rejeita
//   5. consultor INSERT em cliente próprio (responsavel_id) → sucesso
//   6. consultor UPDATE status='superseded' em doc próprio → sucesso (D-02)
//   7. service_role bypass (sanity: DELETE retorna ok)
//
// Casos que exigem fixture cliente (perfis.tipo='cliente') ficam pulados —
// `.env.test` do projeto não tem credencial cliente; cobertura desses fluxos
// fica para o E2E spec cliente-docs-flow.spec.ts e UAT manual.

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

const TAG = '[RLS-TEST-037]'

describe.skipIf(!configurado)('RLS — cliente_docs (migration 037)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  let consultorUid: string
  // Cliente "do consultor" (responsavel_id=consultorUid) + cliente "alheio".
  let clienteProprioId: string
  let clienteAlheioId: string

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    const d = await login(QA.diretorEmail!, QA.diretorPass!)
    service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
    consultor = c.client
    diretor = d.client
    consultorUid = c.uid

    // Seed: 2 clientes via service_role — um do consultor, um do diretor.
    // Nome com TAG para isolar. Idempotência: upsert por nome+TAG.
    const nomeProprio = `${TAG} cliente-proprio`
    const nomeAlheio = `${TAG} cliente-alheio`

    await service.from('clientes').delete().like('nome', `${TAG}%`)

    const { data: cli1, error: e1 } = await service
      .from('clientes')
      .insert({ nome: nomeProprio, responsavel_id: consultorUid })
      .select('id')
      .single()
    if (e1 || !cli1) throw new Error(`Falha seed cliente proprio: ${e1?.message}`)
    clienteProprioId = (cli1 as { id: string }).id

    const { data: cli2, error: e2 } = await service
      .from('clientes')
      .insert({ nome: nomeAlheio, responsavel_id: d.uid })
      .select('id')
      .single()
    if (e2 || !cli2) throw new Error(`Falha seed cliente alheio: ${e2?.message}`)
    clienteAlheioId = (cli2 as { id: string }).id

    // Seed cliente_docs (via service_role; bypassa RLS):
    //   - 1 doc no clienteProprio (consultor deveria ver)
    //   - 1 doc no clienteAlheio (consultor NÃO deveria ver, diretor sim)
    await service.from('cliente_docs').delete().like('nome_arquivo', `${TAG}%`)
    await service.from('cliente_docs').insert([
      {
        cliente_id: clienteProprioId,
        autor_id: consultorUid,
        autor_tipo: 'interno',
        tag: 'proposta',
        nome_arquivo: `${TAG} proprio.pdf`,
        mime_type: 'application/pdf',
        tamanho_bytes: 1024,
        storage_path: `${clienteProprioId}/fake-proprio.pdf`,
        requer_aprovacao: true,
        status: 'pending',
        versao: 1,
      },
      {
        cliente_id: clienteAlheioId,
        autor_id: d.uid,
        autor_tipo: 'interno',
        tag: 'proposta',
        nome_arquivo: `${TAG} alheio.pdf`,
        mime_type: 'application/pdf',
        tamanho_bytes: 1024,
        storage_path: `${clienteAlheioId}/fake-alheio.pdf`,
        requer_aprovacao: true,
        status: 'pending',
        versao: 1,
      },
    ])
  })

  it(`${TAG} consultor SELECT vê apenas docs de clientes onde é responsavel_id`, async () => {
    const { data, error } = await consultor
      .from('cliente_docs')
      .select('id, cliente_id, nome_arquivo')
      .like('nome_arquivo', `${TAG}%`)
    expect(error).toBeNull()
    const clienteIds = new Set((data ?? []).map(r => r.cliente_id))
    expect(clienteIds.has(clienteProprioId)).toBe(true)
    expect(clienteIds.has(clienteAlheioId)).toBe(false)
  })

  it(`${TAG} diretor SELECT vê todos via is_at_least('coordenador')`, async () => {
    const { data, error } = await diretor
      .from('cliente_docs')
      .select('id, cliente_id, nome_arquivo')
      .like('nome_arquivo', `${TAG}%`)
    expect(error).toBeNull()
    const clienteIds = new Set((data ?? []).map(r => r.cliente_id))
    expect(clienteIds.has(clienteProprioId)).toBe(true)
    expect(clienteIds.has(clienteAlheioId)).toBe(true)
  })

  it(`${TAG} consultor INSERT em cliente próprio (responsavel) é permitido`, async () => {
    const { data, error } = await consultor
      .from('cliente_docs')
      .insert({
        cliente_id: clienteProprioId,
        autor_id: consultorUid,
        autor_tipo: 'interno',
        tag: 'outro',
        nome_arquivo: `${TAG} insert-ok.pdf`,
        mime_type: 'application/pdf',
        tamanho_bytes: 256,
        storage_path: `${clienteProprioId}/insert-ok.pdf`,
        requer_aprovacao: false,
        status: null,
        versao: 1,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })

  it(`${TAG} consultor INSERT em cliente alheio é rejeitado`, async () => {
    const { error } = await consultor
      .from('cliente_docs')
      .insert({
        cliente_id: clienteAlheioId,
        autor_id: consultorUid,
        autor_tipo: 'interno',
        tag: 'outro',
        nome_arquivo: `${TAG} insert-rejeitado.pdf`,
        mime_type: 'application/pdf',
        tamanho_bytes: 256,
        storage_path: `${clienteAlheioId}/insert-rejeitado.pdf`,
        requer_aprovacao: false,
        status: null,
        versao: 1,
      })
      .select('id')
      .maybeSingle()
    // RLS retorna erro 42501 OR retorna data=null sem error (PostgREST varia)
    // — qualquer um conta como "rejeitado".
    expect(error).not.toBeNull()
  })

  it(`${TAG} consultor UPDATE status='superseded' em doc próprio (D-02 versionamento) é permitido`, async () => {
    // Seed um doc novo para esse caso (service_role)
    const { data: seedDoc, error: seedErr } = await service
      .from('cliente_docs')
      .insert({
        cliente_id: clienteProprioId,
        autor_id: consultorUid,
        autor_tipo: 'interno',
        tag: 'proposta',
        nome_arquivo: `${TAG} v1.pdf`,
        mime_type: 'application/pdf',
        tamanho_bytes: 1024,
        storage_path: `${clienteProprioId}/v1.pdf`,
        requer_aprovacao: true,
        status: 'pending',
        versao: 1,
      })
      .select('id')
      .single()
    expect(seedErr).toBeNull()
    const seedDocId = (seedDoc as { id: string }).id

    const { error } = await consultor
      .from('cliente_docs')
      .update({ status: 'superseded' })
      .eq('id', seedDocId)
    expect(error).toBeNull()

    // Confirma persistência via service_role
    const { data: after } = await service
      .from('cliente_docs')
      .select('status')
      .eq('id', seedDocId)
      .single()
    expect((after as { status: string }).status).toBe('superseded')
  })

  it(`${TAG} authenticated DELETE é rejeitado por padrão`, async () => {
    // Pega qualquer doc próprio
    const { data: docRow } = await consultor
      .from('cliente_docs')
      .select('id')
      .eq('cliente_id', clienteProprioId)
      .limit(1)
      .maybeSingle()
    if (!docRow) {
      // Sem doc — pula (não estamos validando ausência de fixture; é sanity)
      return
    }
    // Tentar deletar como consultor (sem policy DELETE permissiva → 0 affected)
    const { error, count } = await consultor
      .from('cliente_docs')
      .delete({ count: 'exact' })
      .eq('id', (docRow as { id: string }).id)
    // Pode retornar erro de RLS OU count=0 (RLS filtra silenciosamente).
    if (!error) expect(count ?? 0).toBe(0)
  })

  it(`${TAG} service_role DELETE funciona (sanity para edge functions/cleanup)`, async () => {
    // Garante que service_role consegue deletar — confirma que policy não
    // bloqueia service role (boas práticas).
    const { error } = await service
      .from('cliente_docs')
      .delete()
      .like('nome_arquivo', `${TAG} insert-ok%`)
    expect(error).toBeNull()
  })
})

describe.skipIf(configurado)('RLS — cliente_docs — PULADO (configure .env.test)', () => {
  it('configure .env.test (VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, QA_*) para rodar', () => {
    expect(true).toBe(true)
  })
})
