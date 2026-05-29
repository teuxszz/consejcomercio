import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import {
  uploadClienteDocFile,
  getSignedDownloadUrl,
  buildDocPath,
} from '@/lib/storage-helpers'
import type { ClienteDoc, AutorDoc, TagDoc } from '@/types'

// ─── Query: listar docs por cliente ─────────────────────────────────────────

export function useClienteDocs(clienteId: string | null) {
  return useQuery<ClienteDoc[]>({
    queryKey: clienteId
      ? QUERY_KEYS.clienteDocs.byCliente(clienteId)
      : ['clienteDocs', 'disabled'],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cliente_docs')
        .select('*')
        .eq('cliente_id', clienteId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ClienteDoc[]
    },
  })
}

// ─── Mutation: upload com pre-row + rollback + D-02 versionamento ───────────

export interface UploadClienteDocInput {
  clienteId: string
  file: File
  tag: TagDoc
  /** Apenas honrado quando autorTipo='interno' (D-01). */
  requerAprovacao: boolean
  autorId: string
  autorTipo: AutorDoc
  /** Quando definido, esta é uma nova versão (v=parent.versao+1) (D-02). */
  parentDocId?: string | null
  onProgress?: (pct: number) => void
}

export function useUploadClienteDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UploadClienteDocInput): Promise<string> => {
      // ── D-02 versionamento ──
      //   Se parentDocId vier: SELECT parent.versao → INSERT v=parent+1 + parent_doc_id
      //     → upload → UPDATE storage_path → UPDATE parent SET status='superseded'
      //     (idempotente via .neq('status','superseded'))
      //   Se não vier: versao=1, parent_doc_id=null, parent untouched
      let novaVersao = 1
      if (input.parentDocId) {
        const { data: parent, error: parentErr } = await supabase
          .from('cliente_docs')
          .select('versao')
          .eq('id', input.parentDocId)
          .single()
        if (parentErr || !parent) {
          throw parentErr ?? new Error('Versão anterior não encontrada')
        }
        novaVersao = ((parent as { versao?: number }).versao ?? 1) + 1
      }

      // ── D-01 enforce client-side ──
      //   Cliente NUNCA pode marcar próprio upload como requer_aprovacao=true.
      //   RLS é 2ª linha de defesa; aqui descartamos antes do INSERT.
      const requerAprovacao =
        input.autorTipo === 'cliente' ? false : input.requerAprovacao
      const status =
        input.autorTipo === 'interno' && requerAprovacao ? 'pending' : null

      // ── 1. INSERT row para gerar doc_id (path scheme {cliente}/{doc_id}.{ext}) ──
      const { data: row, error: rowErr } = await supabase
        .from('cliente_docs')
        .insert({
          cliente_id: input.clienteId,
          autor_id: input.autorId,
          autor_tipo: input.autorTipo,
          tag: input.tag,
          nome_arquivo: input.file.name,
          mime_type: input.file.type || 'application/octet-stream',
          tamanho_bytes: input.file.size,
          storage_path: '',
          requer_aprovacao: requerAprovacao,
          status,
          parent_doc_id: input.parentDocId ?? null,
          versao: novaVersao,
        })
        .select('id')
        .single()
      if (rowErr || !row) {
        throw rowErr ?? new Error('Falha ao registrar documento')
      }
      const docId = (row as { id: string }).id
      const path = buildDocPath(input.clienteId, docId, input.file.name)

      // ── 2. Upload + rollback row on failure ──
      try {
        await uploadClienteDocFile({
          path,
          file: input.file,
          onProgress: input.onProgress,
        })
      } catch (uploadErr) {
        await supabase.from('cliente_docs').delete().eq('id', docId)
        throw uploadErr
      }

      // ── 3. UPDATE storage_path ──
      await supabase
        .from('cliente_docs')
        .update({ storage_path: path })
        .eq('id', docId)

      // ── 4. D-02: marcar parent superseded (idempotente) ──
      if (input.parentDocId) {
        await supabase
          .from('cliente_docs')
          .update({ status: 'superseded' })
          .eq('id', input.parentDocId)
          .neq('status', 'superseded')
      }

      return docId
    },
    onSuccess: (_docId, input) => {
      qc.invalidateQueries({
        queryKey: QUERY_KEYS.clienteDocs.byCliente(input.clienteId),
      })
      toast.success('Documento enviado')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao enviar documento'),
  })
}

// ─── Mutation: download via signed URL ──────────────────────────────────────

export function useDownloadDoc() {
  return useMutation({
    mutationFn: async (doc: ClienteDoc) => {
      const url = await getSignedDownloadUrl(doc.storage_path)
      const link = document.createElement('a')
      link.href = url
      link.download = doc.nome_arquivo
      document.body.appendChild(link)
      link.click()
      link.remove()
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao baixar documento'),
  })
}
