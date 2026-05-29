// Helper puro para agrupar `cliente_docs` por raiz (D-02 versionamento).
//
// Regra:
//   - "Raiz" = doc com `parent_doc_id === null`
//   - Cada raiz coleta toda a cadeia `parent_doc_id = raiz.id` (e netos, se houver)
//   - `current` = versão mais alta (`versao` máximo) — UI mostra essa
//   - `history` = demais versões em ordem decrescente (mais nova → mais velha)
//
// Docs órfãos (parent_doc_id aponta para uma raiz que não existe na lista)
// são promovidos a raízes próprias para não desaparecerem da UI.

import type { ClienteDoc } from '@/types'

export interface DocRootGroup {
  current: ClienteDoc
  history: ClienteDoc[]
}

export function groupByRoot(docs: ClienteDoc[]): DocRootGroup[] {
  if (docs.length === 0) return []

  // Index para resolver árvores (parent_doc_id → root)
  const byId = new Map<string, ClienteDoc>()
  for (const d of docs) byId.set(d.id, d)

  // Para cada doc, sobe pelos parent_doc_id até encontrar o root real.
  // Se algum ancestral estiver fora da lista, o próprio doc vira "root órfão".
  const rootOf = new Map<string, string>()
  for (const d of docs) {
    let cur: ClienteDoc | undefined = d
    const visited = new Set<string>()
    while (cur && cur.parent_doc_id) {
      if (visited.has(cur.id)) break // cycle safety
      visited.add(cur.id)
      const parent = byId.get(cur.parent_doc_id)
      if (!parent) break // órfão — usa cur como root
      cur = parent
    }
    rootOf.set(d.id, cur?.id ?? d.id)
  }

  // Agrupa por root
  const groups = new Map<string, ClienteDoc[]>()
  for (const d of docs) {
    const rootId = rootOf.get(d.id) ?? d.id
    if (!groups.has(rootId)) groups.set(rootId, [])
    groups.get(rootId)!.push(d)
  }

  // Para cada grupo: ordena por versao desc; current = primeiro, history = resto
  const result: DocRootGroup[] = []
  for (const [, list] of groups) {
    list.sort((a, b) => (b.versao ?? 1) - (a.versao ?? 1))
    const [current, ...history] = list
    result.push({ current, history })
  }

  // Ordena grupos pela data do current (mais novo primeiro)
  result.sort(
    (a, b) =>
      new Date(b.current.created_at).getTime() -
      new Date(a.current.created_at).getTime()
  )
  return result
}
