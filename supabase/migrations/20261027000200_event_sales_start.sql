-- Início das vendas definido no evento: vale para todos os lotes que não tiverem o seu.
-- O início do próprio lote, quando preenchido, tem prioridade.

alter table public.events add column sales_start_at timestamptz;

grant insert (sales_start_at), update (sales_start_at) on public.events to authenticated;

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

  if v_event.status <> 'published' or now() >= v_event.ends_at then
    raise exception 'REGISTRATION_CLOSED' using errcode = 'P0001';
  end if;

  select * into v_ticket from public.ticket_types
   where id = p_ticket_type_id and event_id = v_event.id and is_active;
  if not found
     or now() < coalesce(v_ticket.sales_start_at, v_event.sales_start_at, '-infinity')
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
      'capacity', e.capacity, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
      'participant_terms', e.participant_terms, 'status', e.status,
      'remaining', greatest(e.capacity - private.active_registrations(e.id), 0)
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents,
               'currency', t.currency, 'sales_start_at', coalesce(t.sales_start_at, e.sales_start_at), 'sales_end_at', t.sales_end_at,
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
