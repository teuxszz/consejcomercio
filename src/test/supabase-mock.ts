import { vi } from 'vitest'

// Mock encadeável do cliente Supabase para testes de hook/componente.
//
// Os hooks usam o query-builder PostgREST: supabase.from('t').select().eq()...
// e por fim `await`. Aqui cada método encadeável devolve o próprio builder, que
// é "thenable" — ao ser awaited, resolve a resposta configurada.
//
// Uso:
//   const sb = createSupabaseMock({
//     from: { objecoes: { data: [...], error: null } },
//     rpc: { inspecionar_exclusao: { data: {...}, error: null } },
//   })
//   vi.mock('@/lib/supabase', () => ({ supabase: sb }))

export interface MockResponse<T = unknown> {
  data: T
  error: { message: string } | null
}

interface MockConfig {
  from?: Record<string, MockResponse>
  rpc?: Record<string, MockResponse>
}

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'delete', 'upsert',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not',
  'order', 'limit', 'range', 'filter', 'or', 'returns',
] as const

function makeBuilder(response: MockResponse) {
  const builder: Record<string, unknown> = {}
  for (const m of CHAIN_METHODS) {
    builder[m] = vi.fn(() => builder)
  }
  builder.single = vi.fn(() => Promise.resolve(response))
  builder.maybeSingle = vi.fn(() => Promise.resolve(response))
  // thenable: `await builder` resolve a resposta
  builder.then = (resolve: (v: MockResponse) => unknown) => resolve(response)
  return builder
}

export function createSupabaseMock(config: MockConfig = {}) {
  const defaultResp: MockResponse = { data: [], error: null }
  return {
    from: vi.fn((table: string) =>
      makeBuilder(config.from?.[table] ?? defaultResp)
    ),
    rpc: vi.fn((fn: string) => {
      const resp = config.rpc?.[fn] ?? { data: null, error: null }
      return Promise.resolve(resp)
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
  }
}
