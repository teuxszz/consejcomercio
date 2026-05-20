// Biblioteca de blocos para o composer de mensagens.
// O composer é SLOT-BASED: uma seleção por categoria. Picar um bloco da mesma
// categoria substitui o anterior, garantindo que a mensagem fique coesa e
// sem repetição. A ordem abaixo define a ORDEM CANÔNICA na mensagem final.

export interface Bloco {
  id: string
  categoria: BlocoCategoria
  titulo: string
  texto: string
  /** Se definido, o bloco só aparece quando o setor atual bate. Vazio = todos. */
  setores?: string[]
  descricao?: string
}

export const BLOCO_CATEGORIAS = [
  'Abertura',
  'Identificação',
  'Confirmação',
  'Gancho',
  'Proposta de valor',
  'CTA',
  'Fechamento',
] as const

export type BlocoCategoria = typeof BLOCO_CATEGORIAS[number]

export const BLOCOS: Bloco[] = [
  // ─── Abertura ───────────────────────────────────────────────
  { id: 'abert-casual',    categoria: 'Abertura', titulo: 'Casual',              texto: 'Oi, {{nome}}, tudo bem?' },
  { id: 'abert-tarde',     categoria: 'Abertura', titulo: 'Boa tarde',           texto: 'Oi, {{nome}}, boa tarde!' },
  { id: 'abert-direto',    categoria: 'Abertura', titulo: 'Direto ao ponto',     texto: '{{nome}}, tudo certo? Sou {{responsavel}}, da CONSEJ.' },
  { id: 'abert-interesse', categoria: 'Abertura', titulo: 'Curiosidade',         texto: 'Oi, {{nome}}! Acompanhei o que vocês estão construindo na {{empresa}} e fiquei curioso(a).' },
  { id: 'abert-retomar',   categoria: 'Abertura', titulo: 'Retomando (followup)', texto: 'Oi, {{nome}}! Só retomando nossa conversa.' },

  // ─── Identificação ──────────────────────────────────────────
  { id: 'ident-padrao',   categoria: 'Identificação', titulo: 'CONSEJ padrão', texto: 'Aqui é o(a) {{responsavel}}, da CONSEJ — somos uma empresa júnior de consultoria jurídica. Trabalhamos com negócios em crescimento, sem o custo de um escritório tradicional.' },
  { id: 'ident-curto',    categoria: 'Identificação', titulo: 'Curto',         texto: '{{responsavel}} aqui, da CONSEJ (consultoria jurídica).' },
  { id: 'ident-mej',      categoria: 'Identificação', titulo: 'Rede MEJ',      texto: 'Sou {{responsavel}}, da CONSEJ — empresa júnior de consultoria jurídica, parte da Rede MEJ.' },

  // ─── Confirmação ────────────────────────────────────────────
  { id: 'conf-responsavel', categoria: 'Confirmação', titulo: 'É você o responsável?', texto: 'Antes de avançar, só pra confirmar: você é o(a) responsável pelo jurídico da {{empresa}}, ou faria mais sentido eu falar com outra pessoa?' },
  { id: 'conf-pessoa',      categoria: 'Confirmação', titulo: 'Contato certo?',          texto: 'Me confirma uma coisa, {{nome}}: esse contato aqui é o seu mesmo ou é algum canal genérico da {{empresa}}? Só pra eu não falar com a pessoa errada.' },
  { id: 'conf-inpi',        categoria: 'Confirmação', titulo: 'Marca no INPI',           texto: 'Fiz uma busca rápida no INPI e não encontrei a marca da {{empresa}} registrada em nome de vocês. Pode ser que esteja em outro CNPJ ou em nome de sócio — por isso queria confirmar antes de seguir.', setores: ['marca_pi'] },
  { id: 'conf-contrato',    categoria: 'Confirmação', titulo: 'Já têm contrato-padrão?', texto: 'Pergunta rápida: a {{empresa}} já tem um modelo de contrato fechado ou o time ainda monta "no jeito" pra cada cliente?', setores: ['contratual'] },
  { id: 'conf-lgpd',        categoria: 'Confirmação', titulo: 'Já têm política LGPD?',   texto: 'A {{empresa}} hoje tem política de privacidade e termos de uso publicados, ou é uma coisa que ainda tá pra fazer?', setores: ['digital_lgpd'] },

  // ─── Gancho (filtrado por setor) ────────────────────────────
  { id: 'soc-saida',        categoria: 'Gancho', titulo: 'Societário — se um sócio saísse', texto: 'Pergunta direta: se um dos sócios da {{empresa}} quisesse sair amanhã, vocês conseguiriam resolver isso em uma conversa — ou viraria uma negociação longa, cara e desgastante? Essa pergunta decide se um acordo de sócios é urgente.', setores: ['societario'] },
  { id: 'soc-crescimento',  categoria: 'Gancho', titulo: 'Societário — crescendo sem acordo', texto: 'O que a gente vê muito em empresas no momento da {{empresa}}: sócios que começaram no boca-a-boca e hoje estão tomando decisões grandes sem acordo formal. Quando vira conflito, vira caro.', setores: ['societario'] },

  { id: 'cont-inadimplente', categoria: 'Gancho', titulo: 'Contratual — cliente atrasa',   texto: 'Quando um cliente da {{empresa}} atrasa pagamento, existe um processo claro pra cobrança — ou fica no improviso? Na maioria dos casos que a gente atende, é improviso. E isso custa caro.', setores: ['contratual'] },
  { id: 'cont-modelo',       categoria: 'Gancho', titulo: 'Contratual — contrato da internet', texto: 'A maior parte dos problemas jurídicos em empresas em crescimento começa no mesmo lugar: contrato baixado da internet, adaptado no Word, sem cláusulas de reajuste ou multa. Quando vira problema, não tem como cobrar direito.', setores: ['contratual'] },

  { id: 'marca-vulner',     categoria: 'Gancho', titulo: 'Marca — vulnerabilidade', texto: 'Sem registro no INPI, a marca da {{empresa}} é vulnerável — qualquer um pode depositar antes e, se depositar, vocês são obrigados a mudar de nome.', setores: ['marca_pi'] },
  { id: 'marca-18meses',    categoria: 'Gancho', titulo: 'Marca — 18 meses de processo', texto: 'O registro no INPI leva cerca de 18 meses do depósito à concessão. Por isso começar agora protege a marca da {{empresa}} de quem pode chegar antes.', setores: ['marca_pi'] },

  { id: 'lgpd-fechamento',  categoria: 'Gancho', titulo: 'LGPD — cliente grande exige', texto: 'Uma dor recorrente em negócios digitais como a {{empresa}}: começam a fechar contratos maiores e o cliente pede "comprovação de LGPD". Quem não tem, perde o contrato.', setores: ['digital_lgpd'] },
  { id: 'lgpd-enxuto',      categoria: 'Gancho', titulo: 'LGPD — adequação enxuta',    texto: 'A gente trata LGPD de forma enxuta — política, termos, mapeamento e base legal, em 2 ou 3 semanas. Não vira projeto infinito de 6 meses.', setores: ['digital_lgpd'] },

  { id: 'trab-pj',          categoria: 'Gancho', titulo: 'Trabalhista — PJ virando passivo', texto: 'Vejo muito negócio em crescimento contratando PJ "porque é mais simples" — e depois descobrindo que aquele PJ virou vínculo, o que vira passivo, que vira ação. Prevenção é barata, remédio é chato.', setores: ['trabalhista'] },
  { id: 'trab-estrutura',   categoria: 'Gancho', titulo: 'Trabalhista — estruturar antes',   texto: 'Estruturar a parte trabalhista da {{empresa}} antes de virar problema custa muito menos do que corrigir depois. É contratação certa, documento certo, regra clara.', setores: ['trabalhista'] },

  { id: 'geral-dor',        categoria: 'Gancho', titulo: 'Geral — dor customizada',        texto: '{{gancho}}' },
  { id: 'geral-contexto',   categoria: 'Gancho', titulo: 'Geral — contexto/crescimento',    texto: 'Olhando pra {{empresa}}, percebi {{dor}} — e é exatamente o tipo de coisa que a gente costuma resolver antes de virar problema maior.' },

  // ─── Proposta de valor ─────────────────────────────────────
  { id: 'val-acessivel',    categoria: 'Proposta de valor', titulo: 'Custo acessível',       texto: 'Diferente de escritório tradicional, a gente trabalha com custo acessível e sem burocracia — entrega o mesmo resultado técnico, mas sem o preço de uma banca grande.' },
  { id: 'val-rapido',       categoria: 'Proposta de valor', titulo: 'Entrega rápida',        texto: 'Trabalhamos com escopo fechado e entrega em {{prazo}} — sem projeto aberto que vira conta de advogado todo mês.' },
  { id: 'val-consultivo',   categoria: 'Proposta de valor', titulo: 'Consultor, não advogado', texto: 'A gente se posiciona como consultor, não advogado — a ideia é resolver o problema prático de forma acessível, não criar dependência jurídica.' },
  { id: 'val-junior',       categoria: 'Proposta de valor', titulo: 'Empresa júnior séria',    texto: 'Somos uma empresa júnior, o que significa custo menor — mas com supervisão docente e processo formal. Resultado equivalente ao de uma banca, pela metade do preço.' },

  // ─── CTA ────────────────────────────────────────────────────
  { id: 'cta-tempo',        categoria: 'CTA', titulo: 'Reunião de {{tempo}}',     texto: 'Rola uns {{tempo}} essa semana pra eu entender melhor o contexto da {{empresa}}? Sem compromisso, sem pitch — é pra eu ouvir mesmo.' },
  { id: 'cta-30-diag',      categoria: 'CTA', titulo: 'Diagnóstico gratuito 30min', texto: 'Tenho um diagnóstico gratuito de 30 min que costuma render bastante — a gente mapeia prioridade jurídica junto e, se fizer sentido depois, a gente conversa. Topa agendar?' },
  { id: 'cta-horarios',     categoria: 'CTA', titulo: 'Manda horários',           texto: 'Me manda 2 ou 3 horários que funcionam pra você essa semana ou a próxima e eu fecho um.' },
  { id: 'cta-material',     categoria: 'CTA', titulo: 'Enviar material',           texto: 'Se preferir, posso te mandar um material curto (1 página) sobre isso pra você olhar no seu tempo — sem compromisso. O que acha?' },
  { id: 'cta-diag-link',    categoria: 'CTA', titulo: 'Link do diagnóstico',       texto: 'Tem um diagnóstico rápido (5 min) aqui: [link_diagnostico]. Se topar preencher, já consigo te devolver com um plano de ação.' },
  { id: 'cta-checklist',    categoria: 'CTA', titulo: 'Mandar checklist',          texto: 'Posso te mandar o checklist que a gente usa pra avaliar isso? É gratuito, chega por aqui mesmo — é só falar "manda".' },

  // ─── Fechamento ─────────────────────────────────────────────
  { id: 'fech-sem-pressao', categoria: 'Fechamento', titulo: 'Sem pressão',      texto: 'Se esse não for o momento, tudo bem — é só me avisar. Fica o contato pra quando precisar.' },
  { id: 'fech-assinatura',  categoria: 'Fechamento', titulo: 'Assinatura',       texto: 'Abraço,\n{{responsavel}}\nCONSEJ' },
  { id: 'fech-qualquer',    categoria: 'Fechamento', titulo: 'Fica o contato',   texto: 'Qualquer coisa, é só me chamar por aqui.' },
]

/** Retorna os blocos da categoria, filtrando por setor quando aplicável. */
export function blocosPorCategoria(categoria: BlocoCategoria, setor: string): Bloco[] {
  return BLOCOS.filter(b => {
    if (b.categoria !== categoria) return false
    if (!b.setores || b.setores.length === 0) return true
    // Para setor "geral", mostra só os blocos sem restrição de setor
    if (setor === 'geral') return false
    return b.setores.includes(setor)
  })
}

/** Config persistido em Supabase para edits/customs/oculto. */
export interface BlocosConfig {
  overrides: Record<string, { titulo?: string; texto?: string; setores?: string[] }>
  custom: Array<{ id: string; categoria: string; titulo: string; texto: string; setores?: string[] }>
  ocultos: string[]
}

export const DEFAULT_BLOCOS_CONFIG: BlocosConfig = {
  overrides: {},
  custom: [],
  ocultos: [],
}

function isCategoriaValida(c: string): c is BlocoCategoria {
  return (BLOCO_CATEGORIAS as readonly string[]).includes(c)
}

/**
 * Combina os blocos base com customs e aplica overrides; remove os ocultos.
 * Custom blocks com categoria inválida são ignorados (defensivo).
 */
export function getBlocosEfetivos(config?: BlocosConfig | null): Bloco[] {
  const cfg = config ?? DEFAULT_BLOCOS_CONFIG
  const ocultos = new Set(cfg.ocultos ?? [])

  const base = BLOCOS.filter(b => !ocultos.has(b.id)).map(b => {
    const ov = cfg.overrides?.[b.id]
    if (!ov) return b
    return {
      ...b,
      titulo: ov.titulo ?? b.titulo,
      texto: ov.texto ?? b.texto,
      setores: ov.setores ?? b.setores,
    }
  })

  const customs: Bloco[] = (cfg.custom ?? [])
    .filter(c => isCategoriaValida(c.categoria) && !ocultos.has(c.id))
    .map(c => ({
      id: c.id,
      categoria: c.categoria as BlocoCategoria,
      titulo: c.titulo,
      texto: c.texto,
      setores: c.setores,
    }))

  return [...base, ...customs]
}

/** Versão filtrada por categoria + setor, sobre o conjunto efetivo. */
export function blocosEfetivosPorCategoria(
  categoria: BlocoCategoria,
  setor: string,
  config?: BlocosConfig | null,
): Bloco[] {
  return getBlocosEfetivos(config).filter(b => {
    if (b.categoria !== categoria) return false
    if (!b.setores || b.setores.length === 0) return true
    if (setor === 'geral') return false
    return b.setores.includes(setor)
  })
}

/** True se o id é um bloco "base" (vem de BLOCOS estático). */
export function isBlocoBase(id: string): boolean {
  return BLOCOS.some(b => b.id === id)
}

/** Monta a mensagem final a partir dos slots selecionados, na ordem canônica.
 *  Aceita um pool de blocos opcional (efetivos com overrides/custom). */
export function montarMensagem(
  slots: Record<string, string | null | undefined>,
  fill: (tpl: string) => string,
  pool?: Bloco[],
): string {
  const blocosPool = pool ?? BLOCOS
  const partes: string[] = []
  for (const cat of BLOCO_CATEGORIAS) {
    const blocoId = slots[cat]
    if (!blocoId) continue
    const bloco = blocosPool.find(b => b.id === blocoId)
    if (!bloco) continue
    partes.push(fill(bloco.texto))
  }
  return partes.join('\n\n').trim()
}
