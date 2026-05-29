import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUploadClienteDoc } from '@/hooks/useClienteDocs'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useCurrentRole } from '@/hooks/useCurrentRole'
import type { ClienteDoc } from '@/types'

interface Props {
  doc: ClienteDoc
  /** 'crm' = consultor pode subir v2; 'portal' = sempre hidden. */
  mode: 'portal' | 'crm'
}

/**
 * Botão visível ao consultor (autor do doc OU coord+) quando o cliente pediu
 * revisão (D-02 + BLOCKER #2 revision iter 2). Click → file picker → dispara
 * `useUploadClienteDoc` com `parentDocId=doc.id` — Plan 03 Task 3.4 marca o
 * parent como `superseded` automaticamente e cria a v2 com `versao=parent.versao+1`.
 *
 * Threat T-07-14 mitigado: visibilidade UI filtra autor_tipo='interno' +
 * status='revisao_solicitada' + (autor OU coord+). RLS INSERT/UPDATE rejeitam
 * caso a UI vaze.
 */
export function SubirNovaVersaoButton({ doc, mode }: Props) {
  const { data: perfil } = useMeuPerfil()
  const { atLeast } = useCurrentRole()
  const upload = useUploadClienteDoc()
  const inputRef = useRef<HTMLInputElement>(null)

  // Gate D-02 (T-07-14):
  if (mode !== 'crm') return null
  if (doc.autor_tipo !== 'interno') return null
  if (doc.status !== 'revisao_solicitada') return null
  if (!perfil) return null
  const isAutor = perfil.id === doc.autor_id
  const isCoordOrAbove = atLeast('coordenador')
  if (!isAutor && !isCoordOrAbove) return null

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !perfil) return
    upload.mutate({
      clienteId: doc.cliente_id,
      file,
      tag: doc.tag, // herda a tag da versão anterior
      requerAprovacao: true, // nova versão refaz o ciclo de aprovação (D-01)
      autorId: perfil.id,
      autorTipo: 'interno',
      parentDocId: doc.id, // D-02 — Plan 03 Task 3.4 superseda o parent
    })
    e.target.value = '' // permite re-selecionar o mesmo arquivo depois
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        <Upload className="w-4 h-4 mr-1" />
        Subir nova versão
      </Button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".pdf,.docx,.doc,.odt,.jpg,.jpeg,.png,.webp"
        onChange={handleFile}
      />
    </>
  )
}
