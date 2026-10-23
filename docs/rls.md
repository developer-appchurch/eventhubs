# Políticas RLS e grants

Princípio: negar por padrão. Toda tabela de `public` tem RLS habilitado (verificado por teste) e nenhum privilégio para `anon`.

## Grants

| Tabela | anon | authenticated |
|---|---|---|
| `profiles` | nenhum | SELECT; UPDATE apenas em `full_name` |
| `organizations` | nenhum | SELECT; UPDATE apenas em `name` |
| `organization_members` | nenhum | SELECT; UPDATE apenas em `role`, `status`; DELETE |
| `audit_logs` | nenhum | SELECT |

Não há INSERT direto para usuários em nenhuma tabela. `default privileges` de `public` foram revogados para novas tabelas.

## Políticas

| Tabela | Operação | Quem | Condição |
|---|---|---|---|
| profiles | SELECT | próprio usuário | `id = auth.uid()` |
| profiles | UPDATE | próprio usuário | `id = auth.uid()` (USING e WITH CHECK) |
| organizations | SELECT | membro ativo | `is_active_member(id)` |
| organizations | UPDATE | owner, admin | `has_org_role(id, owner/admin)` (USING e WITH CHECK) |
| organization_members | SELECT | membro ativo da organização | `is_active_member(organization_id)` |
| organization_members | UPDATE | owner | `has_org_role(organization_id, owner)` (USING e WITH CHECK) |
| organization_members | DELETE | owner | `has_org_role(organization_id, owner)` |
| audit_logs | SELECT | owner, admin | `has_org_role(organization_id, owner/admin)` |

Notas:

- UPDATE tem verificação de linha lida (USING) e de estado novo (WITH CHECK).
- Colunas de identidade (`id`, `organization_id`, `user_id`, `created_by`) não são graváveis pelo cliente, mesmo com política permissiva: o grant de coluna nega antes.
- Escrita em `audit_logs` só acontece dentro de funções do sistema.

## Funções privilegiadas

Todas usam `SECURITY DEFINER` e `SET search_path = ''`, com referências qualificadas. Execução revogada de `PUBLIC` e `anon`.

## Como verificar

`npm run test:db` cobre isolamento entre organizações, papéis, tentativas de alterar `organization_id`/`created_by`, `anon`, RLS habilitado em todas as tabelas, grants de `anon` e `search_path` das funções.

Projeto remoto `eventhubs-dev` (sa-east-1, ref `mdabmyxbjrgjoblngfzq`): as três migrations foram aplicadas e a RLS está habilitada nas quatro tabelas. `get_advisors` (security) retornou dois avisos, ambos aceitos de forma intencional:

- `create_organization` e `list_organization_members` são `SECURITY DEFINER` e executáveis por `authenticated`. Isso é o desenho: as duas funções verificam `auth.uid()` e o vínculo ativo antes de agir, e não são executáveis por `anon`.

Limitação: o acesso anônimo à Data API não foi verificado a partir do ambiente de desenvolvimento, porque a política de rede bloqueia o host do Supabase. Repetir esta verificação a partir de um ambiente com acesso.

## Fase 2 · eventos

| Tabela | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `events` | membros ativos | owner, admin, event_manager da organização | mesmos papéis; colunas `status`, `published_at`, `cancelled_at`, `created_by` e `organization_id` sem grant | mesmos papéis, só rascunho nunca publicado |
| `ticket_types` | membros ativos | owner, admin, event_manager, evento não encerrado/cancelado (`private.can_edit_event`) | idem | idem |
| `form_fields` | membros ativos | sem grant (só `save_event_form`) | sem grant | sem grant |
| `event_forms` | membros ativos | sem grant (versões gravadas por função) | sem grant | sem grant |

`anon` não tem grant em nenhuma dessas tabelas. O público lê eventos apenas por `get_public_event` e `list_public_events` (SECURITY DEFINER, `search_path` vazio), que nunca devolvem rascunhos nem colunas internas (`created_by`, `online_url`). `get_event_preview` exige membro ativo. `change_event_status` e `save_event_form` exigem owner/admin/event_manager, travam a linha do evento e gravam auditoria.

Testes: `tests/security/events-rls.test.ts` (isolamento entre organizações, papéis, manipulação de `organization_id`, acesso anônimo, ciclo de status e versões do formulário).
