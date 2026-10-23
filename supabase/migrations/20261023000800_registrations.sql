-- EventHubs · Fase 3: inscrições gratuitas com capacidade global.
--
-- Uma inscrição = um participante, um tipo de ingresso. A única porta de escrita é
-- public.register_for_event, que trava a linha do evento (FOR UPDATE) e só então conta as
-- vagas ocupadas: duas requisições pela última vaga ficam em fila e a segunda vê a primeira.
--
-- Política de duplicidade: um mesmo e-mail tem no máximo uma inscrição ativa (confirmada ou
-- aguardando pagamento) por evento. Inscrição cancelada ou expirada libera o e-mail.

create type public.registration_status as enum ('pending_payment', 'confirmed', 'cancelled', 'expired', 'refunded');

-- Permite a FK composta (ticket_type_id, event_id): o ingresso precisa ser do mesmo evento.
alter table public.ticket_types add constraint ticket_types_id_event_key unique (id, event_id);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  ticket_type_id uuid not null,
  form_id uuid not null references public.event_forms (id),
  status public.registration_status not null,
  attendee_name text not null check (char_length(attendee_name) between 1 and 120),
  attendee_email text not null check (char_length(attendee_email) between 3 and 254 and attendee_email = lower(attendee_email)),
  -- Respostas por identificador estável do campo, interpretadas pela versão em form_id.
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 16384),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  -- Referência pública: 256 bits aleatórios, nunca derivada do id.
  public_token text not null unique check (public_token ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null,
  source text not null default 'public_page' check (char_length(source) <= 40),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  foreign key (ticket_type_id, event_id) references public.ticket_types (id, event_id),
  constraint registrations_idempotency_key unique (event_id, idempotency_key)
);

create unique index registrations_active_email_key
  on public.registrations (event_id, attendee_email)
  where status in ('pending_payment', 'confirmed');
create index registrations_event_created_idx on public.registrations (event_id, created_at desc);
create index registrations_ticket_active_idx
  on public.registrations (ticket_type_id)
  where status in ('pending_payment', 'confirmed');

create trigger registrations_set_updated_at
  before update on public.registrations
  for each row execute function private.set_updated_at();

-- Quem vê dados pessoais dos inscritos: quem administra o evento e quem fará o check-in.
create or replace function private.registration_reader_roles()
returns public.organization_role[]
language sql
immutable
set search_path = ''
as $$
  select array['owner', 'admin', 'event_manager', 'checkin_operator']::public.organization_role[];
$$;

revoke execute on function private.registration_reader_roles() from public, anon;
grant execute on function private.registration_reader_roles() to authenticated;

alter table public.registrations enable row level security;

create policy registrations_select_staff
  on public.registrations for select
  to authenticated
  using (private.has_org_role(organization_id, private.registration_reader_roles()));

-- Nenhuma escrita direta: status, preço e vagas só mudam por função do sistema.
revoke all on public.registrations from anon, authenticated;
grant select on public.registrations to authenticated;

-- Vagas ocupadas (inscrições ativas) de um evento ou de um ingresso.
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
     and r.status in ('pending_payment', 'confirmed');
$$;

revoke execute on function private.active_registrations(uuid, uuid) from public, anon, authenticated;

-- Inscrição pública (anon ou logado). As respostas chegam já validadas pelo servidor da
-- aplicação (validateAnswers); aqui ficam as regras que não podem ser contornadas por quem
-- chama a Data API direto: evento, prazo, ingresso, preço, formulário, identidade e vagas.
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
begin
  if p_event_id is null or p_ticket_type_id is null or p_idempotency_key is null
     or jsonb_typeof(p_answers) is distinct from 'object' or pg_column_size(p_answers) > 16384 then
    raise exception 'INVALID_ANSWERS' using errcode = 'P0001';
  end if;

  -- Trava o evento: inscrições do mesmo evento passam por aqui uma de cada vez.
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
  -- Pagamentos entram na Fase 4: ingresso pago ainda não aceita inscrição.
  if v_ticket.price_cents > 0 then
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
    answers, price_cents, public_token, idempotency_key, confirmed_at
  ) values (
    v_event.organization_id, v_event.id, v_ticket.id, v_form.id, 'confirmed', v_name, v_email,
    p_answers, v_ticket.price_cents, v_token, p_idempotency_key, now()
  );

  return jsonb_build_object('public_token', v_token, 'status', 'confirmed');
end;
$$;

revoke execute on function public.register_for_event(uuid, uuid, integer, jsonb, uuid) from public;
grant execute on function public.register_for_event(uuid, uuid, integer, jsonb, uuid) to anon, authenticated;

-- Consulta segura pelo participante: só quem tem o token vê a própria inscrição. O link de
-- acesso online é dos inscritos, então aparece aqui quando a inscrição está confirmada.
create or replace function public.get_registration(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', r.status, 'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'created_at', r.created_at, 'confirmed_at', r.confirmed_at, 'cancelled_at', r.cancelled_at,
    'price_cents', r.price_cents,
    'ticket', jsonb_build_object('name', t.name),
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'event', jsonb_build_object(
      'slug', e.slug, 'title', e.title, 'status', e.status, 'format', e.format,
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

revoke execute on function public.get_registration(text) from public;
grant execute on function public.get_registration(text) to anon, authenticated;

-- Página pública passa a mostrar vagas restantes e ingressos esgotados (só números, nunca
-- dados de inscritos).
create or replace function private.event_public_payload(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
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

revoke execute on function private.event_public_payload(uuid) from public, anon, authenticated;

-- A capacidade não pode ficar abaixo das vagas já ocupadas.
create or replace function private.protect_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.capacity < old.capacity and new.capacity < private.active_registrations(new.id) then
    raise exception 'CAPACITY_BELOW_REGISTRATIONS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_event_capacity() from public, anon, authenticated;

create trigger events_protect_capacity
  before update of capacity on public.events
  for each row execute function private.protect_event_capacity();
