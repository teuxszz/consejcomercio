import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Copy, Check, Smartphone, Mail, Linkedin, RefreshCw, Sparkles, Search, Phone, X, MessageSquare, BookOpen, Pencil, Eye, RotateCcw, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useLeads } from '@/hooks/useLeads'
import { useMeuPerfil } from '@/hooks/usePerfis'
import { useConfiguracoes, DEFAULT_MENSAGENS_CONFIG } from '@/hooks/useConfiguracoes'
import type { MensagensConfig } from '@/types'
import { ConfirmSendModal } from '@/components/leads/ConfirmSendModal'
import {
  BLOCO_CATEGORIAS,
  blocosEfetivosPorCategoria,
  getBlocosEfetivos,
  isBlocoBase,
  montarMensagem,
  type Bloco,
  type BlocoCategoria,
} from '@/lib/blocos-mensagem'
import { BlocoEditorModal } from '@/components/mensagens/BlocoEditorModal'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Stage = 'primeiro_contato' | 'followup' | 'diagnostico' | 'proposta' | 'negociacao' | 'pos_fechamento' | 'reativacao'
// Setores alinhados ao catálogo real da CONSEJ (useConfiguracoes.ts → ServicoCategoria)
export type Sector = 'geral' | 'societario' | 'contratual' | 'digital_lgpd' | 'trabalhista' | 'marca_pi'
export type Channel = 'whatsapp' | 'email' | 'linkedin'

export interface MsgTemplate { subject?: string; body: string }
type TemplateMap = Partial<Record<Sector, MsgTemplate[]>>
type Templates = Record<Stage, Record<Channel, TemplateMap>>

// ─── Static data ──────────────────────────────────────────────────────────────

export const STAGES: { id: Stage; label: string; colorVal: string; bgVal: string }[] = [
  { id: 'primeiro_contato', label: 'Primeiro Contato',   colorVal: '#93c5fd', bgVal: 'rgba(59,130,246,0.12)'   },
  { id: 'followup',         label: 'Follow-up',          colorVal: '#c4b5fd', bgVal: 'rgba(139,92,246,0.12)'  },
  { id: 'diagnostico',      label: 'Diagnóstico',        colorVal: '#67e8f9', bgVal: 'rgba(6,182,212,0.12)'   },
  { id: 'proposta',         label: 'Proposta Enviada',   colorVal: '#fbbf24', bgVal: 'rgba(245,158,11,0.12)'  },
  { id: 'negociacao',       label: 'Negociação',         colorVal: '#fdba74', bgVal: 'rgba(249,115,22,0.12)'  },
  { id: 'pos_fechamento',   label: 'Pós-Fechamento',     colorVal: '#6ee7b7', bgVal: 'rgba(16,185,129,0.12)'  },
  { id: 'reativacao',       label: 'Reativação',         colorVal: '#fda4af', bgVal: 'rgba(244,63,94,0.12)'   },
]

// Setores espelham as categorias do catálogo de serviços (ServicoCategoria)
export const SECTORS: { id: Sector; label: string; emoji: string }[] = [
  { id: 'geral',         label: 'Geral / Consultoria',         emoji: '⚖️'  },
  { id: 'societario',    label: 'Societário / Acordo Sócios',  emoji: '🤝'  },
  { id: 'contratual',    label: 'Contratos / Inadimplência',   emoji: '📝'  },
  { id: 'digital_lgpd',  label: 'Digital / LGPD',              emoji: '🔐'  },
  { id: 'trabalhista',   label: 'Trabalhista',                 emoji: '👥'  },
  { id: 'marca_pi',      label: 'Marca / INPI',                emoji: '™️'  },
]

export const CHANNELS: { id: Channel; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone },
  { id: 'email',    label: 'E-mail',   icon: Mail        },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin    },
]

// ─── Template helper ──────────────────────────────────────────────────────────

function fill(tpl: string, ctx: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? `[${k}]`)
}

// ─── Template helpers ─────────────────────────────────────────────────────────

function fillBrackets(text: string, defaults: MensagensConfig['defaults']): string {
  return text
    .replace(/\[link_diagnostico\]/gi, defaults.link_diagnostico || '[link_diagnostico]')
    .replace(/\[forma_pagamento\]/gi, defaults.forma_pagamento || '[forma_pagamento]')
    .replace(/\[prazo_entrega\]/gi, defaults.prazo_entrega || '[prazo_entrega]')
    .replace(/\[valor_hora\]/gi, defaults.valor_hora || '[valor_hora]')
    .replace(/\[assinatura\]/gi, defaults.assinatura || '[assinatura]')
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES: Templates = {

  /* ────────────────── PRIMEIRO CONTATO ────────────────── */
  primeiro_contato: {
    whatsapp: {
      geral: [
        { body: `Oi, {{nome}}, tudo certo?\n\nAqui é o(a) {{responsavel}}, da CONSEJ — somos uma empresa júnior de consultoria jurídica. A gente ajuda negócios em crescimento a estruturar o jurídico de forma prática, sem custo de escritório tradicional.\n\nRola trocar uma ideia rápida essa semana? Tenho um diagnóstico gratuito de 30 min que costuma render bastante — sem compromisso.` },
        { body: `{{nome}}, tudo bem? 👋\n\n{{responsavel}} aqui, da CONSEJ. A gente é uma EJ de consultoria jurídica — ajudamos negócios a resolver contratos, societário, LGPD, marca e trabalhista antes de virar problema. Custo acessível, entrega séria.\n\nVi a {{empresa}} e fiquei curioso(a) sobre o momento de vocês. Topa 20 min pra eu entender o contexto?` },
      ],
      societario: [
        { body: `Oi, {{nome}}! {{responsavel}} aqui, da CONSEJ.\n\nUma coisa que a gente vê muito em negócios como a {{empresa}}: sócios que começaram no boca-a-boca e hoje estão tomando decisões grandes sem um acordo formal. Quando vira conflito, vira caro.\n\nAcordo de sócios resolve isso em 1–2 semanas. Bora marcar 20 min pra eu te explicar como a gente estrutura?` },
        { body: `{{nome}}, tudo bem?\n\nSou {{responsavel}}, da CONSEJ. A gente ajuda empresas na parte societária — contrato social, acordo de sócios, saída/entrada de sócio, governança.\n\nSó queria te fazer uma pergunta: se um dos sócios da {{empresa}} quisesse sair hoje, vocês sabem exatamente como ficaria a divisão? Se a resposta for "acho que sim", vale a pena a gente conversar 15 min.` },
      ],
      contratual: [
        { body: `Oi, {{nome}}! {{responsavel}} aqui, da CONSEJ 👋\n\nUm padrão que vejo em empresas em crescimento: contrato baixado da internet, adaptado no Word, sem cláusula de reajuste, sem multa, sem foro. Funciona até o dia que vira problema.\n\nA gente revisa e estrutura um modelo-padrão pra {{empresa}} em poucos dias. Rolaria uns 20 min essa semana pra eu te mostrar como?` },
        { body: `{{nome}}, tudo certo?\n\nSou {{responsavel}}, da CONSEJ. A gente cuida de contratos e inadimplência pra empresas como a {{empresa}} — revisão, modelos-padrão, cobrança estruturada.\n\nPergunta rápida: quando um cliente atrasa, existe um processo claro na {{empresa}} ou fica no improviso? Se é improviso, talvez valha 15 min de conversa. Tem um diagnóstico gratuito que já te entrega um plano de ação.` },
      ],
      digital_lgpd: [
        { body: `Oi, {{nome}}! {{responsavel}}, da CONSEJ.\n\nVi que a {{empresa}} coleta dado de cliente (formulário, cadastro, checkout) — e hoje isso é LGPD. Sem política de privacidade e mapeamento mínimo, um cliente pode travar um pagamento ou a ANPD pode vir bater.\n\nA gente adequa em 2–3 semanas, sem virar projeto infinito. Topa 20 min pra eu te mostrar o escopo?` },
        { body: `{{nome}}, tudo bem?\n\nSou {{responsavel}}, da CONSEJ. Uma dor recorrente em negócios digitais como a {{empresa}}: começam a fechar contratos maiores e o cliente pede "comprovação de LGPD". Quem não tem, perde o contrato.\n\nA gente faz a adequação de forma enxuta — política, termos, mapeamento. Rola uma conversa rápida essa semana?` },
      ],
      trabalhista: [
        { body: `Oi, {{nome}}! {{responsavel}} aqui, da CONSEJ.\n\nOlhando pra {{empresa}}, uma coisa que a gente vê bastante: time crescendo, contratação na base do PJ "porque é mais fácil", sem documentação trabalhista adequada. Isso vira passivo rápido.\n\nA gente estrutura os documentos (contrato, política, acordo) numa sprint curta. 20 min de conversa pra eu te explicar?` },
        { body: `{{nome}}, tudo certo?\n\nSou {{responsavel}}, da CONSEJ. A gente ajuda empresas em crescimento a estruturar a parte trabalhista sem criar burocracia — contrato CLT, PJ bem feito, política de home office, regras claras.\n\nSe a {{empresa}} já contrata ou tá perto de contratar, vale a pena 15 min. Quando fica bom pra você?` },
      ],
      marca_pi: [
        { body: `Oi, {{nome}}! 👋\n\n{{responsavel}}, da CONSEJ. Fiz uma busca rápida no INPI e a marca da {{empresa}} não aparece registrada (ou tá em nome de outro titular — por isso quero confirmar com você).\n\nSem registro, qualquer um pode pedir a marca antes e você é obrigado a mudar de nome. A gente deposita e acompanha o processo inteiro. Rola 15 min pra alinhar?` },
        { body: `{{nome}}, tudo bem?\n\nSou {{responsavel}}, da CONSEJ. Trabalho com registro de marca no INPI — e uma coisa que vejo muito é empresa que investe pesado em branding e deixa a marca vulnerável porque "depois a gente registra".\n\nO processo leva ~18 meses, então quanto antes começar, melhor. Topa uma conversa rápida pra eu te mostrar o passo a passo?` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Consultoria jurídica pra {{empresa}} — sem custo de escritório tradicional`,
          body: `Oi, {{nome}},\n\nAqui é o(a) {{responsavel}}, da CONSEJ.\n\nA CONSEJ é uma empresa júnior de consultoria jurídica — o que isso significa na prática: a gente oferece o mesmo resultado que você esperaria de um escritório jurídico, mas com agilidade, custo acessível e sem burocracia.\n\nA gente atende negócios em crescimento — startups, empresas júniores, escritórios criativos, empresas de gestão — e o que mais ouvimos é "precisamos organizar o jurídico, mas não queremos virar uma empresa engessada".\n\nPor isso queria propor uma conversa curta (30 min, sem custo) pra entender o momento da {{empresa}} e, se fizer sentido, montar um diagnóstico do que vale priorizar agora.\n\nAlgum horário essa semana funcionaria pra você?\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      societario: [
        {
          subject: `Acordo de sócios — antes do problema aparecer, {{nome}}`,
          body: `Oi, {{nome}},\n\n{{responsavel}} aqui, da CONSEJ.\n\nPerguntinha direta: se um dos sócios da {{empresa}} quisesse sair amanhã, vocês conseguiriam resolver essa saída em uma conversa — ou viraria uma negociação longa, cara e desgastante?\n\nEssa é a pergunta que a gente faz logo no início porque ela decide se um acordo de sócios é urgente ou pode esperar. Na maioria dos negócios em crescimento, descobrimos que é urgente — e dá pra resolver em 1 ou 2 semanas, com um documento que cobre saída, entrada, morte, incapacidade, deadlock e distribuição.\n\nSe quiser, tenho um diagnóstico gratuito (30 min) pra mapear isso junto com você. Me avisa se faz sentido essa semana ou a próxima.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      contratual: [
        {
          subject: `Um contrato bem feito é a coisa mais barata que a {{empresa}} pode ter`,
          body: `Oi, {{nome}},\n\n{{responsavel}}, da CONSEJ.\n\nA maior parte dos problemas jurídicos que a gente resolve em empresas em crescimento começa no mesmo lugar: contrato baixado da internet, adaptado no Word, sem cláusulas básicas de reajuste, rescisão ou multa. Quando o cliente atrasa ou quer sair, não tem como cobrar direito.\n\nA gente estrutura os contratos da {{empresa}} (padrão de venda, prestação de serviço, fornecimento, NDA) de forma que você use sem pedir ajuda toda vez. Normalmente fecha em 2–3 semanas.\n\nTopa uns 30 min de conversa pra eu entender o contexto e te mostrar o escopo?\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      digital_lgpd: [
        {
          subject: `LGPD na {{empresa}} — sem transformar isso num projeto de 6 meses`,
          body: `Oi, {{nome}},\n\n{{responsavel}}, da CONSEJ.\n\nUma coisa que vejo bastante em negócios digitais: a LGPD vira um monstro quando ninguém ataca. A gente acredita no oposto — adequação enxuta, em 2 ou 3 semanas, que cobre o que realmente importa: política de privacidade, termos de uso, mapeamento de dados, processo de atendimento a titular e base legal de tratamento.\n\nIsso resolve 90% do risco prático e garante que, quando um cliente grande pedir "comprovação de LGPD", a {{empresa}} tem a resposta pronta.\n\nRolaria 30 min pra eu entender como vocês coletam e tratam dados hoje e te devolver um plano de ação?\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      trabalhista: [
        {
          subject: `Estruturar o RH da {{empresa}} antes de virar passivo`,
          body: `Oi, {{nome}},\n\n{{responsavel}}, da CONSEJ.\n\nA gente vê muito negócio em crescimento contratando PJ "porque é mais simples" — e depois descobrindo que aquele PJ virou vínculo, o que vira passivo, que vira ação, que vira prejuízo. O remédio é chato; a prevenção é barata.\n\nNa CONSEJ, a gente ajuda a {{empresa}} a estruturar os documentos trabalhistas certos pro momento: contrato CLT quando faz sentido, PJ bem redigido quando faz sentido, política interna, regras de home office e acordo de confidencialidade.\n\nSe tiver 30 min essa semana, topo te mostrar o que costuma ser prioridade pra empresa do porte da {{empresa}}.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      marca_pi: [
        {
          subject: `A marca da {{empresa}} tá protegida? (provavelmente não)`,
          body: `Oi, {{nome}},\n\n{{responsavel}}, da CONSEJ.\n\nFui olhar rapidamente a marca da {{empresa}} no INPI e não achei registro ativo em nome de vocês — ou achei algo que precisa ser validado com você pra ter certeza.\n\nO ponto é: marca sem registro é marca vulnerável. Qualquer pessoa pode depositar antes e, se depositar, a {{empresa}} é obrigada a mudar de nome. O processo leva cerca de 18 meses, então quanto antes começar, menor o risco.\n\nNa CONSEJ, a gente faz a busca de anterioridade, o depósito e o acompanhamento até a concessão. Se quiser, te mando a análise da marca de vocês junto de uma conversa de 20 min essa semana.\n\nMe avisa se faz sentido.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `Oi, {{nome}}! Acompanhei o que vocês estão construindo na {{empresa}} e fiquei curioso(a).\n\nAqui é o(a) {{responsavel}}, da CONSEJ — somos uma empresa júnior de consultoria jurídica. Trabalhamos com negócios em crescimento (startups, MEJs, escritórios criativos, empresas de gestão) ajudando a organizar contratos, societário, LGPD, marca e trabalhista com custo acessível e sem burocracia de escritório tradicional.\n\nTopa trocar uma ideia rápida? Tenho um diagnóstico gratuito de 30 min que costuma valer muito — mesmo pra quem já tem tudo "mais ou menos" organizado.` },
      ],
      societario: [
        { body: `Oi, {{nome}}! Vi o trabalho de vocês à frente da {{empresa}} e fiquei com vontade de conversar.\n\nSou {{responsavel}}, da CONSEJ — uma empresa júnior de consultoria jurídica. A gente ajuda negócios a estruturar a parte societária (contrato social, acordo de sócios, governança) antes que vire conflito. É o tipo de coisa que parece que pode esperar… até não poder mais.\n\nRolaria uma conversa curta essa semana? Se preferir, consigo te mandar um material sobre acordo de sócios antes, sem compromisso.` },
      ],
      contratual: [
        { body: `Oi, {{nome}}! Acompanhei o que vocês estão construindo na {{empresa}} e fiquei impressionado(a).\n\nAqui é o(a) {{responsavel}}, da CONSEJ. Trabalho com estruturação de contratos e cobrança para empresas em crescimento — basicamente, deixar o time comercial rodando sem medo de assinar, e deixar o financeiro com um processo claro quando alguém atrasa.\n\nTopa trocar uma ideia? Não é reunião de venda, é conversa mesmo — quero entender o momento de vocês.` },
      ],
      digital_lgpd: [
        { body: `Oi, {{nome}}! Vi o posicionamento digital da {{empresa}} e me chamou atenção.\n\n{{responsavel}} aqui, da CONSEJ. A gente ajuda negócios digitais a fazer adequação à LGPD de forma enxuta — sem virar projeto infinito, sem relatórios que ninguém lê. O objetivo é que, quando o cliente grande pedir "comprovação de LGPD", vocês tenham a resposta pronta.\n\nRola uma conversa de 20 min nos próximos dias? Sem compromisso.` },
      ],
      trabalhista: [
        { body: `Oi, {{nome}}! Curti bastante o que vocês estão construindo na {{empresa}}.\n\nSou {{responsavel}}, da CONSEJ. Ajudo negócios em crescimento a estruturar a parte trabalhista antes de virar passivo — contratação certa, documentos certos, regras claras. A ideia é que o time comercial e o time operacional cresçam sem o jurídico virar gargalo.\n\nSe fizer sentido, topo 20 min de conversa essa semana. Se não, fica o contato pra quando precisar.` },
      ],
      marca_pi: [
        { body: `Oi, {{nome}}! Fiquei olhando o branding da {{empresa}} — gostei muito.\n\nAqui é o(a) {{responsavel}}, da CONSEJ. Só queria te avisar uma coisa: dei uma olhada no INPI e não achei a marca de vocês registrada (ou achei algo que precisa ser confirmado). Marca sem registro é marca vulnerável — qualquer um pode depositar antes.\n\nSe topar, tenho uns 15 min pra te mostrar a busca e explicar o processo. Sem compromisso.` },
      ],
    },
  },

  /* ────────────────── FOLLOW-UP ────────────────── */
  /* Cadência CONSEJ: Dia 3 (reforço), Dia 5 (educativo), Dia 7 (descontraído), Dia 10 (encerramento) */
  followup: {
    whatsapp: {
      geral: [
        { body: `Oi, {{nome}}! Tô por aqui 👋\n\nSei que semana passou rápido. Só queria reforçar: aquele diagnóstico de 30 min continua em pé, sem custo e sem compromisso. Se fizer sentido, me manda um horário que a gente encaixa.\n\nSe não for o momento, sem problema — é só me avisar que eu paro de encher. 🙂\n\n{{responsavel}} — CONSEJ` },
        { body: `{{nome}}, boa tarde!\n\nNão quero virar spam, prometo. Só queria deixar uma coisa pra você pensar: a maioria dos negócios que a gente atende na CONSEJ chegou depois de um problema — não antes. O diagnóstico gratuito existe justamente pra inverter essa ordem.\n\nSe rolar 30 min na próxima semana, me avisa. Senão, fica o contato. 🤝\n\n{{responsavel}} — CONSEJ` },
        { body: `Oi, {{nome}}! Última tentativa (prometo). 😅\n\nVou parar de te chamar por aqui pra não incomodar. Mas fica o meu contato salvo — no dia que precisar de qualquer coisa jurídica na {{empresa}}, pode me mandar mensagem direto. A conversa fica aberta.\n\nAbraço e sucesso aí!\n\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `Oi, {{nome}}! 👋\n\nRetomando nossa conversa sobre acordo de sócios. Sei que não é o tipo de coisa que parece urgente até o dia que é — e por isso insisto um pouco.\n\nTenho 3 janelas na semana que vem. Topa 20 min só pra eu te mostrar o que costuma entrar no documento e o impacto prático de ter/não ter?\n\n{{responsavel}} — CONSEJ` },
      ],
      contratual: [
        { body: `Oi, {{nome}}! Tudo bem?\n\nUma coisa que esqueci de te mencionar: a gente fez recentemente um diagnóstico numa empresa parecida com a {{empresa}} e descobrimos que 80% dos contratos deles não tinham cláusula de reajuste. Acontece muito.\n\nSe quiser, mando o checklist que a gente usa pra avaliar contrato — é gratuito, te chega por aqui mesmo. É só falar "manda".\n\n{{responsavel}} — CONSEJ` },
      ],
      digital_lgpd: [
        { body: `Oi, {{nome}}!\n\nSó uma curiosidade: a {{empresa}} já recebeu algum pedido de "comprovação de LGPD" de cliente grande? Tá cada vez mais comum, e quem não tem, trava o fechamento.\n\nSe tiver 20 min na próxima semana, te mostro o escopo enxuto que a gente faz pra resolver isso rápido. Se preferir por escrito, te mando um resumo.\n\n{{responsavel}} — CONSEJ` },
      ],
      trabalhista: [
        { body: `Oi, {{nome}}!\n\nSó retomando: aquela conversa sobre estruturar a parte trabalhista da {{empresa}} continua de pé. Especialmente se vocês tão contratando ou pensando em contratar nos próximos meses — é muito mais barato estruturar antes do que corrigir depois.\n\nTopa 20 min essa semana? Se não, me avisa que a gente marca mais pra frente.\n\n{{responsavel}} — CONSEJ` },
      ],
      marca_pi: [
        { body: `Oi, {{nome}}!\n\nSó um lembrete rápido: se você quiser que eu mande a busca que fiz da marca da {{empresa}} no INPI, me avisa — te mando por aqui, sem compromisso. Te ajuda a entender o risco real.\n\nSe topar conversar depois de ver, a gente marca. Senão, a informação já é sua. 🙂\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Re: {{empresa}} + CONSEJ — retomando o contato`,
          body: `Oi, {{nome}},\n\nVoltando aqui pra não deixar a conversa morrer. Sei que sua agenda deve estar cheia, então vou direto:\n\n1. O diagnóstico gratuito (30 min) continua em pé quando fizer sentido pra você.\n2. Se preferir um formato mais leve, posso te mandar por escrito o que costumamos cobrir, e você decide se quer conversar depois.\n3. Se esse não é o momento, me avisa — eu paro de insistir e guardo o contato pra quando for.\n\nQualquer das três opções funciona pra mim. Qual prefere?\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
        {
          subject: `Último toque por aqui — {{empresa}}`,
          body: `Oi, {{nome}},\n\nEsse vai ser meu último e-mail por aqui pra não virar incômodo. Entendo que o momento pode não ser agora, e tudo bem.\n\nDeixo o contato caso mude: é só responder esse e-mail ou me chamar direto. No dia que a {{empresa}} precisar de qualquer coisa jurídica — contrato, societário, marca, LGPD, trabalhista — pode contar comigo.\n\nSucesso aí e seguimos em contato pelo LinkedIn.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      societario: [
        {
          subject: `Re: Acordo de sócios — {{empresa}}`,
          body: `Oi, {{nome}},\n\nRetomando nosso papo sobre acordo de sócios. Pensei em te mandar um material curto (1 página) que resume o que entra no documento e o que cada cláusula resolve na prática — é o que a gente usa no começo de qualquer conversa pra alinhar expectativa.\n\nSe quiser, respondo aqui mesmo com o PDF e você olha no seu tempo. Se depois fizer sentido conversar, a gente marca.\n\nO que acha?\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      contratual: [
        {
          subject: `Checklist rápido de contratos — {{empresa}}`,
          body: `Oi, {{nome}},\n\nQueria te oferecer algo concreto, mesmo que a gente não converse ainda: tenho um checklist de 12 itens que a gente usa pra avaliar contratos de clientes e fornecedores. Te entrega um retrato honesto do risco em 10 minutos de leitura.\n\nSe quiser, respondo aqui com o checklist — é gratuito, sem compromisso. Depois, se fizer sentido, a gente conversa sobre o que cabe arrumar.\n\nMe avisa.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `Oi, {{nome}}! Vi uns posts seus recentes sobre {{empresa}} e fiquei mais curioso(a) sobre o momento de vocês.\n\nSó um toque rápido por aqui: aquela conversa de 30 min continua em pé quando fizer sentido. Sem compromisso e sem roteiro comercial — é literalmente pra entender onde vocês estão e o que vale a pena cuidar agora.\n\nSe esse não é o momento, sem problema. Seguimos conectados por aqui. 🤝\n\n{{responsavel}}` },
      ],
    },
  },

  /* ────────────────── DIAGNÓSTICO ────────────────── */
  diagnostico: {
    whatsapp: {
      geral: [
        { body: `Oi, {{nome}}! Confirmando nosso diagnóstico 👇\n\n📅 [data] às [horário]\n📍 [link]\n⏱ 30–40 min\n\nComo a ideia é ser útil de verdade, seria ótimo se você pudesse pensar nessas 3 perguntas antes:\n\n1. Qual é a dor jurídica que mais tira seu sono hoje?\n2. Qual é o plano da {{empresa}} pros próximos 12 meses?\n3. Se tivesse uma varinha mágica, o que você resolveria primeiro?\n\nNão precisa escrever nada, só vir com isso na cabeça. Até lá! 🤝\n\n{{responsavel}} — CONSEJ` },
        { body: `{{nome}}, diagnóstico confirmado! 🎯\n\n📅 [data] [horário] · [link]\n\nPode deixar comigo — quem faz o roteiro sou eu. Sua parte é só trazer o contexto real da {{empresa}}, nada ensaiado. Quanto mais honesto for o papo, mais útil o diagnóstico fica.\n\nSe surgir algo antes, me chama por aqui.\n\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `Oi, {{nome}}! Diagnóstico societário confirmado 🤝\n\n📅 [data] · [link]\n\nPra gente aproveitar o tempo, se tiver fácil, traga:\n\n• Contrato social atual (pode ser foto/pdf)\n• Quem são os sócios e % de cada um\n• Se já rolou alguma conversa sobre saída/entrada de sócio\n\nSe não tiver tudo, zero problema — a gente vai descobrindo junto. Até lá!\n\n{{responsavel}} — CONSEJ` },
      ],
      contratual: [
        { body: `Oi, {{nome}}! Confirmando o diagnóstico de contratos 📝\n\n📅 [data] · [link]\n\nSe der, separa 1 ou 2 contratos reais da {{empresa}} pra gente olhar junto (pode ser o de cliente ou fornecedor). Ver contrato de verdade vale por 10 reuniões teóricas.\n\nPrometo sigilo total — é só pra eu te mostrar riscos e oportunidades concretas. Até breve!\n\n{{responsavel}} — CONSEJ` },
      ],
      digital_lgpd: [
        { body: `Oi, {{nome}}! Diagnóstico LGPD confirmado 🔐\n\n📅 [data] · [link]\n\nPra ser útil de verdade, pensa nessas 3:\n\n1. Que dado pessoal a {{empresa}} coleta hoje? (cliente, funcionário, lead)\n2. Onde esse dado fica? (planilha, CRM, e-mail)\n3. Já recebeu pedido de "comprovação de LGPD" de algum cliente?\n\nCom isso, consigo te devolver um plano de ação realista.\n\n{{responsavel}} — CONSEJ` },
      ],
      trabalhista: [
        { body: `Oi, {{nome}}! Diagnóstico trabalhista confirmado 👥\n\n📅 [data] · [link]\n\nSe possível, traz na cabeça:\n\n• Quantas pessoas na {{empresa}} hoje (CLT, PJ, autônomo, estagiário)\n• Como são contratadas (tem contrato formal? modelo padrão?)\n• Alguma reclamação trabalhista em andamento ou passada\n\nTudo 100% sigiloso, claro. Até lá!\n\n{{responsavel}} — CONSEJ` },
      ],
      marca_pi: [
        { body: `Oi, {{nome}}! Diagnóstico de marca confirmado ™️\n\n📅 [data] · [link]\n\nJá vou chegar com a busca de anterioridade da marca da {{empresa}} feita — você vai ver na tela comigo o que existe registrado, em nome de quem, e qual o risco real.\n\nSe tiver outras marcas/logos/produtos que queira analisar junto, me manda antes por aqui.\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Diagnóstico confirmado — {{empresa}} + CONSEJ`,
          body: `Oi, {{nome}},\n\nConfirmado nosso diagnóstico:\n\n📅 Data: [data]\n🕐 Horário: [horário]\n📍 Link: [link]\n⏱ Duração: 30–40 min\n\nO formato é bem direto: vou fazer perguntas pra entender o momento real da {{empresa}} e, ao final, te entrego um mini-mapa com (1) o que cuidar agora, (2) o que pode esperar, e (3) o custo aproximado de cada frente. Sem venda, sem pressão.\n\nSe puder, pensa antes nessas três coisas:\n\n1. O que hoje te dá insegurança no jurídico?\n2. Qual é o plano da {{empresa}} pros próximos 12 meses?\n3. Algum problema concreto (atrasado, perdido, em aberto) que você gostaria de destravar?\n\nNão precisa responder — é só pra a gente ir direto ao ponto na conversa.\n\nAté breve!\n\n{{responsavel}}\nCONSEJ`,
        },
      ],
      societario: [
        {
          subject: `Diagnóstico societário — {{empresa}} confirmado`,
          body: `Oi, {{nome}},\n\nConfirmado nosso diagnóstico societário:\n\n📅 [data] às [horário] · [link]\n\nPra aproveitar bem os 40 min, se tiver acesso fácil, traga:\n\n• Contrato social atual (pode ser foto/pdf do documento)\n• Lista dos sócios com % de cada um\n• Se já existiu conversa sobre saída, entrada ou morte de sócio\n• Se algum sócio tem papel muito diferente dos outros (operacional vs. investidor, por exemplo)\n\nNada disso é obrigatório — a gente faz o diagnóstico mesmo sem os documentos, mas com eles o valor prático triplica.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `{{nome}}, tá tudo confirmado pro nosso diagnóstico 🎯\n\n📅 [data] · [link]\n\nComo te falei, o formato é direto e prático — a ideia é sair com clareza do que vale a pena priorizar na {{empresa}}. Se precisar reagendar, é só me avisar por aqui mesmo.\n\nAté breve!\n{{responsavel}}` },
      ],
    },
  },

  /* ────────────────── PROPOSTA ────────────────── */
  proposta: {
    whatsapp: {
      geral: [
        { body: `{{nome}}, proposta na sua caixa! 📄\n\nMontei com base exatamente no que a gente conversou — nada de "pacote padrão", é o escopo que faz sentido pra {{empresa}} agora. No próprio documento tem tudo: entregáveis, prazo, investimento e forma de pagamento.\n\nLê com calma, anota as dúvidas e me manda por aqui mesmo — ou, se preferir, a gente faz 15 min de call rápida pra eu passar ponto a ponto. O que funciona melhor pra você?\n\n{{responsavel}} — CONSEJ` },
        { body: `Oi, {{nome}}! Proposta enviada ✅\n\nResumo do que tem lá dentro:\n• Escopo do que vamos entregar\n• Prazo realista (sem promessa de milagre)\n• Investimento e forma de pagamento\n• O que NÃO tá incluso (pra zero surpresa depois)\n\nQualquer coisa que não tá clara, prefiro que você me pergunte antes de decidir. É sério — nada de "assina primeiro, pergunta depois".\n\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `{{nome}}, proposta do acordo de sócios enviada 🤝\n\nMontei um escopo que cobre saída, entrada, morte, incapacidade, deadlock e regras de distribuição — exatamente o que a gente viu no diagnóstico que tava em aberto na {{empresa}}.\n\nPrazo de entrega e valor tão tudo na proposta. Qualquer dúvida antes de fechar, me chama. Prefiro responder 10 perguntas agora do que descobrir depois que algo ficou mal entendido.\n\n{{responsavel}} — CONSEJ` },
      ],
      contratual: [
        { body: `{{nome}}, proposta de contratos enviada 📝\n\nO que vai: revisão dos contratos atuais + criação dos modelos-padrão da {{empresa}} + playbook de uso interno (pra sua equipe comercial usar sem me chamar toda vez).\n\nLê com calma e me avisa se algo ficou confuso ou se quer ajustar escopo. Sem pressão — prefiro que a gente feche quando você tiver certeza.\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Proposta CONSEJ — {{empresa}}`,
          body: `Oi, {{nome}},\n\nProposta em anexo (e copiada aqui embaixo pra facilitar).\n\nEscrevi ela do jeito que eu gostaria de receber como cliente: objetiva, honesta sobre o que entra e o que não entra, com prazo realista e forma de pagamento explícita. Sem linguagem rebuscada, sem "sob consulta".\n\nO que eu te peço é:\n\n1. Lê com calma (não precisa ser hoje)\n2. Anota qualquer dúvida, por menor que seja\n3. Me manda as dúvidas antes de decidir — por e-mail, WhatsApp, como preferir\n\nSe quiser, a gente faz 15 min de call pra eu passar o documento ponto a ponto com você. Só me dizer.\n\nFico no aguardo!\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
      societario: [
        {
          subject: `Proposta — Acordo de sócios da {{empresa}}`,
          body: `Oi, {{nome}},\n\nProposta em anexo. O escopo foi desenhado exatamente no que a gente identificou no diagnóstico:\n\n• Regras claras de saída voluntária e involuntária\n• Tratamento de entrada de novo sócio\n• Morte, incapacidade e sucessão\n• Deadlock (como resolver empate em decisão)\n• Distribuição de resultado e tomada de decisão estratégica\n\nO prazo é {[prazo]} e o investimento é {[valor]}, com {[forma de pagamento]}. Não tem "fee extra" nem custo escondido — o que tá ali é o total.\n\nSe algo não fez sentido, me avisa. Prefiro ajustar o que for preciso antes de você assinar.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `{{nome}}, proposta enviada por e-mail 📄\n\nMontei algo enxuto e honesto — se você ler e achar que tá faltando algo, ou que tem item que não faz sentido, me fala sem cerimônia. Proposta é ponto de partida de conversa, não documento fechado.\n\nFico no aguardo!\n\n{{responsavel}} — CONSEJ` },
      ],
    },
  },

  /* ────────────────── NEGOCIAÇÃO ────────────────── */
  negociacao: {
    whatsapp: {
      geral: [
        { body: `Oi, {{nome}}! Tô retomando aqui 👋\n\nQueria saber se a proposta fez sentido e, principalmente, se tem algo travando. Pode ser escopo, prazo, valor, forma de pagamento, qualquer coisa. Prefiro que você me fale o que tá na sua cabeça do que ficar no "vou pensar" sem data.\n\nSe preferir 10 min de call pra bater bola, me manda um horário. Se preferir resolver por aqui, também tá ótimo.\n\n{{responsavel}} — CONSEJ` },
        { body: `{{nome}}, só um toque 🤝\n\nNegociação é conversa de verdade — se alguma coisa tá pesando, me conta direto. A gente já ajustou escopo, prazo e forma de pagamento em outras propostas, e quase sempre dá pra chegar num ponto bom pros dois lados.\n\nMe fala o que tá na cabeça que a gente resolve.\n\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `Oi, {{nome}}! Tudo certo?\n\nSobre o acordo de sócios: entendo que é uma decisão importante porque envolve todos os sócios, não só você. Se ajudar, posso preparar um resumo de 1 página da proposta pra você apresentar na conversa interna — fica mais fácil explicar pros outros sócios.\n\nMe avisa se faz sentido. Qualquer coisa, tô por aqui.\n\n{{responsavel}} — CONSEJ` },
      ],
      contratual: [
        { body: `Oi, {{nome}}! Só retomando 👋\n\nNormalmente, quando uma proposta de contratos trava, é por causa de um de três motivos: (1) escopo parece grande demais, (2) prazo não encaixa no momento da empresa, (3) forma de pagamento. Me diz qual dos três (ou se é outro) que a gente conversa.\n\nSem pressão, prometo.\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Re: Proposta CONSEJ — {{empresa}}`,
          body: `Oi, {{nome}},\n\nRetomando pra saber como tá o processo aí do lado. Quero ser direto contigo: se tem algo na proposta travando — escopo, prazo, valor, forma de pagamento, timing — prefiro muito mais que você me fale isso agora do que a gente ficar num "vou pensar" sem fim.\n\nDa minha parte, eu consigo flexibilizar várias coisas: ajustar escopo, rever prazo, parcelar diferente, até começar por um escopo menor e evoluir. O que eu não consigo é adivinhar o que tá pegando — então me conta.\n\nSe preferir conversar em 15 min de call, me manda um horário. Se preferir resolver por e-mail, também tá ótimo.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `{{nome}}, só um toque rápido por aqui.\n\nSobre a proposta — se tem algo travando, me fala sem cerimônia. Prefiro ajustar e fechar do que ficar no limbo. Escopo, prazo, valor, momento, qualquer coisa. A gente resolve.\n\nAbraço!\n{{responsavel}}` },
      ],
    },
  },

  /* ────────────────── PÓS-FECHAMENTO ────────────────── */
  pos_fechamento: {
    whatsapp: {
      geral: [
        { body: `{{nome}}, fechou! 🤝\n\nMuito feliz com essa parceria. Agora começa a parte boa: o trabalho de verdade.\n\nDos próximos passos:\n\n1. Vou te mandar um e-mail com o checklist de documentos e acessos que preciso\n2. Marco uma call curta de kick-off (15 min) pra alinhar ritmo e canais\n3. Começamos a entregar conforme o cronograma da proposta\n\nQualquer coisa que surgir nesse caminho, fala comigo direto. O canal principal fica sendo aqui mesmo.\n\nBora! 🚀\n\n{{responsavel}} — CONSEJ` },
        { body: `Oi, {{nome}}! 🎉\n\nContrato assinado, oficialmente parceiros da {{empresa}}. Obrigado pela confiança — isso não é leve pra gente.\n\nJá tô montando o onboarding. Em 24h você recebe um e-mail com tudo organizado: cronograma, documentos que preciso, canais de comunicação, quem é quem no time.\n\nQualquer coisa antes, me chama.\n\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `{{nome}}, fechamos o acordo de sócios! 🤝\n\nOs próximos passos:\n\n1. Vou agendar uma call com você e os outros sócios pra alinhar expectativas (é importante que todos estejam na mesma página desde o início)\n2. Após essa call, mando a minuta inicial em 5 dias úteis\n3. A gente itera até ficar redondo pra todos\n4. Assinatura final com reconhecimento de firma\n\nQualquer dúvida no caminho, é só me chamar.\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Bem-vindo(a) à CONSEJ, {{nome}} 🤝`,
          body: `Oi, {{nome}},\n\nContrato assinado. Obrigado pela confiança — e prometo que você não vai se arrepender.\n\nDos próximos passos (em ordem):\n\n1. Kick-off (15 min, essa semana): alinhamento de canais, ritmo e pessoas envolvidas\n2. Documentos e acessos: vou te mandar um checklist curto do que preciso pra começar\n3. Execução: conforme cronograma da proposta, com check-ins regulares\n\nCanais de comunicação:\n• WhatsApp: pra coisas rápidas e do dia a dia\n• E-mail: pra tudo que é documento, aprovação formal ou precisa ficar registrado\n• Reunião mensal (opcional): se fizer sentido, a gente marca uma recorrente\n\nNos próximos dias eu te chamo pra marcar o kick-off. Qualquer coisa urgente antes disso, é só me chamar direto.\n\nBora começar!\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `{{nome}}, fechamos! 🤝\n\nObrigado pela confiança — e bora fazer um trabalho do qual a gente se orgulhe. Vou te chamar nos próximos dias pra alinhar o kick-off.\n\nAté já!\n{{responsavel}} — CONSEJ` },
      ],
    },
  },

  /* ────────────────── REATIVAÇÃO ────────────────── */
  reativacao: {
    whatsapp: {
      geral: [
        { body: `Oi, {{nome}}! Quanto tempo 👋\n\n{{responsavel}} aqui, da CONSEJ. A gente conversou há um tempo sobre o jurídico da {{empresa}} e a coisa acabou não engatando na época — talvez o momento não fosse agora. Tudo bem, faz parte.\n\nSó queria voltar pra saber: como tá a {{empresa}} hoje? Surgiu alguma demanda nova, algum problema em aberto, algo que vale uma conversa?\n\nSe sim, me fala. Se não, fica registrado o "oi" e seguimos conectados.\n\n{{responsavel}} — CONSEJ` },
        { body: `{{nome}}, tudo bem?\n\n{{responsavel}} aqui, da CONSEJ. Tô passando só pra lembrar que o diagnóstico gratuito continua valendo — especialmente agora, que a {{empresa}} provavelmente tá em um momento diferente do que estava na última vez que a gente conversou.\n\nSe fizer sentido um papo rápido, me manda um horário. Se não, guarda o contato pra quando precisar.\n\nAbraço!\n{{responsavel}} — CONSEJ` },
      ],
      societario: [
        { body: `Oi, {{nome}}! 👋\n\nLembra da nossa conversa sobre acordo de sócios? Tô dando um toque porque, na maioria das vezes, esse tema fica em "a gente resolve depois" — até a hora que vira urgência.\n\nSe a {{empresa}} tá chegando nessa hora, me avisa. Se continua em "depois", tudo bem também — só quis deixar registrado que tô por aqui quando precisar.\n\n{{responsavel}} — CONSEJ` },
      ],
    },
    email: {
      geral: [
        {
          subject: `Quanto tempo, {{nome}} — como tá a {{empresa}}?`,
          body: `Oi, {{nome}},\n\nFaz um tempo que a gente não fala. Sou {{responsavel}}, da CONSEJ — conversamos em algum momento sobre o jurídico da {{empresa}} e acabamos não indo adiante, o que é normal: nem todo momento é o momento.\n\nTô retomando o contato só pra saber como vocês estão hoje. Muita coisa muda em poucos meses — time cresce, contratos aparecem, clientes viram problema, etc. Se algo dessa lista (ou de qualquer outra) virou dor real, talvez faça sentido a gente conversar agora.\n\nSe sim, me avisa e marco 30 min de diagnóstico gratuito. Se não, sem problema — só queria deixar o canal aberto.\n\nAbraço,\n{{responsavel}}\nCONSEJ`,
        },
      ],
    },
    linkedin: {
      geral: [
        { body: `Oi, {{nome}}! Quanto tempo 👋\n\n{{responsavel}}, da CONSEJ. Tô passando só pra retomar o contato e saber como tá a {{empresa}} hoje. Se surgiu alguma demanda jurídica (ou mesmo se você só quer bater um papo sobre o momento), topo conversar.\n\nFica o contato aberto!\n{{responsavel}}` },
      ],
    },
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveTemplate(
  stage: Stage,
  channel: Channel,
  sector: Sector,
  varIdx: number,
  overrides: MensagensConfig['overrides']
): MsgTemplate | undefined {
  const key = `${stage}__${channel}__${sector}__${varIdx}`
  if (overrides[key]) return overrides[key]
  const byChannel = TEMPLATES[stage]?.[channel] ?? {}
  return (byChannel[sector] ?? byChannel['geral'] ?? [])[varIdx]
}

function getMessages(
  stage: Stage,
  sector: Sector,
  channel: Channel,
  ctx: Record<string, string>,
  mensagensConfig: MensagensConfig
): { subject?: string; body: string }[] {
  const byChannel = TEMPLATES[stage]?.[channel] ?? {}
  const staticTemplates = byChannel[sector] ?? byChannel['geral'] ?? []
  const count = staticTemplates.length || 1
  return Array.from({ length: count }, (_, i) => {
    const tpl = resolveTemplate(stage, channel, sector, i, mensagensConfig.overrides)
      ?? staticTemplates[i]
      ?? { body: '' }
    const rawBody = fillBrackets(tpl.body, mensagensConfig.defaults)
    const rawSubject = tpl.subject ? fillBrackets(tpl.subject, mensagensConfig.defaults) : undefined
    return {
      subject: rawSubject ? fill(rawSubject, ctx) : undefined,
      body: fill(rawBody, ctx),
    }
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

const PREFS_KEY = 'consej_mensagens_prefs'
const VALID_SECTORS = new Set<Sector>(['geral', 'societario', 'contratual', 'digital_lgpd', 'trabalhista', 'marca_pi'])
function loadPrefs(): Partial<{ stage: Stage; sector: Sector; channel: Channel; responsavel: string }> {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    // Migra/ignora setores antigos (empresarial, familia, imobiliario, tributario, consumidor, previdenciario)
    if (raw.sector && !VALID_SECTORS.has(raw.sector)) delete raw.sector
    return raw
  } catch { return {} }
}

// Maps lead pipeline status → mensagens Stage
const STATUS_TO_STAGE: Record<string, Stage> = {
  classificacao:             'primeiro_contato',
  levantamento_oportunidade: 'diagnostico',
  educar_lead:               'followup',
  proposta_comercial:        'proposta',
  negociacao:                'negociacao',
  ganho_assessoria:          'pos_fechamento',
  ganho_consultoria:         'pos_fechamento',
  stand_by:                  'reativacao',
  perdido:                   'reativacao',
  cancelado:                 'reativacao',
}

// Builds a wa.me deep link with the message pre-filled
function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('55') ? digits : '55' + digits
  return 'https://wa.me/' + intl + '?text=' + encodeURIComponent(message)
}

export function MensagensPage() {
  const [searchParams] = useSearchParams()
  const prefs = loadPrefs()

  const [stage, setStage]           = useState<Stage>((searchParams.get('stage') as Stage) || prefs.stage || 'primeiro_contato')
  const [sector, setSector]         = useState<Sector>(prefs.sector || 'geral')
  const [channel, setChannel]       = useState<Channel>(prefs.channel || 'whatsapp')
  const [nome, setNome]             = useState(searchParams.get('nome') ?? '')
  const [empresa, setEmpresa]       = useState(searchParams.get('empresa') ?? '')
  const [telefone, setTelefone]     = useState(searchParams.get('telefone') ?? '')
  const [responsavel, setResponsavel] = useState(prefs.responsavel ?? '')
  const [varIdx, setVarIdx]         = useState(0)
  const [copied, setCopied]         = useState(false)
  const [waLinkCopied, setWaLinkCopied] = useState(false)

  // Variáveis extras (preenchem {{dor}}, {{gancho}}, {{tempo}}, {{cta_custom}})
  const [varDor, setVarDor]         = useState('')
  const [varGancho, setVarGancho]   = useState('')
  const [varTempo, setVarTempo]     = useState('')

  // Editor nativo
  const [editMode, setEditMode]           = useState(false)
  const [workingBody, setWorkingBody]     = useState('')
  const [workingSubject, setWorkingSubject] = useState('')
  const [composerOpen, setComposerOpen]   = useState(true)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Composer slot-based: uma seleção por categoria. Trocar um bloco da mesma
  // categoria substitui o anterior, evitando repetição.
  const [slots, setSlots] = useState<Record<string, string | null>>({})

  // Lead picker state
  const [leadSearch, setLeadSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const { data: leads = [] }  = useLeads()
  const { data: meuPerfil }   = useMeuPerfil()
  const { data: config }      = useConfiguracoes()
  const mensagensConfig       = config?.mensagens ?? DEFAULT_MENSAGENS_CONFIG
  const activeSectors         = SECTORS.filter(s => mensagensConfig.setores_ativos.includes(s.id))

  // Persist preferences whenever they change
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ stage, sector, channel, responsavel }))
  }, [stage, sector, channel, responsavel])

  // Auto-fill responsavel from logged-in profile (only if not already set)
  useEffect(() => {
    if (meuPerfil?.nome && !prefs.responsavel) {
      setResponsavel(meuPerfil.nome)
    }
  }, [meuPerfil]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close picker when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // If navigated from lead card, scroll to message area
  useEffect(() => {
    if (searchParams.get('nome')) {
      setTimeout(() => document.getElementById('msg-output')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select lead when navigated with leadId param
  useEffect(() => {
    const lid = searchParams.get('leadId')
    if (lid && !selectedLeadId && leads.length > 0) {
      const lead = leads.find(l => l.id === lid)
      if (lead) selectLead(lead)
    }
  }, [searchParams, leads]) // eslint-disable-line react-hooks/exhaustive-deps

  // Select a lead and populate all fields
  function selectLead(lead: typeof leads[0]) {
    setSelectedLeadId(lead.id)
    setNome(lead.nome)
    setEmpresa(lead.empresa ?? '')
    setTelefone(lead.telefone ?? '')
    const mappedStage = STATUS_TO_STAGE[lead.status]
    if (mappedStage) { setStage(mappedStage); setVarIdx(0) }
    setLeadSearch(lead.nome)
    setPickerOpen(false)
  }

  function clearLead() {
    setSelectedLeadId(null)
    setNome('')
    setEmpresa('')
    setTelefone('')
    setLeadSearch('')
  }

  const ctx = useMemo(
    () => ({
      nome: nome || 'Nome',
      empresa: empresa || 'Empresa',
      responsavel: responsavel || 'Responsável',
      dor: varDor || '[dor específica]',
      gancho: varGancho || '[gancho]',
      tempo: varTempo || '20 minutos',
      prazo: config?.mensagens?.defaults?.prazo_entrega || '2–3 semanas',
    }),
    [nome, empresa, responsavel, varDor, varGancho, varTempo, config]
  )

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) return leads.slice(0, 8)
    const q = leadSearch.toLowerCase()
    return leads.filter(l =>
      l.nome.toLowerCase().includes(q) || (l.empresa ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [leads, leadSearch])

  const messages = useMemo(() => getMessages(stage, sector, channel, ctx, mensagensConfig), [stage, sector, channel, ctx, mensagensConfig])
  const currentMsg = messages[varIdx] ?? messages[0]

  // Sincroniza o workingBody/Subject com o template quando o usuário NÃO está editando.
  useEffect(() => {
    if (!editMode) {
      setWorkingBody(currentMsg?.body ?? '')
      setWorkingSubject(currentMsg?.subject ?? '')
    }
  }, [currentMsg, editMode])

  // Se o corpo editado é idêntico ao template, considera "não editado"
  const isEdited = editMode && (workingBody !== (currentMsg?.body ?? '') || workingSubject !== (currentMsg?.subject ?? ''))

  const stageInfo = STAGES.find(s => s.id === stage)!
  const sectorInfo = SECTORS.find(s => s.id === sector)!

  function nextVariation() {
    setVarIdx(i => (i + 1) % Math.max(messages.length, 1))
  }

  function handleStageChange(s: Stage) {
    setStage(s)
    setVarIdx(0)
  }
  function handleSectorChange(s: Sector) {
    setSector(s)
    setVarIdx(0)
  }
  function handleChannelChange(c: Channel) {
    setChannel(c)
    setVarIdx(0)
  }

  // Conteúdo efetivo a ser enviado/copiado (edição tem precedência sobre template).
  const effectiveBody = editMode ? workingBody : (currentMsg?.body ?? '')
  const effectiveSubject = editMode ? workingSubject : (currentMsg?.subject ?? '')

  async function copyMessage() {
    const text = channel === 'email' && effectiveSubject
      ? `Assunto: ${effectiveSubject}\n\n${effectiveBody}`
      : effectiveBody
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Copia link wa.me com a mensagem composta (WA-03)
  async function copyWaLink() {
    try {
      const url = buildWhatsAppUrl(telefone, effectiveBody)
      await navigator.clipboard.writeText(url)
      setWaLinkCopied(true)
      setTimeout(() => setWaLinkCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar o link. Copie manualmente o endereço.')
    }
  }

  // ── Composer slot-based ──────────────────────────────────────────────────
  // Toggle selection: se o mesmo bloco já está no slot, desmarca.
  // Se outro bloco da mesma categoria está selecionado, substitui.
  function toggleSlot(categoria: BlocoCategoria, blocoId: string) {
    setSlots(prev => ({
      ...prev,
      [categoria]: prev[categoria] === blocoId ? null : blocoId,
    }))
  }

  function clearSlot(categoria: BlocoCategoria) {
    setSlots(prev => ({ ...prev, [categoria]: null }))
  }

  function limparComposer() {
    setSlots({})
  }

  // Conjunto efetivo de blocos (default + custom, com overrides aplicados)
  const blocosEfetivos = useMemo(
    () => getBlocosEfetivos(mensagensConfig.blocos),
    [mensagensConfig.blocos]
  )

  // Estado do modal de editor de bloco
  const [editorBloco, setEditorBloco] = useState<
    | { kind: 'edit'; bloco: Bloco }
    | { kind: 'add'; categoria: BlocoCategoria }
    | null
  >(null)

  // Mensagem composta em tempo real a partir dos slots, na ordem canônica.
  const composedBody = useMemo(
    () => montarMensagem(slots, tpl => fill(tpl, ctx), blocosEfetivos),
    [slots, ctx, blocosEfetivos]
  )

  const slotsPreenchidos = useMemo(
    () => Object.values(slots).filter(Boolean).length,
    [slots]
  )

  // Aplica a mensagem composta no editor (entra em modo editor).
  function aplicarComposerNoEditor() {
    if (!composedBody) return
    setWorkingBody(composedBody)
    setEditMode(true)
    setTimeout(() => {
      bodyRef.current?.focus()
      bodyRef.current?.setSelectionRange(composedBody.length, composedBody.length)
    }, 50)
  }

  // Pré-seleciona slots a partir de um template (inverso do composer).
  // Simplificação: quando o usuário muda stage/sector/channel, zera os slots
  // pra evitar incoerência.
  useEffect(() => {
    setSlots({})
  }, [stage, sector, channel])

  function resetToTemplate() {
    setWorkingBody(currentMsg?.body ?? '')
    setWorkingSubject(currentMsg?.subject ?? '')
  }

  const charCount = effectiveBody.length

  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find(l => l.id === selectedLeadId) ?? null : null),
    [leads, selectedLeadId]
  )

  // Modal de confirmação de envio/cópia
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState<'send' | 'copy'>('send')

  function openWhatsAppConfirm() {
    if (!selectedLead) {
      // Sem lead vinculado: segue o comportamento antigo (abre link sem registrar)
      const url = buildWhatsAppUrl(telefone, currentMsg?.body ?? '')
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    setConfirmMode('send')
    setConfirmOpen(true)
  }

  function openCopyConfirm() {
    if (!selectedLead) {
      // Sem lead vinculado: cópia simples, sem registrar
      copyMessage()
      return
    }
    setConfirmMode('copy')
    setConfirmOpen(true)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#0089ac' }}>
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mensagens de Abordagem</h1>
          <p className="text-sm text-muted-foreground">Templates no tom da CONSEJ — empresa júnior de consultoria jurídica. Consultores, não advogados. Adapte sempre com um detalhe real do lead.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">

        {/* ── Config Panel ── */}
        <div className="bg-card border rounded-2xl p-5 space-y-5 shadow-sm">

          {/* Lead picker */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-3">Lead do funil</h2>
            <div ref={pickerRef} className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar lead pelo nome ou empresa…"
                  value={leadSearch}
                  onChange={e => { setLeadSearch(e.target.value); setPickerOpen(true) }}
                  onFocus={() => setPickerOpen(true)}
                  className="form-control pl-8 pr-8 h-9 text-sm w-full"
                />
                {selectedLeadId && (
                  <button
                    onClick={clearLead}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {pickerOpen && filteredLeads.length > 0 && (
                <div
                  className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-xl"
                  style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                >
                  {filteredLeads.map(lead => (
                    <button
                      key={lead.id}
                      onMouseDown={e => { e.preventDefault(); selectLead(lead) }}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-secondary transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>
                      </div>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                        style={{ background: 'var(--alpha-bg-md)', color: 'var(--text-soft-a)' }}
                      >
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Contact info */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-3">Dados do contato</h2>
            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Nome do contato</Label>
                <Input
                  placeholder="Ex: João Silva"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Empresa</Label>
                <Input
                  placeholder="Ex: Tech Solutions Ltda"
                  value={empresa}
                  onChange={e => setEmpresa(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="relative">
                <Label className="text-muted-foreground text-xs mb-1 block">Telefone / WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="(11) 99999-9999"
                    value={telefone}
                    onChange={e => setTelefone(e.target.value)}
                    className="h-9 text-sm pl-8"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Consultor(a) responsável</Label>
                <Input
                  placeholder="Ex: Ana Carolina"
                  value={responsavel}
                  onChange={e => setResponsavel(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Variáveis extras */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-2">Variáveis extras</h2>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              Preencha e use nos blocos/templates como <code className="text-[10px] px-1 py-0.5 rounded bg-[var(--alpha-bg-sm)]">{'{{dor}}'}</code>, <code className="text-[10px] px-1 py-0.5 rounded bg-[var(--alpha-bg-sm)]">{'{{gancho}}'}</code>, <code className="text-[10px] px-1 py-0.5 rounded bg-[var(--alpha-bg-sm)]">{'{{tempo}}'}</code>.
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Dor específica do lead</Label>
                <Input
                  placeholder="Ex: processo trabalhista em andamento"
                  value={varDor}
                  onChange={e => setVarDor(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Gancho personalizado</Label>
                <Input
                  placeholder="Ex: vi que vocês abriram 3 lojas esse ano"
                  value={varGancho}
                  onChange={e => setVarGancho(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs mb-1 block">Tempo da reunião</Label>
                <div className="grid grid-cols-4 gap-1">
                  {['15 min', '20 min', '30 min', '45 min'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVarTempo(t)}
                      className={cn(
                        'h-8 rounded-md border text-xs font-medium transition-all',
                        varTempo === t
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                          : 'text-muted-foreground hover:bg-background'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Channel */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-3">Canal</h2>
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelChange(ch.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-xs font-medium transition-all',
                    channel === ch.id
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'text-muted-foreground hover:border hover:bg-background'
                  )}
                >
                  <ch.icon className="w-4 h-4" />
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Stage */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-3">Etapa do funil</h2>
            <div className="space-y-1.5">
              {STAGES.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleStageChange(s.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-sm font-medium transition-all"
                  style={stage === s.id
                    ? { background: s.bgVal, color: s.colorVal, borderColor: s.colorVal + '80' }
                    : { borderColor: 'transparent', color: 'var(--text-soft-a)' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Sector */}
          <div>
            <h2 className="text-xs font-semibold text-fg4 uppercase tracking-wider mb-3">Setor / Área jurídica</h2>
            <div className="grid grid-cols-2 gap-1.5">
              {activeSectors.map(sec => (
                <button
                  key={sec.id}
                  onClick={() => handleSectorChange(sec.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all text-left',
                    sector === sec.id
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                      : 'text-muted-foreground hover:border hover:bg-background'
                  )}
                >
                  <span>{sec.emoji}</span>
                  <span className="truncate">{sec.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Message Output ── */}
        <div id="msg-output" className="space-y-4">

          {/* Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold border" style={{ background: stageInfo.bgVal, color: stageInfo.colorVal, borderColor: stageInfo.colorVal + '80' }}>
              {stageInfo.label}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-background text-muted-foreground" style={{ border: '1px solid var(--alpha-border-md)' }}>
              {sectorInfo.emoji} {sectorInfo.label}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-background text-muted-foreground capitalize">
              {channel === 'whatsapp' ? '📱 WhatsApp' : channel === 'email' ? '📧 E-mail' : '💼 LinkedIn'}
            </span>
            {messages.length > 1 && (
              <span className="px-3 py-1 rounded-full text-xs font-medium border bg-background text-fg4">
                Variação {varIdx + 1} de {messages.length}
              </span>
            )}
          </div>

          {/* Message card */}
          <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">

            {/* Toolbar: edit toggle + reset */}
            <div className="px-5 py-2 border-b flex items-center justify-between gap-2" style={{ borderColor: 'var(--alpha-border)', background: editMode ? 'rgba(0,137,172,0.05)' : 'var(--alpha-bg-xs)' }}>
              <div className="flex items-center gap-2 text-xs">
                {editMode
                  ? <span className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--cyan-hi)' }}>
                      <Pencil className="w-3 h-3" /> Modo editor
                      {isEdited && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>editado</span>}
                    </span>
                  : <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Eye className="w-3 h-3" /> Pré-visualização do template
                    </span>
                }
              </div>
              <div className="flex items-center gap-1">
                {editMode && isEdited && (
                  <button
                    type="button"
                    onClick={resetToTemplate}
                    title="Restaurar o template original"
                    className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-muted-foreground hover:text-fg2 hover:bg-[var(--alpha-bg-sm)] transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditMode(e => !e)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium transition-colors"
                  style={editMode
                    ? { background: 'var(--alpha-bg-sm)', color: 'var(--text-soft-a)' }
                    : { background: 'rgba(0,137,172,0.12)', color: 'var(--cyan-hi)' }}
                >
                  {editMode ? <><Eye className="w-3 h-3" /> Sair do editor</> : <><Pencil className="w-3 h-3" /> Editar mensagem</>}
                </button>
              </div>
            </div>

            {/* Email subject */}
            {channel === 'email' && (
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--alpha-border)', background: 'var(--alpha-bg-xs)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-fg4 uppercase tracking-wider shrink-0">Assunto:</span>
                  {editMode
                    ? <Input
                        value={workingSubject}
                        onChange={e => setWorkingSubject(e.target.value)}
                        placeholder="Assunto do e-mail"
                        className="h-7 text-sm border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    : effectiveSubject
                      ? <span className="text-sm font-medium text-foreground">{effectiveSubject}</span>
                      : <span className="text-sm italic text-muted-foreground">(sem assunto)</span>
                  }
                </div>
              </div>
            )}

            {/* Body */}
            <div className="p-5">
              {editMode ? (
                <Textarea
                  ref={bodyRef}
                  value={workingBody}
                  onChange={e => setWorkingBody(e.target.value)}
                  placeholder="Escreva ou edite a mensagem aqui. Use os blocos abaixo pra inserir trechos prontos, ou digite livremente."
                  className="min-h-[200px] text-sm leading-relaxed font-sans resize-y border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 shadow-none bg-transparent"
                  style={{ lineHeight: '1.6' }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-fg2 font-sans leading-relaxed">
                  {effectiveBody || '—'}
                </pre>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-background flex items-center justify-between">
              <div className="flex items-center gap-3">
                {channel === 'whatsapp' && (
                  <span className={cn(
                    'text-xs',
                    charCount > 1000 ? 'text-orange-500' : charCount > 600 ? 'text-amber-500' : 'text-fg4'
                  )}>
                    {charCount} caracteres
                    {charCount > 1000 && ' — considere encurtar'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {messages.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextVariation}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Outra versão
                  </Button>
                )}
                {/* Copiar link wa.me (WA-03) — guard idêntico ao botão Abrir no WhatsApp */}
                {channel === 'whatsapp' && telefone && (
                  <button
                    type="button"
                    onClick={copyWaLink}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border transition-colors"
                    style={waLinkCopied
                      ? { background: 'rgba(37,211,102,0.15)', color: '#4ade80', borderColor: 'rgba(37,211,102,0.40)' }
                      : { background: 'var(--alpha-bg-xs)', color: 'var(--text-soft-a)', borderColor: 'var(--alpha-border)' }
                    }
                    title="Copiar link wa.me para usar em outro dispositivo"
                  >
                    {waLinkCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {waLinkCopied ? 'Link copiado!' : 'Copiar link'}
                  </button>
                )}
                {channel === 'whatsapp' && telefone && (
                  <button
                    type="button"
                    onClick={openWhatsAppConfirm}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: '#25D366' }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    {selectedLead ? 'Abrir no WhatsApp + registrar' : 'Abrir no WhatsApp'}
                  </button>
                )}
                <Button
                  size="sm"
                  onClick={openCopyConfirm}
                  className="h-8 gap-1.5 text-xs"
                  style={copied ? { backgroundColor: '#16a34a' } : { backgroundColor: '#0089ac' }}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado!' : selectedLead ? 'Copiar + registrar' : 'Copiar mensagem'}
                </Button>
              </div>
            </div>
          </div>

          {/* Composer slot-based — uma seleção por categoria */}
          <div className="rounded-2xl border overflow-hidden bg-card" style={{ borderColor: 'var(--alpha-border)' }}>
            <button
              type="button"
              onClick={() => setComposerOpen(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between gap-2 hover:bg-[var(--alpha-bg-xs)] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--cyan-hi)' }} />
                <span className="text-sm font-semibold text-foreground">Compositor por blocos</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">— escolha um bloco por categoria, a mensagem se monta sozinha</span>
                {slotsPreenchidos > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(0,137,172,0.15)', color: 'var(--cyan-hi)' }}
                  >
                    {slotsPreenchidos}/{BLOCO_CATEGORIAS.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {slotsPreenchidos > 0 && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); limparComposer() }}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded text-[11px] font-medium text-muted-foreground hover:text-fg2 hover:bg-[var(--alpha-bg-sm)] transition-colors"
                    title="Limpar todas as seleções"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Limpar
                  </button>
                )}
                {composerOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>

            {composerOpen && (
              <div className="border-t divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
                {BLOCO_CATEGORIAS.map(categoria => {
                  const disponiveis = blocosEfetivosPorCategoria(categoria, sector, mensagensConfig.blocos)
                  const selecionadoId = slots[categoria] ?? null
                  const selecionado = selecionadoId ? blocosEfetivos.find(b => b.id === selecionadoId) : null
                  const overrides = mensagensConfig.blocos?.overrides ?? {}

                  return (
                    <div key={categoria} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-32 pt-1">
                          <div className="text-xs font-semibold text-fg2">{categoria}</div>
                          {selecionado && (
                            <button
                              type="button"
                              onClick={() => clearSlot(categoria)}
                              className="text-[10px] text-muted-foreground hover:text-fg2 inline-flex items-center gap-0.5 mt-0.5"
                              title="Remover desta categoria"
                            >
                              <X className="w-2.5 h-2.5" /> remover
                            </button>
                          )}
                        </div>
                        <div className="flex-1 flex flex-wrap gap-1.5">
                          {disponiveis.map(b => {
                            const ativo = selecionadoId === b.id
                            const base = isBlocoBase(b.id)
                            const editado = base && !!overrides[b.id]
                            return (
                              <div key={b.id} className="group relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() => toggleSlot(categoria, b.id)}
                                  title={fill(b.texto, ctx)}
                                  className={cn(
                                    'text-left pl-2.5 pr-7 py-1.5 rounded-md border text-[11px] font-medium transition-all max-w-full',
                                  )}
                                  style={ativo
                                    ? { background: 'rgba(0,137,172,0.15)', borderColor: 'rgba(0,137,172,0.55)', color: 'var(--cyan-hi)' }
                                    : { background: 'var(--alpha-bg-xs)', borderColor: 'var(--alpha-border)', color: 'var(--text-soft-a)' }
                                  }
                                >
                                  {ativo && <Check className="w-3 h-3 inline mr-1 -mt-0.5" />}
                                  {b.titulo}
                                  {!base && (
                                    <span className="ml-1 text-[9px] uppercase tracking-wider opacity-60">custom</span>
                                  )}
                                  {editado && (
                                    <span className="ml-1 text-[9px] uppercase tracking-wider opacity-60">edit</span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); setEditorBloco({ kind: 'edit', bloco: b }) }}
                                  title="Editar bloco"
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--alpha-bg-md)] transition-opacity"
                                >
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </div>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() => setEditorBloco({ kind: 'add', categoria })}
                            title={`Adicionar novo bloco em ${categoria}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-medium border-dashed text-muted-foreground hover:text-fg2 hover:border-[rgba(0,137,172,0.55)] hover:bg-[var(--alpha-bg-xs)] transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            Adicionar
                          </button>
                        </div>
                      </div>
                      {selecionado && (
                        <div
                          className="mt-2 ml-32 pl-2 p-2 rounded text-[11px] text-muted-foreground leading-snug whitespace-pre-wrap"
                          style={{ background: 'var(--alpha-bg-xs)', borderLeft: '2px solid rgba(0,137,172,0.40)' }}
                        >
                          {fill(selecionado.texto, ctx)}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Preview composta + apply */}
                {slotsPreenchidos > 0 ? (
                  <div className="p-4 bg-[var(--alpha-bg-xs)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cyan-hi)' }}>
                        Mensagem composta
                      </span>
                      <Button
                        size="sm"
                        onClick={aplicarComposerNoEditor}
                        className="h-7 gap-1.5 text-xs"
                        style={{ backgroundColor: '#0089ac' }}
                      >
                        <Pencil className="w-3 h-3" />
                        Usar no editor
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap text-xs text-fg2 font-sans leading-relaxed">
                      {composedBody}
                    </pre>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Depois de aplicar, você pode editar livremente no editor acima.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Selecione um bloco em qualquer categoria para começar a compor. Trocar de bloco na mesma categoria substitui automaticamente.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice rules card — shown only when configured */}
          {mensagensConfig.regras_voz && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl" style={{ background: 'rgba(107,208,231,0.07)', border: '1px solid rgba(107,208,231,0.20)' }}>
              <BookOpen className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--cyan-hi)' }} />
              <div className="min-w-0">
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--cyan-hi)' }}>Regras de voz</p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{mensagensConfig.regras_voz}</p>
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="flex items-start gap-2.5 p-4 bg-[rgba(245,158,11,0.10)] border border-[rgba(245,158,11,0.20)] rounded-xl">
            <span className="text-lg leading-none">💡</span>
            <div className="text-xs text-amber-800 leading-relaxed space-y-1.5">
              <p><strong>Regra de ouro CONSEJ:</strong> se essa mensagem funcionaria pra qualquer outra empresa, ela ainda não tá personalizada o suficiente.</p>
              <p>Antes de enviar, adapte com ao menos <strong>1 detalhe real</strong> do lead. Fale como pessoa — "eu" e "a gente", nunca "nós" ou "nossa equipe". Nada de "prezado/a" no WhatsApp. E lembre: somos uma <strong>empresa júnior de consultoria jurídica</strong>, não um escritório de advocacia — não usamos "advogado(a)", e sim "consultor(a)".</p>
            </div>
          </div>

          {/* All variations preview */}
          {messages.length > 1 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-fg4 uppercase tracking-wider">Todas as variações</h3>
              {messages.map((msg, i) => (
                <button
                  key={i}
                  onClick={() => setVarIdx(i)}
                  className={cn(
                    'w-full text-left p-4 rounded-xl border text-sm transition-all',
                    varIdx === i
                      ? 'border-[rgba(0,137,172,0.55)] bg-[rgba(0,137,172,0.08)]'
                      : 'border-[var(--alpha-bg-md)] bg-[var(--alpha-bg-xs)] hover:border-[var(--alpha-bg-lg)] hover:bg-[var(--alpha-bg-sm)]'
                  )}
                >
                  <div className="text-xs font-semibold text-fg4 mb-1.5">Variação {i + 1}</div>
                  <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {msg.body}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmSendModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        lead={selectedLead
          ? { id: selectedLead.id, nome: selectedLead.nome, status: selectedLead.status, telefone: selectedLead.telefone }
          : null}
        channel={channel}
        stageMsg={stage}
        setor={sector}
        variacaoIdx={varIdx}
        assunto={effectiveSubject}
        corpo={effectiveBody}
        mode={confirmMode}
        externalUrl={confirmMode === 'send' && channel === 'whatsapp'
          ? buildWhatsAppUrl(telefone, effectiveBody)
          : undefined}
      />

      <BlocoEditorModal
        open={!!editorBloco}
        onClose={() => setEditorBloco(null)}
        mode={editorBloco}
      />
    </div>
  )
}
