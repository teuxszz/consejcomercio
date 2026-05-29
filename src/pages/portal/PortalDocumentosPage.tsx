import { FileText } from 'lucide-react'
import { usePortalPerfil } from '@/hooks/usePortal'
import { useUploadClienteDoc } from '@/hooks/useClienteDocs'
import { UploadDropzone } from '@/components/clientes/UploadDropzone'
import { ClienteDocsList } from '@/components/clientes/ClienteDocsList'

export function PortalDocumentosPage() {
  const { data: perfil, isLoading } = usePortalPerfil()
  const upload = useUploadClienteDoc()

  if (isLoading || !perfil) {
    return (
      <div style={{ color: 'rgba(107,208,231,0.7)', fontSize: 13 }}>
        Carregando…
      </div>
    )
  }

  // Cliente sem cliente_id vinculado — vê página informativa (não bloqueia).
  if (!perfil.cliente_id) {
    return (
      <div
        className="rounded-xl p-6"
        style={{
          background: 'rgba(0,137,172,0.08)',
          border: '1px solid rgba(0,137,172,0.2)',
          color: 'rgba(107,208,231,0.85)',
          fontSize: 13,
        }}
      >
        Seu perfil ainda não está vinculado a uma empresa cliente. Fale com a CONSEJ
        para liberar o envio de documentos.
      </div>
    )
  }

  const clienteId = perfil.cliente_id

  function handleFiles(files: File[]) {
    files.forEach(file => {
      upload.mutate({
        clienteId,
        file,
        tag: 'outro',           // cliente sempre 'outro'; consultor escolhe tag (D-01)
        requerAprovacao: false, // D-01 enforce: cliente NUNCA marca próprio doc como aprovação
        autorId: perfil!.id,
        autorTipo: 'cliente',
      })
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(0,137,172,0.15)',
            border: '1px solid rgba(0,137,172,0.3)',
          }}
        >
          <FileText className="w-5 h-5" style={{ color: '#6bd0e7' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
            Documentos
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(107,208,231,0.6)', marginTop: 2 }}>
            Envie e baixe arquivos compartilhados com a CONSEJ
          </p>
        </div>
      </div>

      <div className="mb-6">
        <UploadDropzone onFiles={handleFiles} disabled={upload.isPending} />
      </div>

      <ClienteDocsList clienteId={clienteId} mode="portal" />
    </div>
  )
}
