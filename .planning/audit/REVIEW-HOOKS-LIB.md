---
audit: hooks-lib
reviewed: 2026-07-13
depth: deep
scope: src/hooks/*.ts (32), src/lib/*.ts (27) — __tests__ excluded
findings:
  critical: 3
  warning: 16
  info: 4
  total: 23
status: issues_found
---

# Auditoria — Camada de Dados (hooks) e Lógica Pura (lib)

**Projeto:** CONSEJ CRM v2
**Escopo:** 59 arquivos (`src/hooks/`, `src/lib/`), testes excluídos
**Foco:** atomicidade multi-tabela, optimistic updates, invalidação de cache, bugs de lógica pura, timezone, divisão por zero, erros silenciosos

## Sumário executivo

A camada de lógica pura (`receita.ts`, `desempenho.ts`, `icp-dinamico.ts`, `periods.ts`) é bem documentada e majoritariamente correta. Os defeitos concentram-se em três lugares:

1. **Erros silenciosos sistemáticos na camada de hooks.** ~15 chamadas Supabase de escrita não checam `error`, e várias mutations não têm `onError`. O padrão "write principal + reflexo + audit_log" quase nunca trata a falha do reflexo — e como não há transação, o sistema fica inconsistente sem sinal para o usuário.
2. **Correções de timezone aplicadas parcialmente.** `receita.ts` escreveu `parseDate()` justamente para consertar o pitfall de `new Date('YYYY-MM-DD')` em UTC — e depois chama `getDaysUntilExpiry()` de `utils.ts`, que **não** usa o fix. O bug volta pela porta dos fundos.
3. **`updated_at` usado como data de fechamento** em 4 módulos de métrica. Não existe coluna de data de fechamento no schema (`Lead` em `src/types/index.ts:3-25` não tem `data_fechamento`), então qualquer edição num lead ganho move-o de mês.

---

## Critical

### CR-01: Cancelar um resgate não devolve os tokens ao cliente

**Arquivo:** `src/hooks/usePortalAdmin.ts:73-95`

**O bug:** `useAtualizarResgate` faz um `UPDATE` direto em `resgates` para `status='cancelado'`, sem nenhuma compensação na economia de tokens.

A RPC `solicitar_resgate_portal` (`supabase/migrations/023_internos_no_portal.sql:192-208`) **debita o saldo no momento do pedido**:

```sql
INSERT INTO resgates (..., tokens_debitados, status) VALUES (..., v_catalogo.custo_tokens, 'pendente');
INSERT INTO token_transacoes (... tipo='debito' ...);
UPDATE perfis SET tokens_saldo = tokens_saldo - v_catalogo.custo_tokens WHERE id = v_user_id;
```

**Cenário de falha concreto:**
1. Cliente com 500 tokens resgata uma recompensa de 300 → `tokens_saldo = 200`, resgate `pendente`, `token_transacoes` ganha um débito de 300.
2. A CONSEJ não consegue entregar. Admin clica "Cancelar" → `useAtualizarResgate({ status: 'cancelado' })`.
3. Resultado: `resgates.status = 'cancelado'`, mas `perfis.tokens_saldo` continua **200** e não existe nenhuma linha de crédito compensatório em `token_transacoes`.

O cliente perde 300 tokens permanentemente. A trilha de auditoria (`token_transacoes`) diverge do saldo, e `tokens_historico_total` também fica errado.

Isso viola diretamente a constraint do CLAUDE.md: *"Mutações privilegiadas DEVEM ser RPCs, não inserts/updates diretos."* Cancelamento de resgate é exatamente uma mutação com cascata.

**Correção:**
```sql
-- nova migration
CREATE OR REPLACE FUNCTION public.cancelar_resgate_admin(p_resgate_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_r resgates%ROWTYPE;
BEGIN
  IF NOT public.is_interno() THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_r FROM resgates WHERE id = p_resgate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resgate_nao_encontrado' USING ERRCODE='P0002'; END IF;
  IF v_r.status = 'cancelado' THEN RETURN; END IF;              -- idempotente
  IF v_r.status = 'entregue' THEN RAISE EXCEPTION 'resgate_ja_entregue'; END IF;

  UPDATE resgates
     SET status='cancelado', aprovado_por_id = auth.uid(), updated_at = now()
   WHERE id = p_resgate_id;

  INSERT INTO token_transacoes (perfil_id, tipo, motivo, valor, referencia_tipo, referencia_id, descricao)
  VALUES (v_r.perfil_id, 'credito', 'estorno_resgate', v_r.tokens_debitados,
          'resgate', v_r.id, COALESCE(p_motivo, 'Estorno de resgate cancelado'));

  UPDATE perfis SET tokens_saldo = tokens_saldo + v_r.tokens_debitados WHERE id = v_r.perfil_id;
END; $$;
```
e no hook, rotear `status === 'cancelado'` para `supabase.rpc('cancelar_resgate_admin', ...)`.

**Nota adjacente (mesma superfície):** a policy `"cliente insere resgates"` (`supabase/migrations/015_portal_tokens.sql:107`) permite `INSERT` direto em `resgates` pelo cliente — ou seja, é possível criar um resgate **sem passar pela RPC e sem debitar tokens**. Fora do escopo hooks/lib, mas deve ser revisado junto.

---

### CR-02: Salvar diagnóstico rebaixa o lead no pipeline, sem checar erro

**Arquivo:** `src/hooks/useDiagnostico.ts:43`

```ts
// Advance lead to educar_lead after diagnostic is completed
await supabase.from('leads').update({ status: 'educar_lead' }).eq('id', leadId)
```

**Dois bugs numa linha:**

1. **Regressão de estágio.** O update é incondicional. Não há guarda para "só avança se o lead estiver *antes* de `educar_lead`".
2. **Erro não checado.** Se o update falhar (RLS, rede), a mutation retorna sucesso, toast verde, e o lead fica sem o avanço — mas ninguém sabe.

**Cenário de falha concreto:**
- Lead está em `negociacao` (estágio 5 de 6). O consultor abre o diagnóstico para corrigir uma resposta (`digital_q1`) e salva.
- `useSaveDiagnostico` faz o upsert e então **força `status = 'educar_lead'`** (estágio 3).
- O lead volta 2 colunas no Kanban, `updated_at` é atualizado, e **não há `audit_logs`** registrando essa mudança de status (diferente de `useUpdateLeadStatus`, que loga). O histórico do lead simplesmente não explica por que ele voltou.
- Pior: como `updated_at` mudou, o lead sai da lista de "leads esquecidos" (`useLeadsEsquecidos`) e é re-datado em todas as métricas que usam `updated_at`.

**Correção:**
```ts
const AVANCA_DE = ['classificacao', 'levantamento_oportunidade']

// dentro do mutationFn, após o upsert do diagnóstico:
const { data: lead, error: leadErr } = await supabase
  .from('leads').select('status').eq('id', leadId).single()
if (leadErr) throw leadErr

if (AVANCA_DE.includes(lead.status)) {
  const { error: updErr } = await supabase
    .from('leads').update({ status: 'educar_lead' }).eq('id', leadId)
  if (updErr) throw updErr
}
```
Idealmente isso vira uma RPC (`concluir_diagnostico`) que faz upsert + avanço condicional + audit_log numa transação — é exatamente o caso descrito no anti-pattern "Mutation direta para operações com cascata/auditoria" do CLAUDE.md.

---

### CR-03: Upload de documento pode gravar `storage_path` vazio e corromper o registro

**Arquivo:** `src/hooks/useClienteDocs.ts:116-128`

```ts
// ── 3. UPDATE storage_path ──
await supabase
  .from('cliente_docs')
  .update({ storage_path: path })
  .eq('id', docId)                 // ← nenhum check de error

// ── 4. D-02: marcar parent superseded ──
if (input.parentDocId) {
  await supabase.from('cliente_docs').update({ status: 'superseded' })
    .eq('id', input.parentDocId).neq('status', 'superseded')   // ← idem
}
return docId                        // → onSuccess → toast.success('Documento enviado')
```

O fluxo é: INSERT row (`storage_path: ''`) → upload → UPDATE `storage_path`. O passo 2 tem rollback; **os passos 3 e 4 não têm nem check de erro**.

**Cenário de falha concreto:**
- Usuário faz upload de um contrato de 8 MB. O INSERT passa, o upload no bucket passa (arquivo está lá).
- A conexão cai / o token expira / a RLS de UPDATE nega. O `UPDATE storage_path` falha silenciosamente.
- A mutation retorna `docId` normalmente → `onSuccess` → toast **"Documento enviado"**.
- Estado final: linha em `cliente_docs` com `storage_path = ''` + objeto órfão no bucket `cliente-docs` (consumindo quota, contado em `useBucketUsage`).
- O documento aparece na lista do cliente. Ao clicar em baixar, `useDownloadDoc` → `getSignedDownloadUrl('')` → erro. Documento permanentemente quebrado, sem caminho de recuperação pela UI (não dá pra re-upload no mesmo `doc_id` — `buildDocPath` deriva de `doc_id`).

O mesmo vale para o passo 4: se ele falhar, o cliente vê **duas versões ativas** do mesmo documento.

**Correção:**
```ts
// 3. UPDATE storage_path — falha aqui = rollback total
const { error: pathErr } = await supabase
  .from('cliente_docs').update({ storage_path: path }).eq('id', docId)
if (pathErr) {
  await supabase.storage.from(BUCKET).remove([path])   // remove o objeto órfão
  await supabase.from('cliente_docs').delete().eq('id', docId)
  throw pathErr
}

// 4. parent superseded
if (input.parentDocId) {
  const { error: supErr } = await supabase
    .from('cliente_docs').update({ status: 'superseded' })
    .eq('id', input.parentDocId).neq('status', 'superseded')
  if (supErr) throw supErr   // row v2 fica válida; só o supersede falhou
}
```
Correção estrutural: mover os 4 passos para uma RPC + upload assinado, ou adicionar um job de limpeza para linhas com `storage_path = ''`.

---

## Warnings

### WR-01: A cadência é medida a partir da **última** interação, mas comparada contra dias absolutos — o Dia 1 se repete e os pontos 3/5/7/10 são pulados

**Arquivo:** `src/lib/cadencia.ts:59-62`, `src/lib/cadencia.ts:105-111`, `src/lib/tarefas-derivadas.ts:150-153`

O header do arquivo declara a regra: *"Cadência CONSEJ: Dias 1, 3, 5, 7, 10 **após a primeira interação**"*. O código faz outra coisa:

```ts
const ultima = interacoesDoLead[0]                       // ÚLTIMA interação
const diasDesdeUltima = daysBetween(new Date(ultima.enviada_em), today)
const match = CADENCIA_DIAS.find(p => p.dia === diasDesdeUltima)   // mapa é absoluto
```

**Cenário de falha concreto A — "Dia 1" ressuscita:**
- Consultor manda a mensagem de primeiro contato hoje (`enviada_em = D0`).
- Amanhã (`D1`): `diasDesdeUltima = 1` → `find(p => p.dia === 1)` → retorna `CADENCIA_DIAS[0]` = **`{ dia: 1, stage: 'primeiro_contato', descricao: 'Primeiro contato' }`**.
- O inbox de tarefas (`tarefas-derivadas.ts:156`) cria a tarefa **"Cadência Dia 1: Fulano — Primeiro contato"** para um lead que já recebeu o primeiro contato. A ação rápida abre `/mensagens?...&stage=primeiro_contato`.

**Cenário de falha concreto B — pontos silenciosamente pulados:**
- Última interação em `D0`. Em `D2`, `diasDesdeUltima = 2` → nenhum ponto tem `dia === 2` → nada é devido. Mas o Dia 3 da cadência (contado da primeira interação) deveria ser exatamente esse momento.
- Em `D3`, `diasDesdeUltima = 3` → dispara o ponto "Dia 3". Ou seja, a cadência real vira **D1 → D4 → D9 → D16 → D26** em vez de **D1 → D3 → D5 → D7 → D10**.
- E se o consultor não abrir o CRM num dia (o problema exato que o Milestone 2 quer resolver), `CADENCIA_TOLERANCIA = 0` (`cadencia.ts:24` — constante **declarada e nunca usada**) garante que o ponto é pulado para sempre.

**Correção:** medir sempre a partir do **primeiro** touch e usar o número de interações já enviadas como cursor:

```ts
export function getCadenciaDueToday(lead, interacoesDoLead, today = new Date()) {
  if ((TERMINAL_STAGES as readonly string[]).includes(lead.status)) return null

  // interacoesDoLead vem DESC — o primeiro touch é o último item
  const primeira = interacoesDoLead[interacoesDoLead.length - 1]
  const enviados = interacoesDoLead.length

  if (!primeira) {
    const dias = daysBetween(new Date(lead.created_at), today)
    return dias <= 1 ? CADENCIA_DIAS[0] : null
  }
  if (enviados >= CADENCIA_DIAS.length) return null          // cadência concluída

  const diasDesdePrimeira = daysBetween(new Date(primeira.enviada_em), today)
  const proximo = CADENCIA_DIAS[enviados]                    // cursor pelo nº de envios

  // tolerância: devido se já passou do dia previsto (não some se o time não abriu o CRM)
  return diasDesdePrimeira >= proximo.dia - CADENCIA_TOLERANCIA ? proximo : null
}
```
Aplicar a mesma lógica em `tarefas-derivadas.ts:145-172` (que hoje duplica o cálculo em vez de chamar `getCadenciaDueToday`).

---

### WR-02: `leadsAtualizados` é sempre 0 — filtros mutuamente exclusivos

**Arquivo:** `src/hooks/useAdocao.ts:44` e `src/hooks/useAdocao.ts:70`

```ts
supabase.from('leads')
  .select('id, responsavel_id, created_at, updated_at')
  .gte('created_at', mesAtual),                              // linha 44: só leads CRIADOS neste mês
...
leadsAtualizados: leads.filter(
  l => l.responsavel_id === p.id
    && l.updated_at >= mesAtual
    && l.created_at < mesAtual                               // linha 70: created_at ANTES deste mês
).length
```

**Cenário de falha concreto:** o conjunto `leads` só contém registros com `created_at >= mesAtual`. O filtro exige `created_at < mesAtual`. A interseção é **vazia por construção** — `leadsAtualizados` retorna `0` para todos os perfis, todo mês, para sempre.

Isso é a coluna "leads atualizados" da **página de Adoção** — a métrica central do Milestone 2 ("liderança operando no escuro"). A liderança vê zero e conclui que ninguém mexe em leads antigos.

**Correção:** buscar os leads pelo `updated_at`, não pelo `created_at`.
```ts
supabase.from('leads')
  .select('id, responsavel_id, created_at, updated_at')
  .gte('updated_at', mesAtual),          // leads TOCADOS neste mês
...
// leadsCriados usa created_at do subset:
leadsCriados:     leads.filter(l => l.responsavel_id === p.id && l.created_at >= mesAtual).length,
leadsAtualizados: leads.filter(l => l.responsavel_id === p.id && l.created_at <  mesAtual).length,
```

---

### WR-03: 3 das 4 queries paralelas de `useAdocaoAtividade` ignoram o erro

**Arquivo:** `src/hooks/useAdocao.ts:41-52`

```ts
const [perfisRes, loginsRes, leadsRes, tarefasRes] = await Promise.all([...])
if (perfisRes.error) throw perfisRes.error      // só esta é checada

const logins  = loginsRes.data  ?? []           // erro → [] silencioso
const leads   = leadsRes.data   ?? []
const tarefas = tarefasRes.data ?? []
```

**Cenário de falha concreto:** RLS role-aware (`029_rls_role_aware.sql`) restringe `audit_logs` a coordenador+. Um gerente abre `/adocao`; a query de `audit_logs` retorna erro de permissão. `loginsRes.data = null` → `logins = []` → `ultimoLogin: null` para **todos** os perfis. A tela mostra "Nunca logou" para o time inteiro, sem erro, sem toast, sem estado de erro do React Query. A liderança lê isso como "ninguém está usando o CRM".

**Correção:**
```ts
const firstError = [perfisRes, loginsRes, leadsRes, tarefasRes].find(r => r.error)?.error
if (firstError) throw firstError
```

---

### WR-04: `getDaysUntilExpiry` sofre o exato pitfall de timezone que `receita.ts` documentou e consertou

**Arquivo:** `src/lib/utils.ts:36-39` (consumido por `src/lib/receita.ts:250`)

`receita.ts:74-82` escreveu `parseDate()` explicitamente para isso:
> *"evita o pitfall de `new Date('2026-01-01')` ser interpretado como UTC midnight (que em fusos negativos vira '31/12/2025 21:00 local')"*

…e então `classificarRenovacoes` (`receita.ts:250`) chama `getDaysUntilExpiry(c.data_fim)`, que faz `new Date(dataFim)` cru. `contratos.data_fim` é `DATE` (`001_initial_schema.sql:141`) → PostgREST devolve `'2026-08-13'` → `new Date('2026-08-13')` = `2026-08-13T00:00:00Z` = **12/08 21:00 em BRT**.

**Cenário de falha concreto:**
- Hoje: 13/07/2026, 15:00 BRT (= 18:00 UTC). Contrato com `data_fim = '2026-08-13'` → faltam exatamente **31 dias de calendário**.
- `differenceInDays(new Date('2026-08-13'), now)` = `differenceInDays(13/08 00:00Z, 13/07 18:00Z)` = 30,25 dias → truncado para **30**.
- `classificarRenovacoes` → `d <= 30` → o contrato cai no bucket **`ate30`** ("crítico") em vez de `de31a60`.
- `classifyUrgency(30)` → `'critico'`.

Todo contrato é classificado como 1 dia mais urgente do que é, a partir das ~21:00 UTC de cada dia (ou seja, qualquer horário comercial no Brasil). O mesmo `new Date()` cru afeta `getContractProgress` (`utils.ts:27-35`).

**Correção:** exportar `parseDate` de um módulo compartilhado (ou movê-lo para `utils.ts`) e usá-lo:
```ts
// utils.ts
export function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s)
}

export function getDaysUntilExpiry(dataFim: string | null | undefined): number | null {
  if (!dataFim) return null
  return differenceInDays(startOfDay(parseLocalDate(dataFim)), startOfDay(new Date()))
}
```
`startOfDay` nos dois lados elimina a dependência da hora do dia.

---

### WR-05: `calcularForecast` perde contratos que começam ainda neste mês

**Arquivo:** `src/lib/receita.ts:206-247`

```ts
const mrrAtual = calcularMrr(contratos, { ...opt, today }).total   // exclui data_inicio > today
let runningMrr = mrrAtual
for (let i = 1; i <= months; i++) {                                 // começa no mês i=1 (próximo mês)
  const target = addMonths(startOfMonth(today), i)
  const entradas = contratos.filter(c => isWithinInterval(parseDate(c.data_inicio), { start: targetStart, end: targetEnd }))
  ...
}
```

`calcularMrr` com `today` **exclui** contratos com `data_inicio > today` (comentário: *"evita double-counting com `calcularForecast.entradas`"*). Mas o loop de entradas só cobre os meses **`today+1` … `today+N`** — o restante do mês corrente nunca é visitado.

**Cenário de falha concreto:**
- Hoje: 13/07/2026. Contrato assinado, `status='ativo'`, `data_inicio = '2026-07-20'`, `valor_mensal = 2000`.
- `calcularMrr({today})` → `inicio (20/07) > today (13/07)` → **excluído** do `mrrAtual`.
- Forecast cobre ago/set/out. `entradas` de agosto filtra `data_inicio ∈ [01/08, 31/08]` → o contrato de 20/07 **não bate**.
- Resultado: R$ 2.000/mês somem do forecast **em todos os meses**. O baseline de out/2026 está R$ 2.000 abaixo do real, permanentemente.

**Correção:** iniciar o loop em `i = 0` e, para o mês corrente, considerar entradas com `data_inicio` entre `today` e o fim do mês — ou (mais simples) incluir no `mrrAtual` os contratos que começam dentro do mês corrente e deixar `entradas` cobrir só `i >= 1`:

```ts
const ativos = contratos.filter(c => {
  if (c.status !== ACTIVE) return false
  if (today && c.data_inicio) {
    const inicio = parseDate(c.data_inicio)
    if (inicio > endOfMonth(today)) return false   // ← não "> today"
  }
  return true
})
```
Adicionar um teste: contrato iniciando no dia 20 com `today` = dia 13 deve aparecer no forecast.

---

### WR-06: `calcularMrrHistorico` só olha contratos `status='ativo'` — o histórico de MRR nunca cai

**Arquivo:** `src/lib/receita.ts:174-193`

```ts
const ativosNoMes = contratos.filter(c => {
  if (c.status !== ACTIVE) return false          // ← status ATUAL, não status no mês N
  ...
  return inicio <= targetEnd && (fim === null || fim >= targetStart)
})
```

O filtro de status é sobre o estado **de hoje**, não o do mês reconstruído. Contratos encerrados/cancelados são apagados retroativamente da história.

**Cenário de falha concreto:**
- Cliente A: contrato R$ 3.000/mês, `data_inicio = 01/01/2026`, `data_fim = 31/03/2026`, hoje `status = 'encerrado'`.
- Cliente B: contrato R$ 1.000/mês, iniciado em 01/06/2026, `status = 'ativo'`.
- MRR real: jan-mar = 3.000; abr-mai = 0; jun-jul = 1.000. Curva real: **cai** de 3.000 para 0.
- `calcularMrrHistorico` (6 meses, hoje = jul): fev=0, mar=0, abr=0, mai=0, jun=1.000, jul=1.000. Curva reportada: **só cresce**.

O gráfico de MRR histórico tem sobrevivência embutida — nunca mostra churn, que é justamente o que ele existe para mostrar.

**Correção:** derivar o status pela vigência, não pela coluna:
```ts
const ativosNoMes = contratos.filter(c => {
  if (c.status === 'cancelado') return false      // cancelado ≠ encerrado: nunca vigeu
  if (!c.data_inicio) return false
  const inicio = parseDate(c.data_inicio)
  const fim = c.data_fim ? parseDate(c.data_fim) : null
  return inicio <= targetEnd && (fim === null || fim >= targetStart)
})
```

---

### WR-07: `updated_at` como proxy de data de fechamento re-data leads ganhos e corrompe métricas

**Arquivos:** `src/hooks/useGamification.ts:107-108,152-157,239-242`, `src/lib/projecao.ts:47-61`, `src/lib/icp-dinamico.ts:135-137`, `src/lib/desempenho.ts:65`

`Lead` (`src/types/index.ts:3-25`) não tem coluna de data de fechamento. Todos os módulos de métrica usam `updated_at` como se fosse uma.

**Cenário de falha concreto:**
- Lead fechado como `ganho_assessoria` em **março**. `updated_at = 2026-03-10`.
- Em **julho**, um consultor abre o lead e corrige o telefone. `updated_at = 2026-07-13`.
- Consequências em cascata:
  - `useGamification.ts:152-157` → `closedAssessoriaThisMonth` conta esse lead em julho → **+100 pontos_mes** para o responsável (`pts.pontos_ganho_assessoria`). O lead sai de março e entra em julho. Ranking de "Líder do Mês" corrompido por uma edição de telefone.
  - `useTeamProgress.leads_fechados_mes` (linha 239) → a meta mensal do time infla.
  - `projecao.ts:47-49` → conta como "ganho confirmado no mês atual" (`cenarioAtual`) e **sai** do bucket histórico de março, baixando `baseHistorica`.
  - `icp-dinamico.ts:136` → o lead é reclassificado como terminal do período de julho; o win-rate de T1 muda.
  - `desempenho.ts:65` → `ciclo_medio_dias` desse lead salta de ~30 dias para ~120.

Nada disso é reversível: `updated_at` não guarda a data original.

**Correção:** adicionar a coluna e backfill.
```sql
-- nova migration
ALTER TABLE leads ADD COLUMN fechado_em TIMESTAMPTZ;

-- backfill: melhor esforço a partir do audit_log de mudança de status
UPDATE leads l SET fechado_em = a.created_at
FROM (
  SELECT DISTINCT ON (registro_id) registro_id, created_at
    FROM audit_logs
   WHERE tabela='leads' AND acao='status_alterado'
     AND valor_depois->>'status' IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado')
   ORDER BY registro_id, created_at DESC
) a
WHERE a.registro_id = l.id AND l.fechado_em IS NULL;

-- fallback para os que não têm audit_log
UPDATE leads SET fechado_em = updated_at
 WHERE fechado_em IS NULL
   AND status IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado');
```
`useUpdateLeadStatus` (`useLeads.ts:74-80`) já monta `updates` condicionalmente — basta acrescentar `updates.fechado_em = new Date().toISOString()` junto do `fechado_por_id`, e trocar `updated_at` por `fechado_em` nos 4 módulos.

---

### WR-08: 6 mutations sem `onError` — falhas de escrita são 100% silenciosas

**Arquivos:**
- `src/hooks/useClientes.ts:75-89` (`useUpdateCliente`)
- `src/hooks/useContratos.ts:128-142` (`useUpdateContrato`)
- `src/hooks/useOportunidades.ts:37-50` (`useUpdateOportunidade`)
- `src/hooks/useIndicacoes.ts:37-50` (`useUpdateIndicacao`)
- `src/hooks/useTarefas.ts:92-110` (`useConcluirTarefa`)
- `src/hooks/useTarefas.ts:112-124` (`useDeleteTarefa`)
- `src/hooks/useReunioes.ts:63-95` (as 3 mutations)
- `src/hooks/usePerfis.ts:70-85` (`useSalvarPerfil`)

**Cenário de falha concreto:** um consultor edita um cliente que não é dele. A RLS role-aware (`029_rls_role_aware.sql`) nega o UPDATE. `mutationFn` lança → React Query captura → **não há `onError`**, então nenhum toast aparece. `onSuccess` não roda, então o cache não é invalidado. O modal (que normalmente fecha em `onSuccess` ou no submit) some da tela e a lista continua mostrando o valor antigo. Da perspectiva do usuário: "salvei e o CRM não atualizou" — ele vai tentar de novo, ou pior, assumir que salvou.

`useConcluirTarefa` é o pior caso: o usuário marca a tarefa como concluída, nada acontece visualmente, e a tarefa continua no inbox e no badge count.

**Correção:** adicionar `onError` em todas, seguindo o padrão do resto do codebase:
```ts
onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao atualizar cliente'),
```

---

### WR-09: `useCreateLead` — indicação e audit_log escritos sem verificação

**Arquivo:** `src/hooks/useLeads.ts:29-48`

```ts
onSuccess: async (lead, variables) => {
  queryClient.invalidateQueries(...)
  if (origem === 'indicacao_cliente' && referido_por_cliente_id) {
    await supabase.from('indicacoes').insert({ ... })     // ← sem check de error
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.indicacoes.all })
  }
  await supabase.from('audit_logs').insert({ ... })        // ← sem check de error
  toast.success('Lead criado com sucesso!')
}
```

**Cenário de falha concreto:** consultor cadastra um lead com `origem = 'indicacao_cliente'` e `referido_por_cliente_id = <cliente X>`. O INSERT em `leads` passa. O INSERT em `indicacoes` falha (constraint, RLS, rede). Toast verde: "Lead criado com sucesso!".

Resultado: o lead existe apontando para o indicante, mas **não existe registro em `indicacoes`**. O cliente X nunca aparece na página de indicações, nunca é creditado em tokens quando o lead fechar (a trigger de crédito depende da linha em `indicacoes`), e o relatório de "leads por indicação" (`useGamification.ts:126-128`, que conta pela `origem` do lead) diverge da tabela `indicacoes`. O programa de indicações passa a mentir.

**Correção:** o cenário certo é uma RPC (`criar_lead`) que faz lead + indicação + audit numa transação. No mínimo, checar e avisar:
```ts
const { error: indErr } = await supabase.from('indicacoes').insert({ ... })
if (indErr) {
  toast.warning('Lead criado, mas a indicação não foi registrada. Registre manualmente.')
  console.error('[useCreateLead] falha ao criar indicação:', indErr)
}
```

---

### WR-10: `useCreateContrato` — cross-sells duplicados a cada novo contrato do mesmo cliente

**Arquivo:** `src/hooks/useContratos.ts:46-125`

`seenServicos` deduplica **dentro de uma única execução**, mas não há nenhuma consulta às oportunidades já existentes do cliente.

**Cenário de falha concreto:**
- Catálogo com 10 serviços ativos. Cliente fecha o **Contrato A** (`areas_direito = ['civil']`). O primeiro loop (linhas 68-84) gera uma oportunidade `cross_sell` para **cada serviço cujo `area_direito` não está coberto** → ~8 oportunidades (`adequacao_lgpd`, `registro_marca`, `revisao_contratos`, …).
- Três meses depois o mesmo cliente fecha o **Contrato B** (`areas_direito = ['contratos']`). O loop roda de novo, contra o catálogo inteiro, e gera outra vez `adequacao_lgpd`, `registro_marca`, etc.
- A tabela `oportunidades` agora tem **duas** linhas `cross_sell / adequacao_lgpd` para o mesmo cliente.
- `tarefas-derivadas.ts:175-195` cria uma tarefa derivada por oportunidade → o inbox mostra a **mesma** oportunidade duas vezes (IDs sintéticos diferentes: `derivada:oportunidade:<id1>` e `<id2>`).

Além disso, nas mesmas linhas:
- `const { data: cfgData } = await supabase.from('configuracoes')...` (linha 55) — erro ignorado. Se falhar, `catalogo = []` → **nenhuma** oportunidade é gerada, silenciosamente.
- `await supabase.from('oportunidades').insert(oportunidades)` (linha 117) — erro ignorado.
- `supabase.from('audit_logs').insert(...)` (linha 121) — **sem `await`**, promise flutuante, erro ignorado. O contrato pode ficar sem trilha de auditoria de criação.

**Correção:**
```ts
// antes dos loops: buscar o que já existe
const { data: existentes, error: exErr } = await supabase
  .from('oportunidades')
  .select('servico_alvo')
  .eq('cliente_id', contrato.cliente_id)
  .not('status', 'in', '(convertida,descartada)')
if (exErr) throw exErr

const seenServicos = new Set<string>((existentes ?? []).map(o => o.servico_alvo))
// ... loops inalterados (seenServicos já pré-populado)

if (oportunidades.length > 0) {
  const { error: opErr } = await supabase.from('oportunidades').insert(oportunidades)
  if (opErr) toast.warning('Contrato criado, mas as oportunidades não foram geradas.')
  else queryClient.invalidateQueries({ queryKey: QUERY_KEYS.oportunidades.all })
}
const { error: auErr } = await supabase.from('audit_logs').insert({ ... })
if (auErr) console.error('[useCreateContrato] audit_log falhou:', auErr)
```

---

### WR-11: `useMeuPerfil` — erro de leitura vira tentativa espúria de criar perfil, e o perfil criado não tem `role` nem `tipo`

**Arquivo:** `src/hooks/usePerfis.ts:39-61`

```ts
const { data } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()  // ← sem error
if (data) return data

// "No profile row yet" — assume ausência, mas pode ser erro
const { data: created } = await supabase
  .from('perfis')
  .insert({ id: user.id, email: user.email ?? '', nome: defaultName })   // ← sem role, sem tipo, sem error check
  .select().single()
return created ?? null
```

**Cenário de falha concreto A (erro transitório interpretado como "não existe"):**
- Um blip de rede faz o SELECT falhar. `error` é descartado, `data = null`.
- O código conclui "usuário novo sem perfil" e tenta um INSERT — que colide com a linha existente (PK duplicada). O erro do INSERT **também** é descartado → `created = null` → o hook retorna `null`.
- `useCurrentRole` (`useCurrentRole.ts:24`) → `role = null` → `isDiretor`, `atLeast()`, `hasRole()` todos `false`. Todo o menu e todos os `RequireRole` somem. O `AppLayout` lê `perfil.tipo === undefined`.
- Como `useMeuPerfil` usa `staleTime: 0, gcTime: 0`, isso se repete em cada mount — um diretor pode ficar preso numa UI sem permissões e sem nenhuma mensagem de erro.

**Cenário de falha concreto B (auto-create degradado):**
- Usuário genuinamente novo (trigger `on_auth_user_created` não rodou). O INSERT cria a linha **sem `role` e sem `tipo`**.
- `tipo` é `NULL` → o `AppLayout` não consegue decidir CRM vs Portal; `role` é `NULL` → o usuário fica sem nenhuma permissão, mas *com* um perfil, então nada o alerta. O backfill precisa ser manual.

**Correção:**
```ts
const { data, error } = await supabase.from('perfis').select('*').eq('id', user.id).maybeSingle()
if (error) throw error           // deixa o React Query expor o erro (isError) em vez de mascarar
if (data) return data

const { data: created, error: createErr } = await supabase
  .from('perfis')
  .insert({ id: user.id, email: user.email ?? '', nome: defaultName, tipo: 'interno', role: 'consultor' })
  .select().single()
if (createErr) throw createErr
return created
```

---

### WR-12: Race de "lost update" na versão de documento

**Arquivo:** `src/hooks/useClienteDocs.ts:57-68`

```ts
const { data: parent } = await supabase.from('cliente_docs').select('versao').eq('id', input.parentDocId).single()
novaVersao = (parent.versao ?? 1) + 1        // read-modify-write sem lock
```

**Cenário de falha concreto:** dois consultores sobem uma nova versão do mesmo `parentDocId` (versão 3) com poucos segundos de diferença. Ambos leem `versao = 3` → ambos inserem `versao = 4`. Duas linhas distintas com `versao = 4` e o mesmo `parent_doc_id`. A UI de versionamento não consegue mais ordenar, e ambos executam o `UPDATE parent SET status='superseded'` (idempotente, ok) — mas o cliente vê duas "v4" ativas.

**Correção:** calcular a versão no servidor.
```sql
CREATE OR REPLACE FUNCTION public.proxima_versao_doc(p_parent UUID)
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(versao), 0) + 1 FROM cliente_docs
   WHERE id = p_parent OR parent_doc_id = p_parent;
$$;
```
mais um `UNIQUE (parent_doc_id, versao)` para que a corrida perdedora falhe em vez de duplicar.

---

### WR-13: `loadPeriod` — a guarda anti-tampering aceita granularidades inválidas e derruba a página

**Arquivo:** `src/lib/desempenho-period.ts:16-29`

O header declara: *"guarda contra tampering (T-08-07): valida typeof antes de aceitar o JSON parseado"*. A validação é insuficiente:

```ts
if (typeof parsed.year === 'number' && typeof parsed.granularity === 'string') {
  return { year: parsed.year, granularity: parsed.granularity as PeriodValue['granularity'] }
  //                                                          ^^^ cast cego
}
```

**Cenário de falha concreto:**
- `localStorage.setItem('consej_desempenho_period', '{"year":2026,"granularity":"x"}')` (ou um valor corrompido por uma versão antiga do app).
- `loadPeriod()` retorna `{ year: 2026, granularity: 'x' }` — passa nos dois `typeof`.
- `getPeriodRange` (`periods.ts:59-70`) é um `switch` exaustivo **sem `default`** → nenhum case bate → retorna `undefined`.
- `desempenho.ts:50` → `const range = getPeriodRange(periodo)` = `undefined` → `isInRange(l.created_at, undefined)` → `range.from` → **`TypeError: Cannot read properties of undefined`** → o `ErrorBoundary` engole a página `/me/desempenho`. Recuperação: só limpando o localStorage.
- Mesmo com `year` inválido (`{"year": 1e21}`), `new Date(1e21, 0, 1)` → `Invalid Date` → `getTime()` = `NaN` → toda comparação `>=` é `false` → todas as métricas silenciosamente 0.

**Correção:**
```ts
const GRANULARITIES: readonly PeriodValue['granularity'][] = ['total','q1','q2','q3','q4','s1','s2']

export function loadPeriod(): PeriodValue {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultPeriod()
    const p = JSON.parse(raw) as Partial<PeriodValue>
    const yearOk = Number.isInteger(p.year) && p.year! >= 2000 && p.year! <= getCurrentYear() + 1
    const granOk = GRANULARITIES.includes(p.granularity as PeriodValue['granularity'])
    if (yearOk && granOk) return { year: p.year!, granularity: p.granularity! }
  } catch { /* fall through */ }
  return defaultPeriod()
}
```
Adicionalmente, dar um `default: return getYearRange(year)` em `getPeriodRange` como defesa em profundidade — hoje o retorno `undefined` não é sequer visível no tipo.

---

### WR-14: Tarefas derivadas de oportunidade aparecem no inbox de todo mundo

**Arquivo:** `src/lib/tarefas-derivadas.ts:175-195`

Os blocos 1 (reuniões), 2 (contratos) e 3/4 (leads) filtram por `meuId`. O bloco 5 (oportunidades) **não filtra nada** e não seta `atribuido_a_id`.

```ts
for (const o of oportunidades) {
  if (o.status === 'convertida' || o.status === 'descartada') continue
  if (!o.data_alerta) continue
  const dias = differenceInDays(alerta, hoje)
  if (dias > 7) continue
  out.push({ ... })                       // ← sem checagem de dono
}
```

**Cenário de falha concreto:** existem 30 oportunidades com alerta vencido, todas de clientes de outros consultores. Cada um dos 5 membros do time abre "Meu Espaço" e vê as **mesmas 30 tarefas**, todas com prioridade `critica` (`priByVencimento` → `dias < 0` → `'critica'`). Elas ordenam para o topo (`PRI_ORDER.critica = 0`, linhas 198-206) e enterram as tarefas reais do usuário. O inbox pessoal — a razão de o time abrir o CRM — vira ruído.

Nota adicional: sem `dias < -N`, uma oportunidade com alerta vencido há 2 anos continua no inbox para sempre.

**Correção:** `Oportunidade` deriva o dono via `contratos.responsavel_id` (mesmo caminho usado em `desempenho.ts:93-97`):
```ts
const contratosDoPerfil = new Set(
  contratos.filter(c => c.responsavel_id === meuId).map(c => c.id)
)
for (const o of oportunidades) {
  if (o.status === 'convertida' || o.status === 'descartada') continue
  if (!o.data_alerta) continue
  if (o.contrato_id && !contratosDoPerfil.has(o.contrato_id)) continue   // ← dono
  const dias = differenceInDays(alerta, hoje)
  if (dias > 7 || dias < -30) continue                                    // ← janela inferior
  out.push({ ..., atribuido_a_id: meuId })
}
```

---

### WR-15: `venceHoje()` retorna `false` para tarefas que vencem hoje; `isVencida()` retorna `true` para elas

**Arquivo:** `src/lib/tarefas-derivadas.ts:212-222`

```ts
export function isVencida(dataVencimento?: string | null, hoje = new Date()): boolean {
  return isBefore(new Date(dataVencimento), hoje)          // compara instante vs instante
}
export function venceHoje(dataVencimento?: string | null, hoje = new Date()): boolean {
  const d = new Date(dataVencimento)
  return isAfter(d, startOfDay(hoje)) && isBefore(d, startOfDay(new Date(hoje.getTime() + 24 * 3600 * 1000)))
}
```

`tarefas.data_vencimento` é `TIMESTAMPTZ` (`014_tarefas.sql:20`), mas os formulários de tarefa alimentam-no a partir de um input de data (só o dia), o que resulta em `T00:00:00Z`.

**Cenário de falha concreto:** tarefa com `data_vencimento = '2026-07-13T00:00:00+00:00'`, hoje é 13/07 às 10:00 BRT.
- Em BRT, `d` = **12/07 21:00 local**. `startOfDay(hoje)` = 13/07 00:00 local.
- `venceHoje` → `isAfter(12/07 21:00, 13/07 00:00)` = **`false`** → a tarefa que vence hoje **não é marcada como "vence hoje"**.
- `isVencida` → `isBefore(12/07 21:00, 13/07 10:00)` = **`true`** → a mesma tarefa é marcada como **vencida**.

Toda tarefa do dia nasce "atrasada" e nunca aparece como "vence hoje". Os dois helpers estão simultaneamente errados e contraditórios entre si.

Mesmo problema em `isVencida` para tarefas com hora real: uma tarefa marcada para hoje às 18:00, consultada às 10:00, retorna `isVencida = true`? Não — `isBefore(18:00, 10:00)` = `false`. Ou seja, o comportamento muda conforme o campo tenha hora ou não. Inconsistente nos dois sentidos.

**Correção:** comparar por dia, não por instante.
```ts
import { isSameDay, startOfDay } from 'date-fns'

export function isVencida(dataVencimento?: string | null, hoje: Date = new Date()): boolean {
  if (!dataVencimento) return false
  return isBefore(startOfDay(new Date(dataVencimento)), startOfDay(hoje))
}
export function venceHoje(dataVencimento?: string | null, hoje: Date = new Date()): boolean {
  if (!dataVencimento) return false
  return isSameDay(new Date(dataVencimento), hoje)
}
```
E, na gravação, normalizar `data_vencimento` para o fim do dia local (`23:59:59`) em vez de meia-noite UTC.

---

### WR-16: `buildIcpFitContext` — convicção "preliminar" pode produzir um `fitSet` vazio e desligar o fallback estático

**Arquivo:** `src/lib/icp-dinamico.ts:196-213` (com `topN` em `icp-dinamico.ts:106-108` e as chamadas em `icp-dinamico.ts:160-161`)

```ts
segmentos:     topN(segmentosAll, 5, 2),     // minCount = 2 → descarta valores com count 1
investimentos: topN(investAll,    3, 2),
...
const useObservado = obs.conviccao !== 'insuficiente'   // preliminar = 3 a 9 ganhos
const segs = useObservado ? obs.segmentos.map(s => s.value) : (cfg.segmentos_icp ?? [])
```

`conviccao = 'preliminar'` exige apenas `n >= 3` ganhos, mas `topN(..., minCount = 2)` exige que um valor específico apareça **≥ 2 vezes**.

**Cenário de falha concreto:**
- Serviço `revisao_contratos` teve 3 ganhos diretos no ano, cada um num segmento diferente (`startup`, `empresa_junior`, `empresa_design`), cada um com um investimento diferente.
- `classificarConviccao(3)` → `'preliminar'` → `useObservado = true`.
- `topN(segmentosAll, 5, 2)` → todos têm `count = 1` → filtrados → **`obs.segmentos = []`**.
- `segs = []`, `invs = []` → o loop duplo `for (s of segs) for (i of invs)` **não executa nenhuma vez** → nada é adicionado ao `fitSet`.
- E como `useObservado = true`, o ICP **estático** configurado (`cfg.segmentos_icp × cfg.investimento_icp`) **não é usado como fallback**.
- Resultado: `isLeadIcpFit()` retorna `false` para **todos** os leads desse serviço. O badge de ICP-fit no `LeadCard` some, e `desempenho.ts:79-82` calcula `icp_fit_medio = 0%` para todo consultor — número que vai direto para o relatório de desempenho individual e de equipe.

**Correção:** cair para o estático sempre que o observado não produzir pares.
```ts
const observadoSegs = obs.conviccao !== 'insuficiente' ? obs.segmentos.map(s => s.value) : []
const observadoInvs = obs.conviccao !== 'insuficiente' ? obs.investimentos.map(i => i.value) : []

// usa o observado só se ele efetivamente produzir os dois lados do par
const temObservado = observadoSegs.length > 0 && observadoInvs.length > 0
const segs = temObservado ? observadoSegs : (cfg.segmentos_icp ?? [])
const invs = temObservado ? observadoInvs : (cfg.investimento_icp ?? [])
```

---

## Info

### IN-01: `aprovado_por_id` vem do cliente, não do servidor

**Arquivo:** `src/hooks/usePortalAdmin.ts:77-85`

```ts
mutationFn: async ({ id, status, aprovadoPorId }) => {
  await supabase.from('resgates')
    .update({ status, aprovado_por_id: aprovadoPorId, ... })   // valor arbitrário do client
```

A policy `"interno gerencia resgates"` (`015_portal_tokens.sql:110`) autoriza qualquer interno a fazer o UPDATE, mas nada força `aprovado_por_id = auth.uid()`. Um interno pode atribuir a aprovação de um resgate a outro colega. É forjável apenas por quem já tem permissão de aprovar, então o impacto é limitado a integridade de trilha de auditoria — mas a coluna existe justamente para isso. A correção sugerida em CR-01 (RPC com `auth.uid()`) resolve os dois de uma vez. Aplicar o mesmo raciocínio ao `useAprovarDoc`.

### IN-02: `CADENCIA_TOLERANCIA` é declarada e nunca usada

**Arquivo:** `src/lib/cadencia.ts:24`

```ts
// Tolerância em dias (±) para considerar uma cadência "devida hoje".
export const CADENCIA_TOLERANCIA = 0
```

Nenhum consumidor a lê (verificado com grep em `src/`). O comentário descreve a solução para WR-01 — a intenção estava certa, a implementação nunca chegou. Ao corrigir WR-01, usar essa constante (com valor `>= 1`) ou removê-la.

### IN-03: Duas perguntas do diagnóstico não influenciam a recomendação

**Arquivo:** `src/lib/diagnostic-utils.ts:9-77`

`DiagnosticAnswers` (`src/types/index.ts:27-41`) declara `empresarial_q1` e `investimento_q1`, mas `getClusterRecommendation` nunca as consulta — nenhuma delas contribui para `clusterScore`, `urgentServices` ou `rationale`. O lead responde e a resposta é descartada. Ou incorporar ao scoring, ou remover as perguntas do formulário.

### IN-04: O optimistic update de `useUpdateLeadStatus` descarta `motivo_perda`

**Arquivo:** `src/hooks/useLeads.ts:85-92`

```ts
onMutate: async ({ id, status }) => {                    // motivo_perda não é desestruturado
  queryClient.setQueryData<Lead[]>(QUERY_KEYS.leads.all, old =>
    old?.map(l => l.id === id ? { ...l, status } : l) ?? []   // só status é aplicado
  )
```

Ao arrastar um lead para "Perdido" e informar o motivo, o cache otimista mostra `status='perdido'` com o `motivo_perda` antigo (ou vazio) até o `onSettled` invalidar. Piscada visual curta, sem risco de dados. Corrigir aplicando `{ ...l, status, ...(motivo_perda ? { motivo_perda } : {}) }`.

Um detalhe correlato, sem bug prático: dois drags concorrentes fazem o `onMutate` do segundo capturar um `previous` que já contém o update otimista do primeiro. Se o segundo falhar, o rollback restaura um estado não confirmado. Como `onSettled` sempre invalida `leads.all`, o cache converge — não vale mudar.

### IN-05: Denominador de `pct` inclui leads sem o campo

**Arquivo:** `src/lib/icp-dinamico.ts:86,97`

```ts
const totalGanhos = ganhos.length            // inclui ganhos com segmento/investimento null
pct: pct(count, totalGanhos)
```

Se 10 ganhos têm segmento e 5 têm `segmento = null`, os percentuais são calculados sobre 15 e a distribuição soma ~67% em vez de 100%. Só afeta a leitura do gráfico em `IcpDinamicoPage`; `taxa_conversao` (que usa `total_funil` por valor) está correta. Se quiser precisão, calcular o denominador por campo: `ganhos.filter(l => pick(l)).length`.

---

## Notas de escopo

- **Não encontrado:** nenhum uso de `dangerouslySetInnerHTML`, `innerHTML` ou `eval()` em `src/` — sem superfície de XSS na camada auditada.
- **Não encontrado:** vazamento de cache entre sessões. `useMeuPerfil` (`usePerfis.ts:41-43`) usa `staleTime: 0` + `gcTime: 0` corretamente. As demais queries são protegidas por RLS server-side.
- **Correto:** a invalidação por prefixo do TanStack Query cobre `tarefas.mine`/`tarefas.byEntidade` a partir de `QUERY_KEYS.tarefas.all` (`['tarefas']`). Não é um bug.
- **Correto:** `periods.ts` usa construtores `Date` locais de ponta a ponta e compara instantes absolutos via `getTime()` — coerente. `getQuarterRange`/`getSemesterRange` acertam as bordas (o truque `day=0` do mês seguinte).
- **Correto:** `csv-export.ts:sanitizeCell` cobre a lista OWASP (`=`, `+`, `-`, `@`, `\t`, `\r`). Detalhe menor: `periodoLabel` entra no nome do arquivo sem passar por `slugify` (`csv-export.ts:151`), embora `perfilNome` passe — o header do arquivo reivindica a mitigação T-08-02 para o filename inteiro. Como `periodoLabel` vem de `formatPeriodLabel` (valores fechados), não é explorável hoje; ainda assim, `slugify(periodoLabel)` fecha o contrato.

---

_Auditado: 2026-07-13_
_Escopo: `src/hooks/` (32 arquivos) + `src/lib/` (27 arquivos)_
