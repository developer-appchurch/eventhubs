# Modelo de dados (fase 1)

| Tabela | Finalidade | Chaves e constraints principais |
|---|---|---|
| `profiles` | Nome do usuário, uma linha por `auth.users` | PK = `auth.users.id`, `full_name` até 120 |
| `organizations` | Organização (tenant) | `slug` único com regex `^[a-z0-9]+(-[a-z0-9]+)*$` e 3–60 caracteres; `name` 2–120 |
| `organization_members` | Vínculo usuário–organização com papel e situação | PK composta (`organization_id`, `user_id`); enums `organization_role` e `membership_status` |
| `audit_logs` | Ações administrativas | `action`, `metadata` limitado a 4 KB, índice `(organization_id, created_at desc)` |

**Papéis (`organization_role`):** `owner`, `admin`, `event_manager`, `checkin_operator`, `report_viewer`.

**Situação:** `active` ou `suspended`. Apenas membros `active` passam pelas funções de autorização.

**Funções:**

- `private.has_org_role(org, roles[])` e `private.is_active_member(org)`: `SECURITY DEFINER`, `search_path` vazio, executáveis só por `authenticated`.
- `public.create_organization(name, slug)`: cria organização, proprietário e auditoria.
- `public.list_organization_members(org)`: diretório de membros com nome; exige vínculo ativo.
- Trigger `protect_last_owner`: impede remover ou rebaixar o último proprietário ativo.

**Dinheiro e tempo:** nenhum campo monetário nesta fase. Datas são `timestamptz` em UTC; o fuso do evento virá na fase 2.

**Retenção:** dados de conta são removidos em cascata com `auth.users`. A política de retenção de logs e de dados de inscritos será definida antes da fase 3 (ver `docs/seguranca.md`).

**Ainda não modelado:** eventos, formulários, tipos de ingresso, inscrições, participantes, pagamentos, check-ins e notificações.

## Fase 2 · eventos, ingressos e formulários

Migrations `20261023000400` a `20261023000700`.

| Tabela | Papel | Observações |
| --- | --- | --- |
| `events` | Evento de uma organização | `slug` único por organização e fixo após a primeira publicação; datas em UTC (`timestamptz`) com `timezone` IANA para exibição; `capacity` global (1 a 1.000.000); `status` só muda por `change_event_status`. |
| `ticket_types` | Tipos de ingresso | Preço em centavos (`price_cents`) e moeda explícita (`BRL`); `quantity_limit` é o teto do tipo e não substitui a capacidade global do evento. |
| `form_fields` | Definição atual do formulário | `key` é o identificador estável; ordem por `position`; opções obrigatórias (≥ 2) para tipos de seleção. Escrita só por `save_event_form`. |
| `event_forms` | Versões imutáveis do formulário | Nova versão a cada alteração salva e na publicação; a inscrição (Fase 3) vai referenciar a versão respondida. |

Todas as tabelas filhas usam FK composta `(event_id, organization_id) → events (id, organization_id)`, de modo que um registro nunca aponta para evento de outra organização.

Ciclo de status (`private.event_transition_allowed`, espelhado em `src/modules/events/status.ts` e comparado por teste):

- `draft` → `published`, `cancelled`
- `published` → `draft` (despublicar), `registration_closed`, `ended`, `cancelled`
- `registration_closed` → `published` (reabrir), `ended`, `cancelled`
- `ended` e `cancelled` são finais: o evento, seus ingressos e o formulário deixam de aceitar edição.

Publicar exige término no futuro, local preenchido em evento presencial/híbrido e ao menos um ingresso ativo. A página pública também considera as datas: passado o encerramento das inscrições ela mostra "inscrições encerradas" mesmo que o status ainda seja `published`.
