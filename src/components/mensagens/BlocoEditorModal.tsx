import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { BLOCOS, BLOCO_CATEGORIAS, isBlocoBase, type Bloco, type BlocoCategoria } from '@/lib/blocos-mensagem'
import { useConfiguracoes, useUpdateConfiguracoes, DEFAULT_MENSAGENS_CONFIG } from '@/hooks/useConfiguracoes'
import type { MensagensConfig } from '@/types'

const SETOR_OPTIONS: { id: string; label: string }[] = [
  { id: 'societario',   label: 'Societário' },
  { id: 'contratual',   label: 'Contratual' },
  { id: 'digital_lgpd', label: 'Digital / LGPD' },
  { id: 'trabalhista',  label: 'Trabalhista' },
  { id: 'marca_pi',     label: 'Marca / INPI' },
]

type Mode =
  | { kind: 'edit'; bloco: Bloco }
  | { kind: 'add'; categoria: BlocoCategoria }

interface Props {
  open: boolean
  onClose: () => void
  mode: Mode | null
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function BlocoEditorModal({ open, onClose, mode }: Props) {
  const { data: config } = useConfiguracoes()
  const updateConfig = useUpdateConfiguracoes()
  const mensagens: MensagensConfig = config?.mensagens ?? DEFAULT_MENSAGENS_CONFIG
  const blocosCfg = mensagens.blocos ?? { overrides: {}, custom: [], ocultos: [] }

  const [categoria, setCategoria] = useState<BlocoCategoria>('Abertura')
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [setores, setSetores] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const isEditingBase = mode?.kind === 'edit' && isBlocoBase(mode.bloco.id)
  const isEditingCustom = mode?.kind === 'edit' && !isBlocoBase(mode.bloco.id)
  const hasOverride = mode?.kind === 'edit' && !!blocosCfg.overrides[mode.bloco.id]

  // Fonte original (para resetar override): se for base, busca em BLOCOS; senão usa o do custom
  const original = useMemo<Bloco | null>(() => {
    if (mode?.kind !== 'edit') return null
    if (isBlocoBase(mode.bloco.id)) return BLOCOS.find(b => b.id === mode.bloco.id) ?? null
    return blocosCfg.custom.find(c => c.id === mode.bloco.id)
      ? { ...mode.bloco }
      : null
  }, [mode, blocosCfg.custom])

  // Hidrata o form quando o modal abre/muda
  useEffect(() => {
    if (!open || !mode) return
    if (mode.kind === 'edit') {
      setCategoria(mode.bloco.categoria)
      setTitulo(mode.bloco.titulo)
      setTexto(mode.bloco.texto)
      setSetores(mode.bloco.setores ?? [])
    } else {
      setCategoria(mode.categoria)
      setTitulo('')
      setTexto('')
      setSetores([])
    }
  }, [open, mode])

  function toggleSetor(id: string) {
    setSetores(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  function nextBlocosConfig(): NonNullable<MensagensConfig['blocos']> {
    return {
      overrides: { ...blocosCfg.overrides },
      custom: [...blocosCfg.custom],
      ocultos: [...blocosCfg.ocultos],
    }
  }

  async function handleSave() {
    if (!mode) return
    const tituloTrim = titulo.trim()
    const textoTrim = texto.trim()
    if (!tituloTrim) { toast.error('Título é obrigatório.'); return }
    if (!textoTrim) { toast.error('Texto é obrigatório.'); return }

    setSaving(true)
    try {
      const next = nextBlocosConfig()

      if (mode.kind === 'edit') {
        if (isBlocoBase(mode.bloco.id)) {
          // Override sobre o bloco base — guarda apenas campos diferentes do original
          const base = BLOCOS.find(b => b.id === mode.bloco.id)!
          const ov: { titulo?: string; texto?: string; setores?: string[] } = {}
          if (tituloTrim !== base.titulo) ov.titulo = tituloTrim
          if (textoTrim !== base.texto) ov.texto = textoTrim
          // Categoria não é editável em base — usa a do base
          const baseSetores = (base.setores ?? []).join(',')
          const novoSetores = setores.join(',')
          if (baseSetores !== novoSetores) ov.setores = setores
          if (Object.keys(ov).length === 0) {
            delete next.overrides[mode.bloco.id]
          } else {
            next.overrides[mode.bloco.id] = ov
          }
        } else {
          // Editar custom — substitui in place
          const idx = next.custom.findIndex(c => c.id === mode.bloco.id)
          if (idx >= 0) {
            next.custom[idx] = {
              id: mode.bloco.id,
              categoria,
              titulo: tituloTrim,
              texto: textoTrim,
              setores: setores.length ? setores : undefined,
            }
          }
        }
      } else {
        // Novo bloco custom
        const baseId = `custom-${slugify(tituloTrim) || 'bloco'}`
        let id = baseId
        let n = 1
        const existing = new Set([...BLOCOS.map(b => b.id), ...next.custom.map(c => c.id)])
        while (existing.has(id)) { id = `${baseId}-${++n}` }
        next.custom.push({
          id,
          categoria,
          titulo: tituloTrim,
          texto: textoTrim,
          setores: setores.length ? setores : undefined,
        })
      }

      await updateConfig.mutateAsync({
        mensagens: { ...mensagens, blocos: next },
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleResetOverride() {
    if (mode?.kind !== 'edit' || !isBlocoBase(mode.bloco.id)) return
    setSaving(true)
    try {
      const next = nextBlocosConfig()
      delete next.overrides[mode.bloco.id]
      await updateConfig.mutateAsync({ mensagens: { ...mensagens, blocos: next } })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCustom() {
    if (mode?.kind !== 'edit' || isBlocoBase(mode.bloco.id)) return
    if (!confirm('Excluir este bloco? Esta ação afeta toda a equipe.')) return
    setSaving(true)
    try {
      const next = nextBlocosConfig()
      next.custom = next.custom.filter(c => c.id !== mode.bloco.id)
      await updateConfig.mutateAsync({ mensagens: { ...mensagens, blocos: next } })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!mode) return null

  const isAdd = mode.kind === 'add'
  const title = isAdd
    ? `Novo bloco — ${mode.categoria}`
    : `Editar bloco — ${mode.bloco.categoria}`

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isAdd
              ? 'Adicione um novo bloco para esta categoria. Use {{nome}}, {{empresa}}, {{responsavel}}, {{dor}}, {{gancho}}, {{tempo}} ou {{prazo}} como variáveis.'
              : 'Edite o título e o texto. Variáveis disponíveis: {{nome}}, {{empresa}}, {{responsavel}}, {{dor}}, {{gancho}}, {{tempo}}, {{prazo}}.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Categoria — editável apenas em add ou em custom */}
          <div>
            <Label className="text-xs">Categoria</Label>
            {isEditingBase ? (
              <Input value={categoria} disabled className="h-9 text-sm mt-1" />
            ) : (
              <Select value={categoria} onValueChange={v => setCategoria(v as BlocoCategoria)}>
                <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOCO_CATEGORIAS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div>
            <Label className="text-xs">Título <span className="text-muted-foreground">(rótulo do botão)</span></Label>
            <Input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Direto ao ponto"
              maxLength={48}
              className="h-9 text-sm mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Texto do bloco</Label>
            <Textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex: Oi, {{nome}}, tudo certo? Sou {{responsavel}}, da CONSEJ."
              className="text-sm mt-1 min-h-[120px] font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {texto.length} caracteres
            </p>
          </div>

          <div>
            <Label className="text-xs">
              Setores em que aparece <span className="text-muted-foreground">(vazio = todos os setores que não sejam "geral")</span>
            </Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SETOR_OPTIONS.map(s => {
                const ativo = setores.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSetor(s.id)}
                    className="text-[11px] px-2.5 py-1 rounded-md border transition-colors"
                    style={ativo
                      ? { background: 'rgba(0,137,172,0.15)', borderColor: 'rgba(0,137,172,0.55)', color: 'var(--cyan-hi)' }
                      : { background: 'var(--alpha-bg-xs)', borderColor: 'var(--alpha-border)', color: 'var(--text-soft-a)' }
                    }
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Sem setor: aparece para qualquer setor exceto "geral". Selecionando setores específicos, o bloco só aparece quando o setor escolhido bate.
            </p>
          </div>

          {original && (
            <details className="rounded-lg border p-3" style={{ borderColor: 'var(--alpha-border)', background: 'var(--alpha-bg-xs)' }}>
              <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer">
                Ver original
              </summary>
              <div className="mt-2 text-[11px]">
                <p className="font-semibold text-fg2">{original.titulo}</p>
                <pre className="whitespace-pre-wrap text-muted-foreground font-sans mt-1">{original.texto}</pre>
              </div>
            </details>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <div className="flex gap-2">
            {isEditingBase && hasOverride && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetOverride}
                disabled={saving}
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restaurar original
              </Button>
            )}
            {isEditingCustom && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDeleteCustom}
                disabled={saving}
                className="gap-1.5 text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir bloco
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#0089ac' }}
              className="text-white"
            >
              {saving ? 'Salvando...' : isAdd ? 'Criar bloco' : 'Salvar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
