-- EventHubs · Fase 4: inscrições pagas com Mercado Pago, modelo marketplace.
--
-- Cada organização conecta a própria conta Mercado Pago (OAuth). O checkout é criado em nome
-- dela e o Mercado Pago retém a taxa do EventHubs (marketplace_fee): o valor nunca passa pelo
-- EventHubs.
--
-- Reserva: ingresso pago cria a inscrição em pending_payment com expires_at. A vaga conta
-- enquanto a reserva vale e deixa de contar no instante em que vence (sem job). A linha é
-- marcada expired na próxima inscrição do evento, sob a mesma trava.
--
-- Confirmação só pelo webhook. O servidor valida a assinatura, consulta o estado atual do
-- pagamento no Mercado Pago (o que resolve notificações repetidas e fora de ordem) e chama
-- public.record_payment, que só service_role executa.

-- Taxas de serviço e pagamento ficam na inscrição no momento do checkout.
alter table public.registrations
  add column expires_at timestamptz,
  add column platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  add column checkout_url text check (checkout_url is null or checkout_url ~ '^https://'),
  -- Conta Mercado Pago em nome da qual o checkout foi criado; o pagamento precisa ser dela.
  add column payment_seller_id text check (payment_seller_id is null or payment_seller_id ~ '^[0-9]{1,20}$'),
  add constraint registrations_pending_expires check (status <> 'pending_payment' or expires_at is not null);

-- Vagas ocupadas: confirmadas e reservas ainda válidas.
create or replace function private.active_registrations(p_event uuid, p_ticket uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.registrations r
   where r.event_id = p_event
     and (p_ticket is null or r.ticket_type_id = p_ticket)
     and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.expires_at > now()));
$$;

-- Conta conectada de cada organização. Fora da Data API (schema private); os tokens chegam
-- já cifrados pela aplicação (AES-256-GCM, chave fora do banco).
create table private.payment_accounts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_user_id text not null unique check (provider_user_id ~ '^[0-9]{1,20}$'),
  public_key text not null check (char_length(public_key) <= 200),
  access_token_enc text not null check (char_length(access_token_enc) <= 2000),
  refresh_token_enc text not null check (char_length(refresh_token_enc) <= 2000),
  token_expires_at timestamptz not null,
  live_mode boolean not null,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.payment_accounts from public, anon, authenticated;

-- Um registro por pagamento do Mercado Pago (uma inscrição pode ter tentativas recusadas
-- antes da aprovada). attention marca o que precisa de ação humana, como reembolso.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  external_id text not null check (external_id ~ '^[0-9]{1,20}$'),
  status text not null check (status in (
    'pending', 'in_process', 'authorized', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'in_mediation'
  )),
  status_detail text check (char_length(status_detail) <= 100),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (char_length(currency) = 3),
  platform_fee_cents integer not null default 0 check (platform_fee_cents >= 0),
  attention text check (attention in ('amount_mismatch', 'paid_without_seat', 'duplicate_payment', 'paid_after_cancellation')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_external_key unique (provider, external_id),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade
);

create index payments_event_created_idx on public.payments (event_id, created_at desc);
create index payments_registration_idx on public.payments (registration_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();

-- Notificações recebidas, para rastrear e não reprocessar a mesma notificação.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'mercadopago'),
  notification_id text not null check (char_length(notification_id) between 1 and 200),
  topic text not null check (char_length(topic) <= 60),
  external_id text check (char_length(external_id) <= 64),
  organization_id uuid references public.organizations (id) on delete cascade,
  result text check (char_length(result) <= 60),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_notification_key unique (provider, notification_id)
);

create or replace function private.payment_reader_roles()
returns public.organization_role[]
language sql
immutable
set search_path = ''
as $$
  select array['owner', 'admin', 'event_manager', 'report_viewer']::public.organization_role[];
$$;

revoke execute on function private.payment_reader_roles() from public, anon;
grant execute on function private.payment_reader_roles() to authenticated;

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Financeiro: quem administra eventos e quem vê relatórios. O operador de check-in não.
create policy payments_select_finance
  on public.payments for select
  to authenticated
  using (private.has_org_role(organization_id, private.payment_reader_roles()));

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
-- payment_events: sem política, só o sistema lê e escreve.
revoke all on public.payment_events from anon, authenticated;

-- Situação da conexão, para a tela de configurações (sem tokens).
create or replace function public.payment_account_status(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('provider_user_id', a.provider_user_id, 'live_mode', a.live_mode, 'connected_at', a.connected_at)
    from private.payment_accounts a
   where a.organization_id = p_org
     and private.has_org_role(p_org, array['owner', 'admin']::public.organization_role[]);
$$;

revoke execute on function public.payment_account_status(uuid) from public, anon;
grant execute on function public.payment_account_status(uuid) to authenticated;

-- Grava ou renova a conexão. Só o servidor (service_role), depois de conferir na sessão do
-- usuário que ele é owner/admin da organização e de trocar o código OAuth pelos tokens.
create or replace function public.save_payment_account(
  p_org uuid,
  p_provider_user_id text,
  p_public_key text,
  p_access_token_enc text,
  p_refresh_token_enc text,
  p_token_expires_at timestamptz,
  p_live_mode boolean,
  p_connected_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.payment_accounts (
    organization_id, provider_user_id, public_key, access_token_enc, refresh_token_enc, token_expires_at, live_mode, connected_by
  ) values (
    p_org, p_provider_user_id, p_public_key, p_access_token_enc, p_refresh_token_enc, p_token_expires_at, p_live_mode, p_connected_by
  )
  on conflict (organization_id) do update
    set provider_user_id = excluded.provider_user_id,
        public_key = excluded.public_key,
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        token_expires_at = excluded.token_expires_at,
        live_mode = excluded.live_mode,
        connected_by = coalesce(excluded.connected_by, private.payment_accounts.connected_by),
        connected_at = case when excluded.connected_by is null then private.payment_accounts.connected_at else now() end,
        updated_at = now();

  -- Renovação automática de token (sem usuário) não gera auditoria; conexão gera.
  if p_connected_by is not null then
    insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (p_org, p_connected_by, 'payments.connected', 'organization', p_org::text,
            jsonb_build_object('provider', 'mercadopago', 'provider_user_id', p_provider_user_id, 'live_mode', p_live_mode));
  end if;
end;
$$;

revoke execute on function public.save_payment_account(uuid, text, text, text, text, timestamptz, boolean, uuid) from public, anon, authenticated;
grant execute on function public.save_payment_account(uuid, text, text, text, text, timestamptz, boolean, uuid) to service_role;

-- Conta (com tokens cifrados) pela organização ou pelo vendedor do Mercado Pago.
create or replace function public.get_payment_account(p_org uuid default null, p_provider_user_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_id', a.organization_id, 'provider_user_id', a.provider_user_id, 'public_key', a.public_key,
    'access_token_enc', a.access_token_enc, 'refresh_token_enc', a.refresh_token_enc,
    'token_expires_at', a.token_expires_at, 'live_mode', a.live_mode
  )
  from private.payment_accounts a
  where a.organization_id = p_org or a.provider_user_id = p_provider_user_id;
$$;

revoke execute on function public.get_payment_account(uuid, text) from public, anon, authenticated;
grant execute on function public.get_payment_account(uuid, text) to service_role;

-- Inscrição pública, agora também paga. Mesmas regras da Fase 3; o que muda:
-- reservas vencidas do evento são marcadas expired sob a trava, e ingresso pago (só com
-- conta conectada) cria pending_payment com 30 minutos de reserva.
create or replace function public.register_for_event(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_form_version integer,
  p_answers jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_ticket public.ticket_types;
  v_form public.event_forms;
  v_existing public.registrations;
  v_name text;
  v_email text;
  v_token text;
  v_paid boolean;
begin
  if p_event_id is null or p_ticket_type_id is null or p_idempotency_key is null
     or jsonb_typeof(p_answers) is distinct from 'object' or pg_column_size(p_answers) > 16384 then
    raise exception 'INVALID_ANSWERS' using errcode = 'P0001';
  end if;

  -- Trava o evento: inscrições e pagamentos do mesmo evento passam por aqui um de cada vez.
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status = 'draft' then
    raise exception 'EVENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Repetição da mesma requisição devolve a inscrição já criada.
  select * into v_existing from public.registrations
   where event_id = v_event.id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('public_token', v_existing.public_token, 'status', v_existing.status);
  end if;

  if v_event.status <> 'published'
     or now() < v_event.registration_opens_at
     or now() >= v_event.registration_closes_at
     or now() >= v_event.ends_at then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.ticket_types
   where id = p_ticket_type_id and event_id = v_event.id and is_active;
  if not found
     or (v_ticket.sales_start_at is not null and now() < v_ticket.sales_start_at)
     or (v_ticket.sales_end_at is not null and now() >= v_ticket.sales_end_at) then
    raise exception 'TICKET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  v_paid := v_ticket.price_cents > 0;
  if v_paid and not exists (select 1 from private.payment_accounts a where a.organization_id = v_event.organization_id) then
    raise exception 'PAID_TICKET' using errcode = 'P0001';
  end if;

  -- A inscrição é sempre feita contra a versão vigente do formulário.
  select * into v_form from public.event_forms
   where event_id = v_event.id order by version desc limit 1;
  if v_form.version is distinct from p_form_version then
    raise exception 'FORM_OUTDATED' using errcode = 'P0001';
  end if;

  -- Respostas só com chaves do formulário, e todos os obrigatórios presentes.
  if exists (
       select 1 from jsonb_object_keys(p_answers) k
        where not exists (select 1 from jsonb_array_elements(v_form.fields) f where f ->> 'key' = k)
     )
     or exists (
       select 1 from jsonb_array_elements(v_form.fields) f
        where (f ->> 'required')::boolean
          and (p_answers -> (f ->> 'key') is null
               or p_answers -> (f ->> 'key') in ('""'::jsonb, 'false'::jsonb, '[]'::jsonb, 'null'::jsonb))
     ) then
    raise exception 'INVALID_ANSWERS' using errcode = 'P0001';
  end if;

  select btrim(p_answers ->> (f ->> 'key')) into v_name
    from jsonb_array_elements(v_form.fields) f where f ->> 'type' = 'name' limit 1;
  select lower(btrim(p_answers ->> (f ->> 'key'))) into v_email
    from jsonb_array_elements(v_form.fields) f where f ->> 'type' = 'email' limit 1;
  if coalesce(char_length(v_name), 0) not between 1 and 120
     or v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'INVALID_ANSWERS' using errcode = 'P0001';
  end if;

  -- Reservas vencidas liberam vaga e e-mail.
  update public.registrations
     set status = 'expired'
   where event_id = v_event.id and status = 'pending_payment' and expires_at <= now();

  if exists (
    select 1 from public.registrations
     where event_id = v_event.id and attendee_email = v_email and status in ('pending_payment', 'confirmed')
  ) then
    raise exception 'ALREADY_REGISTERED' using errcode = 'P0001';
  end if;

  -- Capacidade global (todos os ingressos) e limite próprio do ingresso, sob a trava acima.
  if private.active_registrations(v_event.id) >= v_event.capacity then
    raise exception 'SOLD_OUT' using errcode = 'P0001';
  end if;
  if v_ticket.quantity_limit is not null
     and private.active_registrations(v_event.id, v_ticket.id) >= v_ticket.quantity_limit then
    raise exception 'TICKET_SOLD_OUT' using errcode = 'P0001';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.registrations (
    organization_id, event_id, ticket_type_id, form_id, status, attendee_name, attendee_email,
    answers, price_cents, public_token, idempotency_key, confirmed_at, expires_at
  ) values (
    v_event.organization_id, v_event.id, v_ticket.id, v_form.id,
    case when v_paid then 'pending_payment' else 'confirmed' end::public.registration_status,
    v_name, v_email, p_answers, v_ticket.price_cents, v_token, p_idempotency_key,
    case when v_paid then null else now() end,
    case when v_paid then now() + interval '30 minutes' end
  );

  return jsonb_build_object('public_token', v_token, 'status', case when v_paid then 'pending_payment' else 'confirmed' end);
end;
$$;

-- Dados para criar ou retomar o checkout, pelo token da inscrição (só servidor).
create or replace function public.checkout_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_id', r.id, 'organization_id', r.organization_id, 'public_token', r.public_token,
    'payable', r.status = 'pending_payment' and r.expires_at > now(),
    'expires_at', r.expires_at, 'price_cents', r.price_cents, 'currency', r.currency,
    'checkout_url', r.checkout_url, 'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'ticket', jsonb_build_object('id', t.id, 'name', t.name),
    'event', jsonb_build_object('title', e.title, 'slug', e.slug),
    'organization', jsonb_build_object('slug', o.slug)
  )
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  join public.ticket_types t on t.id = r.ticket_type_id
  where p_token ~ '^[0-9a-f]{64}$' and r.public_token = p_token;
$$;

revoke execute on function public.checkout_context(text) from public, anon, authenticated;
grant execute on function public.checkout_context(text) to service_role;

create or replace function public.set_checkout(p_registration_id uuid, p_checkout_url text, p_platform_fee_cents integer, p_seller_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.registrations
     set checkout_url = p_checkout_url, platform_fee_cents = p_platform_fee_cents, payment_seller_id = p_seller_id
   where id = p_registration_id and status = 'pending_payment';
$$;

revoke execute on function public.set_checkout(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.set_checkout(uuid, text, integer, text) to service_role;

-- Registra a notificação. Devolve false se ela já foi processada (repetição).
create or replace function public.begin_payment_event(p_notification_id text, p_topic text, p_external_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed timestamptz;
begin
  insert into public.payment_events (provider, notification_id, topic, external_id)
  values ('mercadopago', p_notification_id, p_topic, p_external_id)
  on conflict (provider, notification_id) do nothing;
  select processed_at into v_processed from public.payment_events
   where provider = 'mercadopago' and notification_id = p_notification_id;
  return v_processed is null;
end;
$$;

create or replace function public.finish_payment_event(p_notification_id text, p_result text, p_org uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
     set processed_at = now(), result = p_result, organization_id = p_org
   where provider = 'mercadopago' and notification_id = p_notification_id;
$$;

revoke execute on function public.begin_payment_event(text, text, text) from public, anon, authenticated;
revoke execute on function public.finish_payment_event(text, text, uuid) from public, anon, authenticated;
grant execute on function public.begin_payment_event(text, text, text) to service_role;
grant execute on function public.finish_payment_event(text, text, uuid) to service_role;

-- Aplica o estado atual de um pagamento consultado no Mercado Pago. Idempotente: chamar de
-- novo com o mesmo estado não muda nada. Nunca confirma inscrição sem vaga: pagamento aprovado
-- sem vaga fica marcado para reembolso (attention), e quem decide é a organização.
create or replace function public.record_payment(
  p_registration_id uuid,
  p_seller_id text,
  p_external_id text,
  p_status text,
  p_status_detail text,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_event public.events;
  v_ticket public.ticket_types;
  v_pay public.payments;
  v_attention text;
  v_result text := 'recorded';
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'UNKNOWN_REFERENCE' using errcode = 'P0001';
  end if;
  -- Mesma trava de register_for_event: vagas são contadas com a fila do evento parada.
  select * into v_event from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.registrations where id = p_registration_id;

  -- O pagamento precisa ser da conta em nome da qual o checkout foi criado.
  if v_reg.payment_seller_id is null or v_reg.payment_seller_id <> p_seller_id then
    raise exception 'SELLER_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.payments (
    organization_id, event_id, registration_id, external_id, status, status_detail, amount_cents, currency,
    platform_fee_cents, approved_at
  ) values (
    v_reg.organization_id, v_reg.event_id, v_reg.id, p_external_id, p_status, left(p_status_detail, 100), p_amount_cents,
    p_currency, v_reg.platform_fee_cents, case when p_status = 'approved' then now() end
  )
  on conflict (provider, external_id) do update
    -- Duas notificações processadas em paralelo podem chegar invertidas: um estado em
    -- andamento nunca sobrescreve um estado final.
    set status = case
          when public.payments.status in ('approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
           and excluded.status in ('pending', 'in_process', 'authorized') then public.payments.status
          else excluded.status
        end,
        status_detail = excluded.status_detail,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        approved_at = coalesce(public.payments.approved_at, excluded.approved_at)
    where public.payments.registration_id = excluded.registration_id
  returning * into v_pay;
  if v_pay.id is null then
    raise exception 'REFERENCE_MISMATCH' using errcode = 'P0001';
  end if;

  if p_status = 'approved' and v_pay.attention is null then
    if p_currency <> v_reg.currency or p_amount_cents <> v_reg.price_cents then
      v_attention := 'amount_mismatch';
    elsif v_reg.status = 'confirmed' then
      if exists (
        select 1 from public.payments p
         where p.registration_id = v_reg.id and p.status = 'approved' and p.attention is null and p.id <> v_pay.id
      ) then
        v_attention := 'duplicate_payment';
      else
        v_result := 'already_confirmed';
      end if;
    elsif v_reg.status in ('cancelled', 'refunded') then
      v_attention := 'paid_after_cancellation';
    elsif v_reg.status = 'pending_payment' and v_reg.expires_at > now() then
      v_result := 'confirmed';
    else
      -- Reserva vencida: confirma só se ainda houver vaga e o e-mail não tiver outra inscrição ativa.
      select * into v_ticket from public.ticket_types where id = v_reg.ticket_type_id;
      if private.active_registrations(v_event.id) < v_event.capacity
         and (v_ticket.quantity_limit is null or private.active_registrations(v_event.id, v_ticket.id) < v_ticket.quantity_limit)
         and not exists (
           select 1 from public.registrations r
            where r.event_id = v_event.id and r.attendee_email = v_reg.attendee_email and r.id <> v_reg.id
              and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.expires_at > now()))
         ) then
        v_result := 'confirmed_late';
      else
        v_attention := 'paid_without_seat';
      end if;
    end if;

    if v_result in ('confirmed', 'confirmed_late') then
      update public.registrations set status = 'confirmed', confirmed_at = now() where id = v_reg.id;
    end if;
  elsif p_status in ('refunded', 'charged_back') and v_pay.attention is null and v_reg.status = 'confirmed' then
    update public.registrations set status = 'refunded', cancelled_at = now() where id = v_reg.id;
    v_result := 'refunded';
  end if;

  if v_attention is not null then
    update public.payments set attention = v_attention where id = v_pay.id;
    v_result := v_attention;
  end if;

  if v_result <> 'recorded' and v_result <> 'already_confirmed' then
    insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (v_reg.organization_id, null, 'payment.' || v_result, 'registration', v_reg.id::text,
            jsonb_build_object('external_id', p_external_id, 'status', p_status));
  end if;

  return jsonb_build_object('result', v_result, 'organization_id', v_reg.organization_id);
end;
$$;

revoke execute on function public.record_payment(uuid, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, text, text, text, text, integer, text) to service_role;

-- Página do participante: reserva vencida aparece como expirada mesmo antes de ser marcada,
-- e a inscrição pendente mostra o prazo da reserva.
create or replace function public.get_registration(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case when r.status = 'pending_payment' and r.expires_at <= now() then 'expired' else r.status::text end,
    'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'created_at', r.created_at, 'confirmed_at', r.confirmed_at, 'cancelled_at', r.cancelled_at,
    'price_cents', r.price_cents, 'expires_at', r.expires_at,
    'checkin_code', case when r.status = 'confirmed' and e.status <> 'cancelled' then r.checkin_code end,
    'ticket', jsonb_build_object('name', t.name),
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'status', e.status, 'format', e.format,
      'venue_name', e.venue_name, 'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'timezone', e.timezone, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
      'online_url', case when r.status = 'confirmed' and e.status <> 'cancelled' then e.online_url end
    )
  )
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  join public.ticket_types t on t.id = r.ticket_type_id
  where p_token ~ '^[0-9a-f]{64}$' and r.public_token = p_token;
$$;

-- Página pública: informa se a organização aceita pagamento online.
create or replace function private.event_public_payload(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'payments_enabled', exists (select 1 from private.payment_accounts a where a.organization_id = o.id),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'description', e.description,
      'cover_image_url', e.cover_image_url, 'format', e.format, 'venue_name', e.venue_name,
      'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
      'registration_opens_at', e.registration_opens_at, 'registration_closes_at', e.registration_closes_at,
      'capacity', e.capacity, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
      'participant_terms', e.participant_terms, 'status', e.status,
      'remaining', greatest(e.capacity - private.active_registrations(e.id), 0)
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents,
               'currency', t.currency, 'sales_start_at', t.sales_start_at, 'sales_end_at', t.sales_end_at,
               'min_per_order', t.min_per_order, 'max_per_order', t.max_per_order,
               'sold_out', t.quantity_limit is not null and private.active_registrations(e.id, t.id) >= t.quantity_limit
             ) order by t.position, t.created_at)
        from public.ticket_types t
       where t.event_id = e.id and t.is_active
    ), '[]'::jsonb),
    'form', (
      select jsonb_build_object('version', f.version, 'fields', f.fields)
        from public.event_forms f
       where f.event_id = e.id
       order by f.version desc
       limit 1
    )
  )
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.id = p_event;
$$;
