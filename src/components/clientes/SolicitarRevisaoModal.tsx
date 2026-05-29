import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useSolicitarRevisaoDoc } from '@/hooks/useClienteDocs'
import type { ClienteDoc } from '@/types'

const schema = z.object({
  comentario: z
    .string()
    .min(5, 'Descreva o que precisa ser ajustado (mínimo 5 caracteres)'),
})
type FormData = z.infer<typeof schema>

interface Props {
  doc: ClienteDoc
  onClose: () => void
}

/**
 * Modal aberta pelo AprovacaoButtons para o cliente justificar a revisão.
 * react-hook-form + zod (min 5 chars). Submit chama useSolicitarRevisaoDoc;
 * trigger Postgres (Plan 02) dispara notif ao consultor com o comentário.
 */
export function SolicitarRevisaoModal({ doc, onClose }: Props) {
  const solicitar = useSolicitarRevisaoDoc()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { comentario: '' },
  })

  async function onSubmit(data: FormData) {
    await solicitar.mutateAsync({
      docId: doc.id,
      clienteId: doc.cliente_id,
      comentario: data.comentario,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar revisão — {doc.nome_arquivo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="comentario">O que precisa ser ajustado?</Label>
            <Textarea
              id="comentario"
              rows={5}
              placeholder="Descreva o ajuste necessário..."
              {...register('comentario')}
            />
            {errors.comentario && (
              <p className="text-xs text-red-500 mt-1">
                {errors.comentario.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || solicitar.isPending}
            >
              Enviar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
