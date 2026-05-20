# Design — Exclusão e restauração de leads

- **Data:** 2026-05-18
- **Projeto:** CONSEJ CRM v2
- **Status:** Aprovado para implementação

## 1. Problema

Hoje a exclusão de um lead (`useDeleteLead`) é um `DELETE` direto na tabela
`leads`. Consequências:

- O delete é definitivo — não há como recuperar um lead excluído por engano.
- `useDeleteLead` está definido mas **não está ligado a nenhuma tela** — a
  exclusão de lead nunca chegou a estrear na UI.
- A `AuditoriaPage` só lista `audit_logs` em modo leitura; não há ação de
  desfazer nada.

O objetivo é permitir excluir um lead **removendo todos os seus reflexos** em
outras instâncias (tarefas, interações/mensagens, diagnóstico, pipeline,
indicações, reuniões) e, ao mesmo tempo, permitir **restaurar o lead pela
Auditoria**, recompondo tudo que foi removido junto (undo completo).

## 2. Decisões do brainstorming

| Pergunta | Decisão |
|---|---|
| Escopo do restore | **Undo completo** — lead + tudo que foi removido junto volta ao estado anterior. |
| Quem exclui | Qualquer membro **interno**. |
| Quem restaura | Apenas `coordenador` ou acima (`coordenador`, `gerente`, `diretor`). |
| Retenção | **Para sempre** — leads excluídos ficam recuperáveis indefinidamente; sem expurgo. |
| Indicações | **Desvinculadas, não apagadas** — a indicação pertence também ao indicante e alimenta ranking/recompensas. |

## 3. Abordagem escolhida — Lixeira com snapshot completo

Avaliadas três abordagens:

- **A — Soft-delete em cascata** (`deleted_at` em todas as tabelas): rejeitada.
  Exigiria adicionar `.is('deleted_at', null)` em todas as queries de lead do
  app (LeadsPage, Dashboard, Analytics, Mapa, Ranking, Cadência, Prospecção,
  kanban). Esquecer um único ponto faz o lead excluído reaparecer.
- **B — Lead soft-deleted + snapshot dos relacionados**: rejeitada. Ainda
  exige filtro `deleted_at` em todas as queries de `leads`.
- **C — Lixeira com snapshot completo**: **escolhida.** Concentra toda a
  complexidade em 2 RPCs + 1 tabela, não muda nenhuma query existente, e segue
  a filosofia que a migração `025_clean_delete.sql` já adotou (hard delete +
  triggers + RPC de inspeção).

Na abordagem C, ao excluir, o lead e todos os reflexos são serializados num
snapshot JSONB único na tabela `leads_lixeira` e então apagados de verdade. O
lead some instantaneamente de todas as telas. Restaurar é um RPC de admin que
re-insere o lead + relacionados a partir do snapshot, preservando os IDs
originais para que todos os vínculos voltem intactos.

## 4. Contexto do schema existente

FKs que referenciam `leads(id)` e seu comportamento atual no `DELETE`:

| Tabela | Coluna | `ON DELETE` |
|---|---|---|
| `diagnosticos` | `lead_id` (NOT NULL, UNIQUE) | CASCADE |
| `interacoes_lead` | `lead_id` (NOT NULL) | CASCADE |
| `tarefas` | `(entidade_tipo, entidade_id)` — sem FK | trigger `cleanup_orphan_tarefas` da migração 025 apaga |
| `indicacoes` | `lead_id` | SET NULL |
| `reunioes` | `lead_id` | SET NULL |
| `objecoes` | `origem_lead_id` | SET NULL |
| `clientes` | `lead_id` | SET NULL |

Recursos já existentes que serão reaproveitados:

- RPC `inspecionar_exclusao(p_entidade_tipo, p_id)` (migração 025) — devolve a
  contagem de registros afetados; já usado pelo `DeleteConfirmDialog`.
- Componente `DeleteConfirmDialog` — já mostra a prévia de impacto e tem estado
  de erro; hoje usado em Clientes e Contratos.
- Tabela `audit_logs` (`tabela`, `registro_id`, `acao`, `campo`, `valor_antes`,
  `valor_depois`, `usuario`, `created_at`).
- `useCurrentRole()` — expõe `isCoordenadorOrAcima`.
- Papéis internos: `consultor` < `coordenador` < `gerente` < `diretor`.
  Funções DB existentes: `is_interno()`, `is_diretor()`.

## 5. Modelo de dados

### 5.1 Tabela nova: `leads_lixeira`

Uma linha por evento de exclusão. Retenção infinita — a linha nunca é apagada;
após restaurar, apenas `restaurado_em`/`restaurado_por` são preenchidos e a
linha vira histórico.

```sql
CREATE TABLE leads_lixeira (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL,          -- id original do lead; NÃO é FK (o lead não existe mais)
  lead_nome         TEXT,                   -- desnormalizado p/ listar sem abrir o snapshot
  lead_empresa      TEXT,
  snapshot          JSONB NOT NULL,
  excluido_por      UUID REFERENCES perfis(id) ON DELETE SET NULL,
  excluido_por_nome TEXT,
  excluido_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  restaurado_em     TIMESTAMPTZ,            -- NULL = ainda na lixeira
  restaurado_por    UUID REFERENCES perfis(id) ON DELETE SET NULL
);

CREATE INDEX idx_leads_lixeira_pendentes ON leads_lixeira(excluido_em DESC)
  WHERE restaurado_em IS NULL;
```

### 5.2 Formato do `snapshot` (JSONB)

```jsonc
{
  "lead":          { /* row completa de leads */ },
  "diagnostico":   { /* row de diagnosticos | null */ },
  "interacoes":    [ /* rows de interacoes_lead */ ],
  "tarefas":       [ /* rows de tarefas do lead */ ],
  "reunioes_ids":  [ /* uuids das reunioes a re-vincular */ ],
  "indicacoes_ids":[ /* uuids das indicacoes a re-vincular */ ],
  "objecoes_ids":  [ /* uuids das objecoes a re-vincular */ ]
}
```

Reuniões, indicações e objeções guardam só os **ids** porque essas linhas não
são apagadas — apenas desvinculadas (`lead_id`/`origem_lead_id` → NULL) e
re-vinculadas na restauração.

## 6. Fluxo de exclusão — RPC `excluir_lead(p_id UUID)`

`LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`. Tudo numa
transação implícita da função.

1. **Autorização:** se `NOT is_interno()` → `RAISE EXCEPTION` com
   `ERRCODE = '42501'`.
2. **Bloqueio de lead convertido:** se existe `cliente` com `lead_id = p_id` →
   `RAISE EXCEPTION 'Este lead já virou cliente; exclua o cliente, não o
   lead.'`. Lead convertido não é um lead morto.
3. **Validação:** se o lead não existe → `RAISE EXCEPTION` ("Lead não
   encontrado").
4. **Snapshot:** monta o JSONB lendo `leads`, `diagnosticos`,
   `interacoes_lead`, `tarefas` (onde `entidade_tipo='lead' AND
   entidade_id=p_id`), e os ids de `reunioes`, `indicacoes`, `objecoes`
   vinculados. O snapshot é montado **antes** do delete.
5. **Grava** a linha em `leads_lixeira` com `excluido_por` = `auth.uid()` e
   `excluido_por_nome` lido de `perfis`.
6. **`DELETE FROM leads WHERE id = p_id`** — cascade apaga diagnóstico e
   interações; trigger 025 apaga tarefas; reuniões/indicações/objeções têm o
   `lead_id` zerado por SET NULL.
7. **Grava** `audit_logs`: `acao='excluido'`, `tabela='leads'`,
   `registro_id=p_id`, `valor_antes` = snapshot do lead, `usuario` = nome.
8. **Retorna** o `id` da linha de `leads_lixeira` criada.

`GRANT EXECUTE` para `authenticated`.

## 7. Fluxo de restauração — RPC `restaurar_lead(p_lixeira_id UUID)`

`LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`.

1. **Autorização:** exige `coordenador` ou acima. Introduz a função auxiliar
   `is_coordenador_ou_acima()` (lê `perfis.role` do usuário atual e compara
   pelo rank). Se reprovar → `RAISE EXCEPTION` com `ERRCODE = '42501'`.
2. **Carrega** a linha de `leads_lixeira`. Se não existe → erro. Se
   `restaurado_em IS NOT NULL` → `RAISE EXCEPTION 'Este lead já foi
   restaurado.'` (evita restauração dupla; a transação + esta checagem
   protegem contra concorrência).
3. **Conflito:** se já existe um `lead` com o `lead_id` do snapshot →
   `RAISE EXCEPTION` ("O lead já existe").
4. **Re-insere** na ordem: `leads` (id original) → `diagnosticos` →
   `interacoes_lead` → `tarefas`. Todos com os ids originais do snapshot.
5. **Re-vincula:** `UPDATE reunioes SET lead_id = :lead_id WHERE id = ANY(:reunioes_ids)`
   e equivalente para `indicacoes` (`lead_id`) e `objecoes` (`origem_lead_id`).
   Registros que já não existem simplesmente não casam no `WHERE` — ignorados
   sem erro.
6. **Atualiza** a linha da lixeira: `restaurado_em = now()`,
   `restaurado_por = auth.uid()`.
7. **Grava** `audit_logs`: `acao='restaurado'`, `tabela='leads'`,
   `registro_id = lead_id`.

`GRANT EXECUTE` para `authenticated` (a checagem de papel é interna).

## 8. Camada de aplicação (React)

### 8.1 Hooks (`src/hooks/useLeads.ts` e correlatos)

- `useDeleteLead` — reescrito: `supabase.rpc('excluir_lead', { p_id: id })`.
  `onSuccess` invalida `leads`, `audit_logs` e `leads_lixeira`.
- `useLeadsLixeira()` — `SELECT` de `leads_lixeira WHERE restaurado_em IS NULL`,
  ordenado por `excluido_em DESC`.
- `useRestaurarLead()` — `supabase.rpc('restaurar_lead', { p_lixeira_id })`.
  `onSuccess` invalida `leads`, `audit_logs` e `leads_lixeira`; `toast` de
  sucesso/erro.

### 8.2 UI — exclusão

`LeadsPage` e `LeadDetailPage` ganham a ação "Excluir", que abre o
`DeleteConfirmDialog` existente com `entidadeTipo="lead"`. O diálogo já
renderiza a prévia de impacto via `inspecionar_exclusao` e já trata erro — a
mensagem de bloqueio "lead já virou cliente" aparece nele sem código extra.
`onConfirm` chama `useDeleteLead`.

### 8.3 UI — restauração na Auditoria

Novo card **"Lixeira de leads"** no topo da `AuditoriaPage`, alimentado por
`useLeadsLixeira()`. Cada linha mostra nome/empresa do lead, quem excluiu e
quando, com um botão **Restaurar** visível apenas para `coordenador` ou acima
(`useCurrentRole().isCoordenadorOrAcima`). Clicar abre um diálogo de
confirmação → `useRestaurarLead`.

Adicionar a ação `'restaurado'` ao mapa `ACAO_COLORS` da `AuditoriaPage`.

## 9. Permissões e segurança

| Camada | Excluir | Restaurar |
|---|---|---|
| RPC (DB) | `is_interno()` | `is_coordenador_ou_acima()` |
| Frontend | ação visível a internos | botão só para `coordenador+` |
| RLS `leads_lixeira` | `SELECT` para internos; sem policy de `INSERT`/`UPDATE`/`DELETE` direta — gravação só pelos RPCs `SECURITY DEFINER` | |

## 10. Casos de borda

- **Lead já é cliente** — bloqueado no RPC `excluir_lead`; erro exibido no
  `DeleteConfirmDialog`.
- **Relacionado apagado entre exclusão e restauração** (ex.: uma reunião
  desvinculada e depois excluída) — o `UPDATE` de re-vínculo não casa e é
  ignorado silenciosamente; a restauração não falha.
- **Restauração dupla / concorrente** — checagem `restaurado_em IS NULL` dentro
  da transação.
- **Restaurar com o id de lead ainda existente** — RPC recusa com erro.
- **`diagnosticos.lead_id` é UNIQUE** — re-inserção é segura porque a linha
  havia sido apagada pelo cascade.
- **CHECK `indicacoes_must_have_referrer`** — incide sobre o indicante, não
  sobre `lead_id`; `lead_id` nulo é permitido, então a desvinculação não
  dispara o CHECK.

## 11. Estratégia de testes

- **Vitest (unit):** `useDeleteLead`, `useRestaurarLead`, `useLeadsLixeira`
  usando o `supabase-mock` existente.
- **RPC round-trip (integração):** script que cria um lead com diagnóstico,
  interações, tarefas, reunião e indicação; chama `excluir_lead`; confere o
  snapshot em `leads_lixeira` e que o lead sumiu; chama `restaurar_lead`;
  confere lead + diagnóstico + interações + tarefas de volta e
  reuniões/indicações re-vinculadas.
- **Playwright (e2e):** excluir um lead na `LeadsPage` → confirmar que some da
  lista → ir à `AuditoriaPage` → clicar Restaurar → confirmar que reaparece.

## 12. Migração

Nova migração `032_lixeira_leads.sql` contendo: tabela `leads_lixeira` + índice,
função `is_coordenador_ou_acima()`, RPCs `excluir_lead` e `restaurar_lead`,
policies de RLS de `leads_lixeira`, e os `GRANT EXECUTE`.

## 13. Fora de escopo

- Soft-delete / lixeira para `clientes`, `contratos` ou outras entidades — este
  design cobre apenas `leads`.
- Expurgo automático da lixeira (retenção é infinita por decisão de produto).
- Restauração parcial (restaurar o lead sem alguns relacionados).
