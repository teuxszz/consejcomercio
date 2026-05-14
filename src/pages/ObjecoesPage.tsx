import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, MessageSquare, X } from 'lucide-react'
import { useObjecoes, useCreateObjecao, useUpdateObjecao, useDeleteObjecao } from '@/hooks/useObjecoes'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { OBJECAO_CATEGORIAS } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { Objecao } from '@/types'

function categoriaInfo(value: string) {
  return OBJECAO_CATEGORIAS.find(c => c.value === value)
    ?? { value, label: value, color: 'bg-[var(--alpha-bg-xs)] text-muted-foreground border-[var(--alpha-border-md)]' }
}

interface EditorState {
  open: boolean
  current: Objecao | null
}

export function ObjecoesPage() {
  const { data: objecoes = [], isLoading } = useObjecoes()
  const { data: meuPerfil } = useMeuPerfil()
  const createObjecao = useCreateObjecao()
  const updateObjecao = useUpdateObjecao()
  const deleteObjecao = useDeleteObjecao()

  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todas')
  const [editor, setEditor] = useState<EditorState>({ open: false, current: null })

  const filtered = useMemo(() => {
    return objecoes.filter(o => {
      if (!o.ativo) return false
      if (categoriaFilter !== 'todas' && o.categoria !== categoriaFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return o.objecao.toLowerCase().includes(q)
          || o.resposta_sugerida.toLowerCase().includes(q)
          || (o.tags ?? []).some(t => t.toLowerCase().includes(q))
      }
      return true
    })
  }, [objecoes, categoriaFilter, search])

  const grouped = useMemo(() => {
    const byCat = new Map<string, Objecao[]>()
    for (const o of filtered) {
      const list = byCat.get(o.categoria) ?? []
      list.push(o)
      byCat.set(o.categoria, list)
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  function openCreate() {
    setEditor({ open: true, current: null })
  }
  function openEdit(o: Objecao) {
    setEditor({ open: true, current: o })
  }
  function closeEditor() {
    setEditor({ open: false, current: null })
  }

  async function handleDelete(o: Objecao) {
    if (!confirm(`Remover a objeção "${o.objecao.slice(0, 60)}…"?`)) return
    deleteObjecao.mutate(o.id)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Carregando objeções...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Matriz de Objeções</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Banco de objeções recorrentes e respostas sugeridas para os consultores.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1" /> Nova objeção
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar objeção…" className="w-64" />
        <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {OBJECAO_CATEGORIAS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || categoriaFilter !== 'todas') && (
          <button
            onClick={() => { setSearch(''); setCategoriaFilter('todas') }}
            className="h-8 px-2.5 flex items-center gap-1 text-xs rounded-lg border transition-colors text-muted-foreground hover:text-white"
            style={{ borderColor: 'var(--alpha-bg-md)' }}
          >
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
      </div>

      {/* Lista */}
      {grouped.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="Nenhuma objeção cadastrada"
          description="Comece adicionando uma objeção recorrente para padronizar as respostas do time."
          action={{ label: 'Nova objeção', onClick: openCreate }}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([categoria, items]) => {
            const info = categoriaInfo(categoria)
            return (
              <div key={categoria}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', info.color)}>
                    {info.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{items.length} objeçã{items.length === 1 ? 'o' : 'oes'}</span>
                </div>
                <div className="space-y-2">
                  {items.map(o => (
                    <Card key={o.id} className="transition-colors hover:bg-[var(--alpha-bg-xs)]">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground leading-snug">{o.objecao}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed mt-2 whitespace-pre-line">
                              <span className="text-xs font-semibold text-fg2 mr-1">Resposta:</span>
                              {o.resposta_sugerida}
                            </p>
                            {o.tags && o.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {o.tags.map(t => (
                                  <span key={t} className="text-[10px] bg-[var(--alpha-bg-xs)] text-muted-foreground px-1.5 py-0.5 rounded">
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEdit(o)}
                              className="p-1.5 rounded-md hover:bg-[var(--alpha-bg-md)] text-muted-foreground hover:text-fg2 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(o)}
                              className="p-1.5 rounded-md hover:bg-[var(--alpha-bg-md)] text-muted-foreground hover:text-red-400 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ObjecaoEditor
        state={editor}
        onClose={closeEditor}
        onSave={async (data) => {
          if (editor.current) {
            await updateObjecao.mutateAsync({ id: editor.current.id, ...data })
          } else {
            await createObjecao.mutateAsync({
              ...data,
              ativo: true,
              criado_por_id: meuPerfil?.id ?? null,
            })
          }
          closeEditor()
        }}
      />
    </div>
  )
}

// ─── Editor modal ────────────────────────────────────────────────────────────

interface EditorProps {
  state: EditorState
  onClose: () => void
  onSave: (data: {
    categoria: string
    objecao: string
    resposta_sugerida: string
    tags: string[]
  }) => Promise<void>
}

function ObjecaoEditor({ state, onClose, onSave }: EditorProps) {
  const isEdit = !!state.current
  const [categoria, setCategoria] = useState(state.current?.categoria ?? 'preco')
  const [objecao, setObjecao] = useState(state.current?.objecao ?? '')
  const [resposta, setResposta] = useState(state.current?.resposta_sugerida ?? '')
  const [tagsInput, setTagsInput] = useState((state.current?.tags ?? []).join(', '))
  const [saving, setSaving] = useState(false)

  // Reset when modal opens with a new target
  useEffect(() => {
    if (state.open) {
      setCategoria(state.current?.categoria ?? 'preco')
      setObjecao(state.current?.objecao ?? '')
      setResposta(state.current?.resposta_sugerida ?? '')
      setTagsInput((state.current?.tags ?? []).join(', '))
    }
  }, [state.open, state.current])

  async function handleSubmit() {
    if (!objecao.trim() || !resposta.trim()) return
    const tags = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
    setSaving(true)
    try {
      await onSave({
        categoria,
        objecao: objecao.trim(),
        resposta_sugerida: resposta.trim(),
        tags,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar objeção' : 'Nova objeção'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OBJECAO_CATEGORIAS.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Objeção <span className="text-muted-foreground">(como o cliente fala)</span></Label>
            <Textarea
              value={objecao}
              onChange={e => setObjecao(e.target.value)}
              placeholder='Ex.: "Tá muito caro. Não tenho esse orçamento agora."'
              rows={2}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Resposta sugerida</Label>
            <Textarea
              value={resposta}
              onChange={e => setResposta(e.target.value)}
              placeholder="Explique o raciocínio que o consultor deve seguir, com tom e exemplos."
              rows={5}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Tags <span className="text-muted-foreground">(separadas por vírgula)</span></Label>
            <Input
              value={tagsInput}
              onChange={e => setTagsInput(e.target.value)}
              placeholder="financeiro, parcelamento, valor"
              className="mt-1 text-sm h-9"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !objecao.trim() || !resposta.trim()}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
