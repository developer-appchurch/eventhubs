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

## Fase 3 · inscrições

| Tabela | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| `registrations` | owner, admin, event_manager e checkin_operator da organização (`private.registration_reader_roles`) | sem grant para ninguém; só `register_for_event` grava |

`report_viewer` não vê dados pessoais dos inscritos. `anon` não tem grant na tabela. Funções:

- `register_for_event` (anon e authenticated, SECURITY DEFINER): trava a linha do evento (`FOR UPDATE`), confere status/prazo, ingresso ativo do mesmo evento e período de vendas, preço 0 (pago fica para a Fase 4), versão vigente do formulário, chaves e obrigatórios das respostas, nome/e-mail, duplicidade e só então conta vagas (capacidade global e limite do ingresso) e insere. Idempotente por `(event_id, idempotency_key)`.
- `get_registration(token)` (anon e authenticated): devolve só a inscrição do token de 64 hex; token inválido ou inexistente devolve null.
- `private.active_registrations` não é executável por clientes.

Testes: `tests/security/registrations.test.ts` (inclui 20 inscrições simultâneas para 5 vagas e limite de ingresso concorrente). Remoto (eventhubs-dev, transação revertida): inscrição confirmada, segunda inscrição na última vaga recusada com `SOLD_OUT`, consulta por token ok, `anon` sem acesso à tabela. Advisor: só os avisos já aceitos de funções públicas SECURITY DEFINER.

## Fase 5 · check-in

- `checkins`: RLS ativa; SELECT para `private.registration_reader_roles()` (owner, admin, event_manager, checkin_operator). Nenhuma escrita direta (`revoke all`, só `select` para authenticated).
- `check_in(p_event_id, p_code, p_registration_id)` (authenticated, SECURITY DEFINER): exige sessão, papel de leitor de inscrições na organização do evento (inexistente e sem permissão respondem `FORBIDDEN`), evento fora de rascunho/cancelado, inscrição do próprio evento (código de outro evento = `CHECKIN_NOT_FOUND`) e confirmada. `insert ... on conflict do nothing`: leituras simultâneas geram um único check-in, e as seguintes devolvem `already_checked_in` com horário e operador originais. Grava `registration.checked_in` em `audit_logs`.
- `event_report(p_event_id)` (authenticated, SECURITY DEFINER): exige sessão e papel de `private.payment_reader_roles()` (owner, admin, gestor de eventos, visualizador de relatórios); inexistente e sem permissão respondem `FORBIDDEN`. Devolve só agregados (contagens por status, presença, por ingresso, confirmações por dia e totais do financeiro), nenhum dado pessoal.
- `organization_overview(p_org)` (authenticated, SECURITY DEFINER): mesmas regras de `event_report`, para a organização. Devolve só agregados para os gráficos da visão geral: inscrições confirmadas e aguardando pagamento dos 8 eventos mais recentes, e confirmadas por forma de pagamento (gratuita, Pix, cartão, outras). A forma vem de `payments.method`, gravada pelo webhook a partir do Mercado Pago.
- `get_registration` passa a devolver `checkin_code` só para inscrição confirmada em evento não cancelado.
- Exportação CSV (`/registrations/export`) só para quem administra eventos; o operador de check-in vê a lista, mas não exporta.

## E-mail de confirmação

- `notifications`: RLS ativa; SELECT para `private.registration_reader_roles()`. Sem escrita direta.
- `claim_confirmation_email(p_registration_id, p_token)` e `finish_confirmation_email(...)`: só `service_role`. O servidor usa a chave secreta apenas para essas duas chamadas. `claim` só devolve dados de inscrição confirmada em evento não cancelado, e só uma vez (ou de novo depois de falha).

## Fase 4 · pagamentos

- `private.payment_accounts`: fora da Data API, `revoke all` de anon/authenticated. Tokens cifrados pela aplicação.
- `payments`: RLS ativa; SELECT para `private.payment_reader_roles()` (owner, admin, event_manager, report_viewer). Sem escrita direta.
- `payment_events`: RLS ativa sem políticas: só funções do sistema.
- Só `service_role`: `save_payment_account`, `get_payment_account`, `checkout_context`, `set_checkout`, `begin_payment_event`, `finish_payment_event`, `record_payment`. O servidor usa a chave secreta apenas para essas chamadas, depois de validar sessão e papel (conexão) ou a assinatura do webhook.
- `payment_account_status` (authenticated): só owner/admin da organização, sem tokens.
- `register_for_event` (anon): ingresso pago só com conta conectada; cria `pending_payment` com 30 minutos e marca como `expired` as reservas vencidas do evento, sob a trava.
