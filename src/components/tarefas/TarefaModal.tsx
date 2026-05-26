import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateTarefa, useUpdateTarefa } from '@/hooks/useTarefas'
import { usePerfis, useMeuPerfil } from '@/hooks/usePerfis'
import type { Tarefa, TarefaEntidade } from '@/types'

const tarefaSchema = z.object({
  titulo:           z.string().min(3, 'Título obrigatório (min. 3 caracteres)'),
  descricao:        z.string().optional(),
  tipo:             z.enum(['generica', 'followup', 'reuniao_prep', 'renovacao', 'upsell', 'diagnostico', 'proposta', 'cobranca']),
  prioridade:       z.enum(['baixa', 'media', 'alta', 'critica']),
  atribuido_a_id:   z.string().uuid('Responsável obrigatório'),
  data_vencimento:  z.string().optional().nullable(),
  notas:            z.string().optional().nullable(),
})

type FormData = z.infer<typeof tarefaSchema>

type Props = {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  tarefa?: Tarefa
  entidadeTipo?: TarefaEntidade | null
  entidadeId?: string | null
  entidadeNome?: string | null
}

export function TarefaModal({ open, onClose, mode, tarefa, entidadeTipo, entidadeId, entidadeNome }: Props) {
  const { data: perfis = [] } = usePerfis()
  const { data: meuPerfil } = useMeuPerfil()
  const criar = useCreateTarefa()
  const atualizar = useUpdateTarefa()

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(tarefaSchema),
    defaultValues: {
      tipo:           'generica',
      prioridade:     'media',
      atribuido_a_id: meuPerfil?.id ?? '',
    },
  })

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && tarefa) {
      reset({
        titulo:          tarefa.titulo,
        descricao:       tarefa.descricao ?? '',
        tipo:            tarefa.tipo,
        prioridade:      tarefa.prioridade,
        atribuido_a_id:  tarefa.atribuido_a_id ?? meuPerfil?.id ?? '',
        data_vencimento: tarefa.data_vencimento
          ? new Date(tarefa.data_vencimento).toISOString().slice(0, 16)
          : '',
        notas: tarefa.notas ?? '',
      })
    } else {
      reset({
        titulo: '', descricao: '', tipo: 'generica', prioridade: 'media',
        atribuido_a_id: meuPerfil?.id ?? '', data_vencimento: '', notas: '',
      })
    }
  }, [open, mode, tarefa, meuPerfil?.id, reset])

  async function onSubmit(data: FormData) {
    const vencimento = data.data_vencimento
      ? new Date(data.data_vencimento).toISOString()
      : null

    if (mode === 'create') {
      await criar.mutateAsync({
        titulo:          data.titulo,
        descricao:       data.descricao || null,
        tipo:            data.tipo,
        prioridade:      data.prioridade,
        status:          'aberta',
        atribuido_a_id:  data.atribuido_a_id,
        criado_por_id:   meuPerfil?.id ?? data.atribuido_a_id,
        entidade_tipo:   entidadeTipo ?? null,
        entidade_id:     entidadeId ?? null,
        data_vencimento: vencimento,
        data_conclusao:  null,
        notas:           data.notas || null,
        notificar:       true,
      })
    } else if (tarefa) {
      await atualizar.mutateAsync({
        id:              tarefa.id,
        titulo:          data.titulo,
        descricao:       data.descricao || null,
        tipo:            data.tipo,
        prioridade:      data.prioridade,
        atribuido_a_id:  data.atribuido_a_id,
        data_vencimento: vencimento,
        notas:           data.notas || null,
      })
    }
    onClose()
  }

  const isLoading = criar.isPending || atualizar.isPending || isSubmitting

  return (
    <Dialog open={open} onOpenChange={o => !o && !isLoading && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nova tarefa' : 'Editar tarefa'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-2">
          {entidadeTipo && entidadeNome && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(0,137,172,0.12)', color: '#6bd0e7', border: '1px solid rgba(0,137,172,0.30)' }}>
                {entidadeTipo === 'lead' ? 'Lead' : entidadeTipo}: {entidadeNome}
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-fg2 mb-1 block">Título *</label>
            <Input {...register('titulo')} placeholder="O que precisa ser feito?" autoFocus />
            {errors.titulo && <p className="text-xs text-red-500 mt-1">{errors.titulo.message}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-fg2 mb-1 block">Descrição</label>
            <Textarea {...register('descricao')} rows={3} placeholder="Contexto, links, anotações..." />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-fg2 mb-1 block">Tipo</label>
              <Controller name="tipo" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generica">Genérica</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="reuniao_prep">Reunião</SelectItem>
                    <SelectItem value="renovacao">Renovação</SelectItem>
                    <SelectItem value="upsell">Upsell</SelectItem>
                    <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                    <SelectItem value="proposta">Proposta</SelectItem>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div>
              <label className="text-xs font-semibold text-fg2 mb-1 block">Prioridade</label>
              <Controller name="prioridade" control={control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div>
              <label className="text-xs font-semibold text-fg2 mb-1 block">Vencimento</label>
              <Input type="datetime-local" {...register('data_vencimento')} className="h-9 text-xs" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-fg2 mb-1 block">Responsável *</label>
            <Controller name="atribuido_a_id" control={control} render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                <SelectContent>
                  {perfis.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )} />
            {errors.atribuido_a_id && <p className="text-xs text-red-500 mt-1">{errors.atribuido_a_id.message}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-fg2 mb-1 block">Notas internas</label>
            <Textarea {...register('notas')} rows={2} placeholder="Observações, links úteis..." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              {mode === 'create' ? 'Descartar tarefa' : 'Descartar alterações'}
            </Button>
            <Button type="submit" disabled={isLoading} style={{ backgroundColor: '#0089ac' }}>
              {mode === 'create' ? 'Criar tarefa' : 'Salvar alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
