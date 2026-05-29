// Helpers puros sobre `supabase.storage` para o bucket `cliente-docs` (Phase 7 D-04).
//
// Espelha o pattern canônico `usePerfis.ts:87` (avatars), com 4 divergências:
//   - bucket privado `cliente-docs`
//   - `upsert: false` (path único por doc_id → colisão = bug)
//   - download via `createSignedUrl` com expiry 60min (D-04 / T-07-06 mitigated)
//   - validação pré-upload via `validateDocOrThrow`
//
// Hooks (`useUploadClienteDoc`) orquestram INSERT row + uploadClienteDocFile +
// UPDATE storage_path + rollback DELETE on error. Esta lib não toca Postgres.

import { supabase } from '@/lib/supabase'
import { validateDocOrThrow } from '@/lib/file-validation'

/** Expiry em segundos das signed URLs de download (D-04: 60 min). */
export const SIGNED_URL_EXPIRY_SECONDS = 3600

/** Nome canônico do bucket (privado). */
export const BUCKET = 'cliente-docs'

/**
 * Path scheme imutável (D-04 / T-07-01 mitigated):
 *   `{cliente_id}/{doc_id}.{ext}`
 *
 * `doc_id` deve vir de `cliente_docs.id` (uuid server-generated via INSERT
 * pre-upload). O `nome_arquivo` original vai em coluna separada — nunca no path.
 */
export function buildDocPath(clienteId: string, docId: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin'
  return `${clienteId}/${docId}.${ext}`
}

export interface UploadParams {
  path: string
  file: File
  onProgress?: (pct: number) => void
}

/**
 * Faz upload de um File no bucket `cliente-docs` no path informado.
 * Lança `Error` em qualquer falha (validação client-side OU Supabase error).
 *
 * Pitfall §1 RESEARCH: `onUploadProgress` não é exposto pelo tipo
 * `@supabase/supabase-js@2.99.x`, mas a opção é aceita em runtime.
 */
export async function uploadClienteDocFile({ path, file, onProgress }: UploadParams): Promise<void> {
  validateDocOrThrow(file)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
      // @ts-expect-error onUploadProgress: tipo não exposto em @supabase/supabase-js@2.99.x (Pitfall §1)
      onUploadProgress: onProgress
        ? (p: { loaded: number; total: number }) => onProgress((p.loaded / p.total) * 100)
        : undefined,
    })
  if (error) throw error
}

/**
 * Gera URL assinada de download válida por SIGNED_URL_EXPIRY_SECONDS.
 * Disparada on-click (não em useEffect) para evitar leak via logs (T-07-06).
 */
export async function getSignedDownloadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)
  if (error) throw error
  return data.signedUrl
}
