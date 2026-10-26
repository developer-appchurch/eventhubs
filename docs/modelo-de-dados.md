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

## Fase 3 · inscrições

| Tabela | Conteúdo |
| --- | --- |
| `registrations` | um participante por inscrição: evento, ingresso (FK composta com o evento), versão do formulário (`form_id`), status, nome, e-mail (minúsculo), respostas (`answers` jsonb por chave estável), preço aplicado em centavos e moeda, token público aleatório (64 hex), chave de idempotência, origem e datas |

Decisões:

- **Respostas em jsonb, não em `registration_answers`:** cada inscrição aponta para uma versão imutável do formulário, então a chave estável + a versão já dão o significado; uma tabela por resposta só vale quando houver relatório por campo.
- **Capacidade:** sem contador. A função trava a linha do evento e conta as inscrições ativas (`pending_payment` e `confirmed`) com índice parcial. Simples e provado por teste concorrente; trocar por contador se a contagem ficar lenta em eventos muito grandes.
- **Duplicidade:** no máximo uma inscrição ativa por e-mail por evento (índice único parcial). Cancelada ou expirada libera o e-mail.
- **Status:** `pending_payment`, `confirmed`, `cancelled`, `expired`, `refunded`. Nesta fase só `confirmed` é criado; o estado financeiro fica em `payments` (Fase 4).
- A capacidade do evento não pode ser reduzida abaixo das vagas ocupadas, e ingresso com inscrições não pode ser apagado (desativar).

## Fase 5 · participantes e check-in

| Tabela / coluna | Papel | Observações |
| --- | --- | --- |
| `registrations.checkin_code` | Código do QR | 128 bits aleatórios, único, separado de `public_token`. O QR leva o link `/app/<org>/events/<evento>/checkin?code=<código>`, que só abre para a equipe logada. |
| `checkins` | Presença | Uma linha por inscrição (`unique registration_id`): o primeiro registro é preservado. Guarda método (`qr` ou `manual`), operador (`checked_in_by`) e horário. |

- Presença por evento e filtros "presentes/ausentes" vêm de junção com `checkins`, sem contador separado.
- Exportação CSV usa `;` e BOM UTF-8 (Excel em português) e neutraliza células que começam com `= + - @`, tab ou CR.

## E-mail de confirmação

| Tabela | Papel | Observações |
| --- | --- | --- |
| `notifications` | Estado de cada e-mail | `unique (registration_id, kind)`: a mesma confirmação nunca sai duas vezes. Guarda `sending`/`sent`/`failed`, tentativas, id do provedor e erro (sem conteúdo da resposta). |

- Inscrição gratuita: o e-mail sai depois da resposta (`after()` do Next.js), sem atrasar a página. O QR vai como imagem PNG inline (`cid:`), com o código em texto e o link da página da inscrição, que também mostra o QR.
- Sem `RESEND_API_KEY`, `EMAIL_FROM` e `SUPABASE_SECRET_KEY`, nada é enviado e nada é registrado como enviado.

## Fase 4 · pagamentos

| Tabela / coluna | Papel | Observações |
| --- | --- | --- |
| `registrations.expires_at` | Fim da reserva de ingresso pago | Obrigatório em `pending_payment`. Reserva vencida deixa de contar na capacidade imediatamente. |
| `registrations.platform_fee_cents`, `checkout_url`, `payment_seller_id` | Checkout criado | Taxa calculada no servidor; o pagamento precisa ser da conta em `payment_seller_id`. |
| `private.payment_accounts` | Conta Mercado Pago da organização | Uma por organização; `provider_user_id` único. Tokens cifrados (AES-256-GCM). |
| `payments` | Um registro por pagamento do Mercado Pago | `unique (provider, external_id)`. Centavos e moeda explícitos. `attention` marca o que exige ação humana. |
| `payment_events` | Notificações recebidas | `unique (provider, notification_id)` com `x-request-id`; `processed_at` evita reprocessar. |

Detalhes do fluxo e das regras de reconciliação: `docs/pagamentos.md`.
