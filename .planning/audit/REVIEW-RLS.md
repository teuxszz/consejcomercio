---
audit: RLS / camada de autorização
scope: supabase/migrations/001..039 (estado final acumulado)
reviewed: 2026-07-13
depth: deep
files_reviewed: 37
findings:
  critical: 6
  warning: 7
  info: 4
  total: 17
status: issues_found
---

# Auditoria de Segurança — Camada de Autorização (RLS)

**Contexto:** browser fala direto com Supabase. RLS + RPCs `SECURITY DEFINER` são a **única** fronteira de segurança. Foram lidas as 37 migrations em ordem; o que segue é o **estado final acumulado**, não o estado de cada migration isolada.

**Veredito:** a RLS **NÃO está correta**. Existem 6 falhas críticas, das quais duas (CR-01 e CR-02) permitem, independentemente uma da outra, que qualquer pessoa vire `interno` e leia/escreva o CRM inteiro. O trabalho de hardening das migrations 021/022/029/033 foi real e competente, mas foi **parcialmente revertido** pelas migrations 035–037 e nunca cobriu três tabelas (`interacoes_lead`, `pos_juniors`, `configuracoes`).

---

## O que está correto (para não jogar fora o que funciona)

- `leads`, `clientes`, `contratos`, `demandas`, `oportunidades`, `diagnosticos`, `reunioes`, `parceiros`, `objecoes`, `indicacoes`, `audit_logs`, `notificacoes_indicacao`, `notificacoes_renovacao_enviadas`, `leads_lixeira`, `token_transacoes`, `resgates`, `catalogo_recompensas`, `regras_tokens`, `campanhas_promocionais`, `push_subscriptions`, `notificacoes_envios`, `cliente_docs`, `tarefas` — **todas com `ENABLE ROW LEVEL SECURITY`**. Nenhuma tabela sensível ficou sem RLS.
- Todas as funções `SECURITY DEFINER` do estado final têm `SET search_path` explícito (`is_interno`, `current_cliente_id`, `current_role_consej`, `is_diretor`, `can_see_perfil`, `can_see_responsavel`, `is_at_least`, `is_coordenador_ou_acima`, `excluir_lead`, `restaurar_lead`, `inspecionar_exclusao`, `enviar_indicacao_portal`, `solicitar_resgate_portal`, `creditar_tokens_admin`, `handle_new_user`, `cron_*`, `bucket_usage_bytes`). **Não há o vetor clássico de search_path mutável.** (021:19, 022:27/139/208, 027:45/58/76, 029:32, 032:33/48/103, 035:100/143, 037:166, 039:25)
- As RPCs de mutação privilegiada **checam autorização internamente**: `excluir_lead` → `is_interno()` (032:57), `restaurar_lead` → `is_coordenador_ou_acima()` (032:112), `inspecionar_exclusao` → `is_interno()` (025:156), `creditar_tokens_admin` → `tipo='interno'` (022:218), `enviar_indicacao_portal`/`solicitar_resgate_portal` → validam `auth.uid()` + `tipo` (023:53-66, 023:173-180).
- `token_transacoes` não tem policy de INSERT no estado final (dropadas em 022:266-267) — crédito/débito só via RPC com valor lido do servidor. `perfis.tokens_saldo` protegido por trigger (022:278-298). Esse desenho está certo.
- `enviar_indicacao_portal` lê o valor de tokens do servidor (`regras_tokens`), não confia no cliente. Correto.

---

## CRITICAL

### CR-01 — Todo novo usuário é criado como `tipo='interno'` (regressão do trigger `handle_new_user`)

**Arquivo:** `supabase/migrations/035_notificacoes_envios.sql:163-199` → `036_push_subscriptions.sql:78-115` → `037_cliente_docs.sql:162-199` (estado final)
**Referência do comportamento correto que foi perdido:** `021_lockdown_rls.sql:134-159`

A migration 021 endureceu o trigger para **nunca** criar `interno` a partir de metadata controlada pelo cliente:

```sql
desired_tipo := COALESCE(NEW.raw_user_meta_data->>'tipo', 'cliente');
IF desired_tipo = 'interno' THEN desired_tipo := 'cliente'; END IF;
INSERT INTO public.perfis (id, nome, email, tipo, cliente_id) VALUES (...);
```

As migrations 035, 036 e 037 fizeram `CREATE OR REPLACE FUNCTION public.handle_new_user()` copiando o corpo **da versão 011** (pré-hardening) e **apagaram as colunas `tipo` e `cliente_id` do INSERT**:

```sql
-- 037:177-179 — estado final em produção
INSERT INTO public.perfis (id, email, nome)
VALUES (new.id, new.email, default_name)
ON CONFLICT (id) DO NOTHING;
```

Sem `tipo` no INSERT, vale o **default da coluna**, definido em `015_portal_tokens.sql:7`:

```sql
ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'interno'
```

→ **Todo perfil criado desde a 035 nasce `tipo='interno'`.** E `is_interno()` (021:21) é o gate de praticamente todo o CRM.

**Cenário de falha concreto (não-autenticado → interno):**
1. Atacante extrai `VITE_SUPABASE_ANON_KEY` + URL do bundle JS (são públicas por design).
2. `POST /auth/v1/otp {"email":"atacante@gmail.com"}` — `signInWithOtp` cria usuário por padrão (`shouldCreateUser: true`); é exatamente a chamada que o próprio app faz em `src/pages/ClienteDetailPage.tsx:184`.
3. Trigger `on_auth_user_created` cria `perfis` com `tipo='interno'`.
4. Atacante clica no magic link do próprio e-mail → sessão `authenticated` válida.
5. `is_interno()` = `true`. Ele agora lê: todos os `leads` sem responsável, `parceiros`, `tarefas` (ver WR-01), `audit_logs`, `leads_lixeira` (snapshots JSONB **completos** de leads excluídos, com telefone/e-mail/notas), `token_transacoes` de todos, `objecoes`, `notificacoes_indicacao`. E escreve em tudo isso.

**Efeito colateral funcional (além da segurança):** o convite de portal (`ClienteDetailPage.tsx:184-189` envia `data: { tipo: 'cliente', cliente_id }`) é **ignorado** — clientes convidados viram `interno` com `cliente_id = NULL` e ganham acesso ao CRM em vez do Portal.

**Correção (nova migration 040):**

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_name TEXT;
  has_slack    BOOLEAN;
  desired_tipo TEXT;
BEGIN
  default_name := COALESCE(
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'nome'), ''),
    REPLACE(REPLACE(REPLACE(SPLIT_PART(new.email, '@', 1), '.', ' '), '_', ' '), '-', ' ')
  );

  -- Hardening 021: signup NUNCA cria interno via metadata do cliente.
  desired_tipo := COALESCE(new.raw_user_meta_data->>'tipo', 'cliente');
  IF desired_tipo <> 'cliente' THEN desired_tipo := 'cliente'; END IF;

  INSERT INTO public.perfis (id, email, nome, tipo, cliente_id)
  VALUES (
    new.id, new.email, default_name, desired_tipo,
    (new.raw_user_meta_data->>'cliente_id')::uuid
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',     jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'cadencia',   jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'renovacao',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'indicacao',  jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       'documentos', jsonb_build_object('slack', has_slack, 'email', true, 'push', false)
     )
   WHERE id = new.id;

  RETURN new;
END;
$$;

-- Trava o default da coluna (defesa em profundidade — se o INSERT do trigger
-- voltar a omitir `tipo`, o default seguro é 'cliente', não 'interno').
ALTER TABLE perfis ALTER COLUMN tipo SET DEFAULT 'cliente';
```

**Remediação obrigatória de dados (perfis já criados desde a 035):**

```sql
-- INSPECIONE ANTES de rodar o UPDATE:
SELECT id, email, tipo, role, cliente_id, created_at
  FROM perfis
 WHERE tipo = 'interno'
 ORDER BY created_at DESC;
-- Qualquer linha que não seja de um membro real da CONSEJ:
UPDATE perfis SET tipo = 'cliente', role = NULL WHERE id IN (...);
```

**Ação de configuração (fora do SQL):** no Supabase Dashboard → Authentication → Providers → Email, **desabilitar "Allow new users to sign up"**. Sem isso, o passo 2 do cenário continua aberto para qualquer bug futuro no trigger. O fluxo de convite de cliente deve migrar para `supabase.auth.admin.inviteUserByEmail` numa Edge Function com `service_role`, não `signInWithOtp` do browser.

---

### CR-02 — Escalação de privilégio: qualquer usuário pode se auto-promover a `interno`/`diretor` via UPDATE em `perfis`

**Arquivo:** `supabase/migrations/004_perfis.sql:21-22` (policy nunca revisada), colunas adicionadas em `015:7` (`tipo`) e `027:24` (`role`)

```sql
CREATE POLICY "usuário atualiza próprio perfil" ON perfis
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
```

A policy é **por linha, não por coluna**. Quando 015 adicionou `tipo` e 027 adicionou `role`/`gestor_id` na mesma tabela, essas colunas passaram a ser graváveis pelo próprio dono da linha. O único trigger que restringe colunas é `protect_tokens_columns` (022:278), que guarda **apenas** `tokens_saldo` e `tokens_historico_total`.

**Cenário de falha concreto (cliente do portal → diretor):**
```http
PATCH /rest/v1/perfis?id=eq.<meu_uid>
Authorization: Bearer <jwt do cliente do portal>
apikey: <anon key>
Content-Type: application/json

{"tipo": "interno", "role": "diretor"}
```
Passa no `WITH CHECK` (`auth.uid() = id`), passa no `CHECK` de coluna (`tipo IN ('interno','cliente')`, `role IN ('diretor',...)`). Depois disso: `is_interno()` = true e `is_diretor()` = true → `can_see_responsavel()` retorna `true` para **qualquer** target (029:35) → o cliente lê e escreve **100% de `leads`, `clientes`, `contratos`, `demandas`, `oportunidades`, `diagnosticos`, `reunioes`, `indicacoes`, `tarefas`, `audit_logs`, `leads_lixeira`**. É o comprometimento total da base.

O mesmo vale para o consultor: `{"role":"diretor"}` anula toda a hierarquia da 027/029.

**Correção (nova migration 040):**

```sql
CREATE OR REPLACE FUNCTION public.protect_perfil_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;                       -- SECURITY DEFINER / service_role
  END IF;

  IF NEW.tipo       IS DISTINCT FROM OLD.tipo
  OR NEW.role       IS DISTINCT FROM OLD.role
  OR NEW.gestor_id  IS DISTINCT FROM OLD.gestor_id
  OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
  OR NEW.id         IS DISTINCT FROM OLD.id THEN
    -- Só diretor pode mexer em tipo/role/gestor/cliente_id de qualquer perfil,
    -- e nunca no próprio role (evita auto-promoção mesmo de diretor comprometido).
    IF NOT public.is_diretor() OR NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'colunas de privilegio so podem ser alteradas por diretor (e nunca no proprio perfil)'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_perfil_privilege_columns_trigger ON perfis;
CREATE TRIGGER protect_perfil_privilege_columns_trigger
  BEFORE UPDATE ON perfis
  FOR EACH ROW EXECUTE FUNCTION public.protect_perfil_privilege_columns();

-- Fecha também o INSERT (004:18-19 permite o usuário inserir a própria linha
-- com tipo='interno' caso o trigger de auth falhe / a linha seja apagada).
DROP POLICY IF EXISTS "usuário gerencia próprio perfil" ON perfis;
-- perfis são criados exclusivamente pelo trigger on_auth_user_created (SECURITY DEFINER).
```

**Verificação pós-fix:** um teste em `tests/rls/` que autentica como `consultor` e tenta `update({ role: 'diretor' })` — deve receber erro `42501`.

---

### CR-03 — `interacoes_lead` continua com `USING (true)`: cliente do portal lê todo o histórico de abordagem dos leads

**Arquivo:** `supabase/migrations/013_interacoes_lead.sql:26-27`

```sql
CREATE POLICY "authenticated_all" ON interacoes_lead
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Nenhuma migration posterior dropa essa policy. A 021 fechou `leads`/`clientes`/`contratos`/…, a 029 fechou `reunioes`/`tarefas`/`diagnosticos`, a 033 refez `tarefas` — **`interacoes_lead` passou batido nas três**. A tabela contém `corpo` (texto integral da mensagem enviada), `assunto`, `telefone_usado`, `pipeline_antes/depois` e `lead_id`.

**Cenário de falha concreto:** um cliente do Portal de Indicações (perfil `tipo='cliente'`, sem nenhum acesso ao CRM) faz:
```http
GET /rest/v1/interacoes_lead?select=*  →  200 OK, dump completo
```
Recebe **todas as mensagens de prospecção da CONSEJ para todos os leads**, com telefones. Pior: `FOR ALL … WITH CHECK (true)` também permite **INSERT/UPDATE/DELETE** — o cliente pode apagar o histórico de interações (isso quebra a lixeira de leads e a cadência do `cron_resumo_diario`, que lê essa tabela em 034:87-115).

**Correção:**
```sql
DROP POLICY IF EXISTS "authenticated_all" ON interacoes_lead;

-- Espelha o escopo do lead pai (mesmo padrão de diagnosticos em 029:89-106)
CREATE POLICY "interno_role_aware_interacoes_lead" ON interacoes_lead
  FOR ALL TO authenticated
  USING (
    public.is_interno()
    AND EXISTS (SELECT 1 FROM leads l
                 WHERE l.id = interacoes_lead.lead_id
                   AND public.can_see_responsavel(l.responsavel_id))
  )
  WITH CHECK (
    public.is_interno()
    AND EXISTS (SELECT 1 FROM leads l
                 WHERE l.id = interacoes_lead.lead_id
                   AND public.can_see_responsavel(l.responsavel_id))
  );
```

---

### CR-04 — `configuracoes` com `USING (true) WITH CHECK (true)`: qualquer autenticado (inclusive cliente) escreve a configuração global do CRM

**Arquivo:** `supabase/migrations/008_configuracoes.sql:24`

```sql
CREATE POLICY configuracoes_auth ON configuracoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Linha única `id='default'` que hospeda `servicos` (catálogo/valores), `metas` (metas + pontuação da gamificação + `dias_para_aprovacao_pendente`), `mensagens` (templates), `alerta_renovacao_dias`.

**Cenário de falha concreto:** cliente do portal (ou consultor, que também não deveria) faz
`PATCH /rest/v1/configuracoes?id=eq.default {"servicos": [], "metas": {}, "mensagens": {}}`
→ zera o catálogo de serviços e as metas de todo o time; quebra `useConfiguracoes`, o ICP dinâmico (que lê `DEFAULT_SERVICOS`), o cron de aprovações (038:135-141 lê `metas->>'dias_para_aprovacao_pendente'`). Sem auditoria, porque não há trigger de audit nessa tabela.

**Correção:**
```sql
DROP POLICY IF EXISTS configuracoes_auth ON configuracoes;

CREATE POLICY "interno_select_configuracoes" ON configuracoes
  FOR SELECT TO authenticated USING (public.is_interno());

CREATE POLICY "gerente_update_configuracoes" ON configuracoes
  FOR UPDATE TO authenticated
  USING (public.is_at_least('gerente'))
  WITH CHECK (public.is_at_least('gerente'));
-- Sem INSERT/DELETE: a linha 'default' é única e imutável em identidade.
```

---

### CR-05 — `pos_juniors` com `USING (true)`: PII de ex-membros exposta a clientes do portal

**Arquivo:** `supabase/migrations/007_movement_features.sql:41`

```sql
CREATE POLICY pos_juniors_auth ON pos_juniors FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Tabela com `nome`, `email`, `telefone`, `empresa`, `cargo`, `linkedin`, `notas` de ex-consultores. Nunca fechada.

**Cenário de falha concreto:** cliente do portal → `GET /rest/v1/pos_juniors?select=*` → lista completa de e-mails e telefones de ex-membros da CONSEJ (LGPD). E `WITH CHECK (true)` permite que ele apague ou adultere a base.

**Correção:**
```sql
DROP POLICY IF EXISTS pos_juniors_auth ON pos_juniors;
CREATE POLICY "interno_all_pos_juniors" ON pos_juniors
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());
```

---

### CR-06 — `resgates`: INSERT direto do cliente contorna a RPC `solicitar_resgate_portal` (resgate sem saldo e sem débito)

**Arquivo:** `supabase/migrations/015_portal_tokens.sql:107-108` (policy nunca dropada; a 022 fechou `token_transacoes` mas **esqueceu** `resgates`)

```sql
CREATE POLICY "cliente insere resgates" ON resgates
  FOR INSERT TO authenticated WITH CHECK (perfil_id = auth.uid());
```

Toda a proteção econômica (checagem de `tokens_saldo >= custo_tokens`, débito atômico, registro em `token_transacoes`) vive **dentro** da RPC `solicitar_resgate_portal` (023:161-216). Mas a tabela alvo continua aceitando INSERT direto do cliente, e `tokens_debitados` é um `INTEGER` livre, sem CHECK contra `catalogo_recompensas.custo_tokens`.

**Cenário de falha concreto:** cliente com saldo 0 faz
```http
POST /rest/v1/resgates
{"perfil_id":"<meu_uid>","catalogo_id":"<id de 'Mês gratuito de assessoria' — 5500 tokens>","tokens_debitados":0,"status":"pendente"}
```
→ 201 Created. O resgate entra na fila de aprovação do `PortalAdminPage` exatamente como um legítimo; o saldo dele **não é debitado** e não há linha em `token_transacoes`. Um interno aprova achando que é normal → recompensa de R$ mil entregue de graça. Repetível N vezes.

**Correção:**
```sql
DROP POLICY IF EXISTS "cliente insere resgates" ON resgates;
-- INSERT em resgates passa a ser exclusivamente via solicitar_resgate_portal
-- (SECURITY DEFINER, roda como postgres → bypassa RLS legitimamente).

-- Defesa em profundidade: tokens_debitados deve casar com o catálogo.
ALTER TABLE resgates ADD CONSTRAINT resgates_tokens_conferem
  CHECK (tokens_debitados > 0);
```
Depois, auditar resgates já criados fora da RPC:
```sql
SELECT r.* FROM resgates r
 WHERE NOT EXISTS (
   SELECT 1 FROM token_transacoes t
    WHERE t.referencia_tipo = 'resgate' AND t.referencia_id = r.id AND t.tipo = 'debito'
 );
```

---

## WARNING

### WR-01 — 033 anula o escopo por role em `tarefas` (policies permissivas somam com OR)

**Arquivos:** `029_rls_role_aware.sql:111-128` + `033_rls_tarefas_notificar.sql:22-36`

A 029 criou `interno_role_aware_tarefas` (escopo: própria, de subordinado, ou sem dono). A 033 **não dropou** essa policy — dropou apenas a `authenticated_all` (que a 029 já havia dropado) e **adicionou** quatro policies novas com `USING (public.is_interno())` puro. Policies permissivas do mesmo comando são combinadas com **OR** → o `is_interno()` sozinho já satisfaz, e o escopo por role da 029 vira letra morta.

**Cenário:** consultor lê/edita/apaga **todas** as tarefas do time, inclusive as do diretor. Não é vazamento para fora da empresa, mas é a regressão silenciosa de um controle que a 029 alega implementar (e que `tests/rls/rls-role-aware.test.ts` presumivelmente afirma testar — vale verificar se o teste ainda passa por acidente).

**Correção:**
```sql
DROP POLICY IF EXISTS "interno_select_tarefas" ON tarefas;
DROP POLICY IF EXISTS "interno_insert_tarefas" ON tarefas;
DROP POLICY IF EXISTS "interno_update_tarefas" ON tarefas;
DROP POLICY IF EXISTS "interno_delete_tarefas" ON tarefas;
-- Mantém apenas interno_role_aware_tarefas (029:111). Se o refinamento por
-- operação for desejado, recriar as 4 policies COM o predicado de escopo:
--   USING (public.is_interno() AND (atribuido_a_id IS NULL
--          OR atribuido_a_id = auth.uid() OR public.is_diretor()
--          OR public.can_see_perfil(atribuido_a_id)))
```

### WR-02 — `can_see_responsavel(NULL) = true`: qualquer interno vê e escreve tudo que está sem responsável

**Arquivo:** `029_rls_role_aware.sql:34-38` (`OR target IS NULL`)

Aplicado a `leads`, `clientes`, `contratos`, `oportunidades`, `demandas`, `reunioes`. É uma decisão consciente (documentada no comentário 029:26), mas tem duas consequências não documentadas:

1. **Leitura:** `clientes.responsavel_id` e `contratos.responsavel_id` são nullable e só foram backfillados por match de nome (028:16-48) — tudo que não casou ficou `NULL` e é **visível a qualquer consultor**. O mesmo vale para todo lead importado (`ImportarPage`) sem responsável.
2. **Escrita:** o `WITH CHECK` usa o `responsavel_id` da **linha nova**. Um consultor pode fazer `UPDATE leads SET responsavel_id = NULL WHERE id = <lead que ele vê>` — a linha continua válida sob a policy — e depois qualquer um a enxerga. Também pode se auto-atribuir qualquer lead órfão.

**Correção sugerida:** backfillar responsáveis e trocar `OR target IS NULL` por um predicado explícito de "pool não atribuído" só para SELECT, com WITH CHECK exigindo `responsavel_id IS NOT NULL` em UPDATE:
```sql
-- exemplo p/ leads
CREATE POLICY "interno_role_aware_leads" ON leads
  FOR ALL TO authenticated
  USING (public.is_interno() AND public.can_see_responsavel(responsavel_id))
  WITH CHECK (public.is_interno()
              AND responsavel_id IS NOT NULL
              AND public.can_see_responsavel(responsavel_id));
```

### WR-03 — `cliente_docs`: o cliente pode adulterar `storage_path` e soft-deletar documentos do consultor

**Arquivo:** `037_cliente_docs.sql:111-139`

O `WITH CHECK` do branch do cliente valida `autor_tipo='interno' AND requer_aprovacao=true AND status IN ('aprovado','revisao_solicitada') AND cliente_id = <meu>`. Ele **não congela** as demais colunas. Como o `USING` já libera a linha inteira (qualquer doc da pasta dele), o cliente pode enviar um UPDATE que, além de setar `status='aprovado'`, troque `storage_path`, `nome_arquivo`, `versao`, `parent_doc_id` ou `deleted_at` — e o resultado ainda satisfaz o `WITH CHECK`.

**Cenário:** cliente faz `PATCH /rest/v1/cliente_docs?id=eq.<contrato enviado pelo consultor>` com `{"status":"aprovado","storage_path":"<path de outro doc>","deleted_at":"2026-07-13"}` → o registro de aprovação aponta para um arquivo diferente do que foi realmente aprovado, e o doc some da UI do consultor. Trilha de aprovação de contrato corrompida.

**Correção:** trigger `BEFORE UPDATE` que, quando `NOT public.is_interno()`, rejeita mudança em qualquer coluna que não seja `status` e `comentario_cliente`:
```sql
CREATE OR REPLACE FUNCTION public.protect_cliente_docs_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin') OR public.is_interno() THEN
    RETURN NEW;
  END IF;
  IF NEW.cliente_id       IS DISTINCT FROM OLD.cliente_id
  OR NEW.autor_id         IS DISTINCT FROM OLD.autor_id
  OR NEW.autor_tipo       IS DISTINCT FROM OLD.autor_tipo
  OR NEW.storage_path     IS DISTINCT FROM OLD.storage_path
  OR NEW.nome_arquivo     IS DISTINCT FROM OLD.nome_arquivo
  OR NEW.versao           IS DISTINCT FROM OLD.versao
  OR NEW.parent_doc_id    IS DISTINCT FROM OLD.parent_doc_id
  OR NEW.requer_aprovacao IS DISTINCT FROM OLD.requer_aprovacao
  OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'cliente so pode alterar status e comentario_cliente' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS protect_cliente_docs_cols_trigger ON cliente_docs;
CREATE TRIGGER protect_cliente_docs_cols_trigger
  BEFORE UPDATE ON cliente_docs FOR EACH ROW EXECUTE FUNCTION public.protect_cliente_docs_cols();
```

### WR-04 — Qualquer interno (consultor) reescreve a economia de tokens via `regras_tokens` / `catalogo_recompensas`

**Arquivos:** `016_regras_e_campanhas.sql:24-26`, `015_portal_tokens.sql:82-86`

Ambas as policies liberam `FOR ALL` para **qualquer** `tipo='interno'`, sem checar `role`. A 027/029 introduziram hierarquia mas não voltaram nessas tabelas.

**Cenário concreto:** consultor (menor role) faz `PATCH /rest/v1/regras_tokens?motivo=eq.indicacao {"valor_tokens": 100000}`; em seguida chama a RPC `enviar_indicacao_portal` (023:158 — a RPC aceita `tipo='interno'`), que lê o valor **do servidor** (agora adulterado) e credita 100.000 tokens a ele mesmo. Alternativamente: `PATCH /rest/v1/catalogo_recompensas?id=eq.<premium> {"custo_tokens": 1}` e resgata o prêmio premium com 1 token. A defesa "valor lido no servidor" da 022 é anulada porque o servidor lê de uma tabela que o atacante controla.

**Correção:**
```sql
DROP POLICY IF EXISTS "interno gerencia regras" ON regras_tokens;
CREATE POLICY "gerente_gerencia_regras" ON regras_tokens FOR ALL TO authenticated
  USING (public.is_at_least('gerente')) WITH CHECK (public.is_at_least('gerente'));

DROP POLICY IF EXISTS "interno gerencia catálogo" ON catalogo_recompensas;
CREATE POLICY "gerente_gerencia_catalogo" ON catalogo_recompensas FOR ALL TO authenticated
  USING (public.is_at_least('gerente')) WITH CHECK (public.is_at_least('gerente'));
-- idem "interno gerencia campanhas" (016:62) e "interno gerencia resgates" (015:110):
-- aprovação de resgate deveria ser coordenador+, não qualquer interno.
```

### WR-05 — `audit_logs`: qualquer interno insere linhas forjadas (campo `usuario` é livre)

**Arquivo:** `021_lockdown_rls.sql:109-110`

```sql
CREATE POLICY "interno_insert_audit_logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_interno());
```
`usuario`, `tabela`, `registro_id`, `acao`, `valor_antes/depois` vêm todos do cliente (os hooks em `src/hooks/` inserem direto). O append-only está correto (sem UPDATE/DELETE), mas a **autenticidade** não: um interno pode inserir 10.000 linhas atribuídas a `gabriel@consej.com` ou poluir o log para esconder uma ação real. Trilha de auditoria não é confiável como evidência.

**Correção:** `WITH CHECK (public.is_interno() AND usuario = (SELECT email FROM perfis WHERE id = auth.uid()))`, ou melhor: mover a escrita de audit para triggers `AFTER INSERT/UPDATE/DELETE` nas tabelas de origem (`SECURITY DEFINER`), e trocar a policy para `WITH CHECK (false)`.

### WR-06 — Storage do bucket `cliente-docs` não está no repositório (estado não auditável)

**Arquivo:** `037_cliente_docs.sql:27-29` — "Bucket cliente-docs + storage.objects RLS + Vault secret ficam FORA desta migration … aplicados manualmente".

A tabela `cliente_docs` tem RLS correta (modulo WR-03), mas **os arquivos** (propostas, contratos assinados) vivem em `storage.objects`. Não há **nenhuma** policy de storage para esse bucket versionada. Se o bucket foi criado com `public = true` (como `avatars` em 009:13), toda URL de contrato é legível por qualquer pessoa na internet que a adivinhe/vaze — e o `storage_path` é legível por qualquer autenticado que passe pelo `cliente_docs_select`.

**Verificar em produção agora:**
```sql
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'cliente-docs';
SELECT policyname, cmd, qual, with_check FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects';
```
Se `public = true` → `UPDATE storage.buckets SET public = false WHERE id = 'cliente-docs';` e versionar as policies (path `cliente-docs/<cliente_id>/…` casando com `perfis.cliente_id` ou `is_interno()` + responsável).

### WR-07 — Migrations 017 e 018 não existem no repositório

`supabase/migrations/` salta de `016_regras_e_campanhas.sql` para `019_notificacoes_indicacao.sql`. Ou foram aplicadas em produção e não commitadas (o banco tem objetos que ninguém audita), ou foram abandonadas. Em ambos os casos, o princípio declarado no CLAUDE.md — "migrações sequenciais e imutáveis; o repo é a verdade" — está quebrado, e **esta auditoria não pode afirmar que cobriu 100% do schema em produção**.

**Ação:** rodar `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;` e reconciliar com o repo. Comparar também `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;` contra o estado esperado deste relatório.

---

## INFO

### IN-01 — Funções `SECURITY DEFINER` sem authz interna e com `EXECUTE` implícito para `PUBLIC`
`public.quota_resend_atual()` (035:138) e `public.bucket_usage_bytes(TEXT)` (039:20) não checam o chamador. Em Postgres, `CREATE FUNCTION` concede `EXECUTE` a `PUBLIC` por padrão — o `GRANT … TO authenticated` explícito não revoga isso, então o role `anon` também pode chamá-las via PostgREST. O retorno é só agregado (contadores de e-mail, bytes no bucket), então o impacto é divulgação menor — mas o gate mencionado em 039:11 ("gated por RequireRole no client") é gate de UI, não de segurança. Sugestão: `REVOKE EXECUTE ON FUNCTION … FROM PUBLIC;` + `IF NOT public.is_at_least('coordenador') THEN RAISE EXCEPTION …`.

### IN-02 — `protect_tokens_columns()` (022:278) não é `SECURITY DEFINER` nem tem `SET search_path`
É um trigger que roda como invoker e só compara `current_user` com literais — não resolve nada em schema mutável, então o risco prático é nulo. Ainda assim, por consistência com as demais funções, adicionar `SET search_path = public`.

### IN-03 — Bucket `avatars` é público (`009:13, public = true`) com `SELECT TO public`
É intencional (fotos de perfil), mas significa que qualquer foto de perfil de membro é legível sem autenticação por quem tiver a URL. Aceitável; registrado para constar.

### IN-04 — URL do projeto Supabase hardcoded em 3 migrations
`031:27`, `034:40`, `038:44/129`. Não é segredo (a URL é pública), mas amarra as migrations a um projeto e impede staging sem edição. Mover para `configuracoes` ou para `current_setting('app.supabase_url')`.

---

## Ordem de correção sugerida

1. **CR-01 + CR-02 juntos, hoje** — são os dois caminhos independentes para "qualquer pessoa vira diretor". Enquanto qualquer um deles estiver aberto, corrigir os demais não muda o resultado final de um ataque.
2. Desabilitar signup público no Dashboard (parte do CR-01).
3. Auditar `SELECT id,email,tipo,role,created_at FROM perfis WHERE tipo='interno'` e rebaixar o que não for time.
4. CR-03, CR-04, CR-05 (três `DROP POLICY` + três `CREATE POLICY` — uma migration).
5. CR-06 e WR-04 (economia de tokens).
6. WR-01, WR-02, WR-03, WR-05.
7. WR-06 (verificação de storage) e WR-07 (reconciliação de migrations) — ambos exigem consultar produção.
8. Cobrir CR-01/CR-02/CR-03/CR-06 com testes em `tests/rls/` antes de fechar. O suite atual (`rls-role-aware.test.ts`) testa o escopo por role mas, pelo que se vê, não testa **auto-promoção** nem as tabelas esquecidas.

---

_Auditado: 2026-07-13_
_Escopo: estado final acumulado de supabase/migrations/001..039_
