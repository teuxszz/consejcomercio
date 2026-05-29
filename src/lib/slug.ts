// Slugify PT-BR — gera identificadores URL-safe e filename-safe a partir de
// nomes humanos. Decompoe NFD, strip diacritics (escape hex `̀-ͯ`
// para portabilidade entre editors UTF-8), lowercase, troca runs de chars
// nao-alfanumericos por hifen e trim.
//
// Extraido de src/components/mensagens/BlocoEditorModal.tsx (Phase 5) para
// ser reutilizado em Phase 8 (PDF/CSV export filenames). Default maxLen=48
// (filenames PDF precisam mais que IDs de bloco). Callers que querem
// maxLen=32 (BlocoEditorModal) devem passar explicitamente.
//
// T-08-02 (Tampering): replace de chars nao-alfanumericos elimina `/` `\` `:`
// `..` e demais sequencias path-traversal antes de virar filename.

export function slugify(input: string, maxLen = 48): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}
