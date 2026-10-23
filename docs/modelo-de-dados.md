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
