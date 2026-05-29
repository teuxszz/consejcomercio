// Phase 8 (Plan 03) — Export ZIP com 3 CSVs (leads/tarefas/contratos) do
// snapshot de desempenho individual.
//
// D-04 + T-08-03 (CSV injection OWASP) + T-08-08 (Blob URL hygiene):
//   - Lazy import papaparse + jszip (chunks separados via Vite — A8)
//   - sanitizeCell prefixa `=` `+` `-` `@` `\t` `\r` com apostrofo —
//     mitiga ataque DDE/SUM injection no Excel/LibreOffice
//   - UTF-8 BOM (`﻿`) prepended a cada CSV — Excel PT-BR le acentos
//     corretamente (sem BOM, "São Paulo" vira "SÃ£o Paulo")
//   - URL.revokeObjectURL apos download — sem leak de memoria
//
// Filename: `desempenho_<slug>_<periodoLabel>.zip` (T-08-02 — slug elimina
// path-traversal).
//
// Colunas (§Pattern 9 RESEARCH):
//   leads.csv:      nome, empresa, segmento, status, investimento_estimado,
//                   created_at, updated_at, motivo_perda
//   tarefas.csv:    titulo, status, prioridade, data_vencimento, criado_em,
//                   concluida_em
//   contratos.csv:  cliente_nome, modelo_precificacao, valor_total,
//                   valor_mensal, status, data_inicio, data_fim

import type { Lead, Tarefa, Contrato } from '@/types'
import { slugify } from './slug'

const UTF8_BOM = '﻿'

export interface ZipInput {
  perfilNome: string
  periodoLabel: string
  leads: Lead[]
  tarefas: Tarefa[]
  contratos: Array<Contrato & { cliente_nome?: string }>
}

/**
 * T-08-03 (OWASP CSV Injection) — prefixa celulas que iniciam com chars de
 * formula com apostrofo. Quando Excel/LibreOffice abre, `'=SUM(...)` e tratado
 * como string literal e nao como formula.
 *
 * Chars cobertos: `=` `+` `-` `@` `\t` `\r` (OWASP recommendation).
 */
export function sanitizeCell(value: string): string {
  if (!value || value.length === 0) return value
  const first = value[0]
  if (
    first === '=' ||
    first === '+' ||
    first === '-' ||
    first === '@' ||
    first === '\t' ||
    first === '\r'
  ) {
    return `'${value}`
  }
  return value
}

// Helper — normaliza valor possivelmente nulo para string e aplica sanitizeCell
function s(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  return sanitizeCell(String(value))
}

// Helper — valores numericos / boolean simples (nao precisam sanitize)
function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

// Helper — data ISO (manter formato ISO 8601 — Excel reconhece como data)
function d(value: string | null | undefined): string {
  if (!value) return ''
  return value
}

/**
 * Gera e baixa um ZIP contendo 3 CSVs do snapshot atual. Caller passa os
 * arrays JA filtrados (por perfil + periodo) — gerarZipCSV nao filtra nada.
 */
export async function gerarZipCSV(input: ZipInput): Promise<void> {
  // Lazy import — Vite emite chunks separados papaparse-*.js + jszip-*.js
  const [{ default: Papa }, { default: JSZip }] = await Promise.all([
    import('papaparse'),
    import('jszip'),
  ])

  const { perfilNome, periodoLabel, leads, tarefas, contratos } = input

  // ── leads.csv ────────────────────────────────────────────────────────────
  const leadsRows = leads.map(l => ({
    nome: s(l.nome),
    empresa: s(l.empresa),
    segmento: s(l.segmento),
    status: s(l.status),
    investimento_estimado: s(l.investimento_estimado),
    created_at: d(l.created_at),
    updated_at: d(l.updated_at),
    motivo_perda: s(l.motivo_perda),
  }))
  const leadsCsv = Papa.unparse(leadsRows, { quotes: true })

  // ── tarefas.csv ──────────────────────────────────────────────────────────
  const tarefasRows = tarefas.map(t => ({
    titulo: s(t.titulo),
    status: s(t.status),
    prioridade: s(t.prioridade),
    data_vencimento: d(t.data_vencimento),
    criado_em: d(t.created_at),
    concluida_em: d(t.data_conclusao),
  }))
  const tarefasCsv = Papa.unparse(tarefasRows, { quotes: true })

  // ── contratos.csv ────────────────────────────────────────────────────────
  const contratosRows = contratos.map(c => ({
    cliente_nome: s(c.cliente_nome ?? c.cliente?.nome ?? ''),
    modelo_precificacao: s(c.modelo_precificacao),
    valor_total: n(c.valor_total),
    valor_mensal: n(c.valor_mensal),
    status: s(c.status),
    data_inicio: d(c.data_inicio),
    data_fim: d(c.data_fim),
  }))
  const contratosCsv = Papa.unparse(contratosRows, { quotes: true })

  // ── Compor ZIP com UTF-8 BOM em cada arquivo ─────────────────────────────
  const zip = new JSZip()
  zip.file('leads.csv', UTF8_BOM + leadsCsv)
  zip.file('tarefas.csv', UTF8_BOM + tarefasCsv)
  zip.file('contratos.csv', UTF8_BOM + contratosCsv)

  const blob = await zip.generateAsync({ type: 'blob' })

  // ── Trigger download + revoke (T-08-08) ──────────────────────────────────
  const filename = `desempenho_${slugify(perfilNome)}_${periodoLabel}.zip`
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
