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
import cadenciaTemplate from './cadencia.html.ts'
import renovacaoTemplate from './renovacao.html.ts'
import indicacaoTemplate from './indicacao.html.ts'

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

export interface RenderCadenciaVars {
  nomeConsultor: string
  totalTarefas: number
  totalLeads: number
  deepLink: string
  gerenciarPrefsLink: string
}

export function renderCadencia(vars: RenderCadenciaVars): string {
  return cadenciaTemplate
    .replaceAll('{{nomeConsultor}}', escapeHtml(vars.nomeConsultor))
    .replaceAll('{{totalTarefas}}', escapeHtml(String(vars.totalTarefas)))
    .replaceAll('{{totalLeads}}', escapeHtml(String(vars.totalLeads)))
    .replaceAll('{{deepLink}}', vars.deepLink)
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}

export interface RenderRenovacaoVars {
  nomeResponsavel: string
  nomeCliente: string
  diasAteRenovacao: number
  valorContrato: string  // já formatado em BRL pelo caller
  deepLink: string
  gerenciarPrefsLink: string
}

export function renderRenovacao(vars: RenderRenovacaoVars): string {
  return renovacaoTemplate
    .replaceAll('{{nomeResponsavel}}', escapeHtml(vars.nomeResponsavel))
    .replaceAll('{{nomeCliente}}', escapeHtml(vars.nomeCliente))
    .replaceAll('{{diasAteRenovacao}}', escapeHtml(String(vars.diasAteRenovacao)))
    .replaceAll('{{valorContrato}}', escapeHtml(vars.valorContrato))
    .replaceAll('{{deepLink}}', vars.deepLink)
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}

export interface RenderIndicacaoVars {
  nomeResponsavel: string
  nomeIndicante: string
  nomeIndicado: string
  segmento: string
  deepLink: string
  gerenciarPrefsLink: string
}

export function renderIndicacao(vars: RenderIndicacaoVars): string {
  return indicacaoTemplate
    .replaceAll('{{nomeResponsavel}}', escapeHtml(vars.nomeResponsavel))
    .replaceAll('{{nomeIndicante}}', escapeHtml(vars.nomeIndicante))
    .replaceAll('{{nomeIndicado}}', escapeHtml(vars.nomeIndicado))
    .replaceAll('{{segmento}}', escapeHtml(vars.segmento))
    .replaceAll('{{deepLink}}', vars.deepLink)
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}
