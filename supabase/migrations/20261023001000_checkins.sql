-- EventHubs · Fase 5: participantes e check-in.
--
-- O QR Code do participante carrega só checkin_code: 128 bits aleatórios, separados do
-- public_token (que abre a página com nome e e-mail). Uma foto do QR não revela dados e só
-- serve para quem está logado na equipe do evento.
--
-- Um check-in por inscrição (unique). A única porta de escrita é public.check_in, que confere
-- papel, evento e status. Uma segunda leitura não sobrescreve: devolve o registro original.

alter table public.registrations
  add column checkin_code text not null unique
    default replace(gen_random_uuid()::text, '-', '')
    check (checkin_code ~ '^[0-9a-f]{32}$');

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  registration_id uuid not null unique references public.registrations (id) on delete cascade,
  method text not null check (method in ('qr', 'manual')),
  checked_in_by uuid references auth.users (id) on delete set null,
  checked_in_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade
);

create index checkins_event_idx on public.checkins (event_id, checked_in_at desc);

alter table public.checkins enable row level security;

-- Quem vê os inscritos vê a presença (mesmos papéis, inclusive o operador de check-in).
create policy checkins_select_staff
  on public.checkins for select
  to authenticated
  using (private.has_org_role(organization_id, private.registration_reader_roles()));

revoke all on public.checkins from anon, authenticated;
grant select on public.checkins to authenticated;

-- Registra a presença pelo código do QR (p_code) ou manualmente pela inscrição
-- (p_registration_id), sempre dentro do evento informado.
create or replace function public.check_in(p_event_id uuid, p_code text default null, p_registration_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
  v_reg public.registrations;
  v_checkin public.checkins;
  v_new boolean;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id;
  -- Inexistente e sem permissão respondem igual: não revela se o evento existe.
  if not found or not private.has_org_role(v_event.organization_id, private.registration_reader_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_event.status in ('draft', 'cancelled') then
    raise exception 'CHECKIN_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- Exatamente um dos dois identificadores. Código de outro evento = não encontrado.
  if (p_code is null) = (p_registration_id is null) then
    raise exception 'CHECKIN_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into v_reg from public.registrations r
   where r.event_id = v_event.id
     and (r.checkin_code = lower(btrim(p_code)) or r.id = p_registration_id);
  if not found then
    raise exception 'CHECKIN_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_reg.status <> 'confirmed' then
    raise exception 'REGISTRATION_NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  insert into public.checkins (organization_id, event_id, registration_id, method, checked_in_by)
  values (v_event.organization_id, v_event.id, v_reg.id, case when p_code is null then 'manual' else 'qr' end, v_user)
  on conflict (registration_id) do nothing
  returning * into v_checkin;
  v_new := found;

  if v_new then
    insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (v_event.organization_id, v_user, 'registration.checked_in', 'registration', v_reg.id::text,
            jsonb_build_object('method', v_checkin.method));
  else
    select * into v_checkin from public.checkins where registration_id = v_reg.id;
  end if;

  return jsonb_build_object(
    'result', case when v_new then 'checked_in' else 'already_checked_in' end,
    'attendee_name', v_reg.attendee_name,
    'checked_in_at', v_checkin.checked_in_at,
    'checked_in_by', (select p.full_name from public.profiles p where p.id = v_checkin.checked_in_by)
  );
end;
$$;

revoke execute on function public.check_in(uuid, text, uuid) from public, anon;
grant execute on function public.check_in(uuid, text, uuid) to authenticated;

-- A página do participante passa a entregar o código do QR (só com inscrição confirmada e
-- evento não cancelado) e o id do evento, que compõe o link lido pela equipe.
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
