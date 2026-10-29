-- EventHubs · lembrete do evento (um e-mail por inscrição confirmada).
--
-- Reaproveita a tabela notifications (unique registration_id + kind): o mesmo lembrete nunca
-- sai duas vezes. O envio é do servidor (service_role), chamado por um cron diário. Cada
-- chamada reserva até p_limit inscrições de eventos publicados que começam nas próximas
-- 24 horas; falhas são retentadas até 5 tentativas, como na confirmação. Nada é apagado.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('registration_confirmed', 'event_reminder'));

create or replace function public.claim_event_reminders(p_limit integer default 100)
returns setof jsonb
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select r.id, r.organization_id
      from public.registrations r
      join public.events e on e.id = r.event_id
     where r.status = 'confirmed'
       and e.status = 'published'
       and e.starts_at > now()
       and e.starts_at <= now() + interval '24 hours'
     order by e.starts_at, r.id
     limit greatest(1, least(p_limit, 500))
  ),
  claimed as (
    insert into public.notifications (organization_id, registration_id, kind)
    select organization_id, id, 'event_reminder' from candidates
    on conflict (registration_id, kind) do update
      set status = 'sending', attempts = public.notifications.attempts + 1, last_error = null
      where public.notifications.status = 'failed' and public.notifications.attempts < 5
    returning id, registration_id
  )
  select jsonb_build_object(
    'notification_id', c.id,
    'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'public_token', r.public_token, 'checkin_code', r.checkin_code, 'price_cents', r.price_cents,
    'ticket', t.name,
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'format', e.format, 'venue_name', e.venue_name,
      'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
      'online_url', e.online_url, 'contact_email', e.contact_email
    )
  )
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  join public.ticket_types t on t.id = r.ticket_type_id;
$$;

revoke execute on function public.claim_event_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_event_reminders(integer) to service_role;
