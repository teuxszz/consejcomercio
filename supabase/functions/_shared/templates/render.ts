// Render helpers para os templates HTML de e-mail.
//
// Regra crítica:
//   - escapeHtml em TODOS os textos (nomeAtribuido, tituloTarefa, etc.) antes
//     do replaceAll — previne XSS em e-mail clients que respeitam <script>
//     ou atributos onerror (T-05-02 do threat model).
//   - URLs (deepLink, gerenciarPrefsLink) passam direto, SEM escape — o
//     replaceAll de uma string já vem do app (não é input do usuário) e
//     escapar quebraria query strings.

import tarefaTemplate from './tarefa.html.ts'

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export interface RenderTarefaVars {
  nomeAtribuido: string
  tituloTarefa: string
  deepLink: string
  gerenciarPrefsLink: string
}

export function renderTarefa(vars: RenderTarefaVars): string {
  return tarefaTemplate
    .replaceAll('{{nomeAtribuido}}', escapeHtml(vars.nomeAtribuido))
    .replaceAll('{{tituloTarefa}}', escapeHtml(vars.tituloTarefa))
    .replaceAll('{{deepLink}}', vars.deepLink)
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}
