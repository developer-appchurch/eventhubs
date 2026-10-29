-- EventHubs · teto de tentativas do e-mail de confirmação.
--
-- Antes, uma inscrição cujo envio falhasse sempre podia ser reclamada de novo, sem limite de
-- tentativas, a cada gatilho (webhook reenviado, nova abertura). Agora, depois de 5 tentativas
-- falhas o registro fica em 'failed' e não é mais reclamado. Os grants da função permanecem
-- (create or replace não os altera). Nada é apagado.

create or replace function public.claim_confirmation_email(p_registration_id uuid default null, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (organization_id, registration_id, kind)
  select r.organization_id, r.id, 'registration_confirmed'
    from public.registrations r
    join public.events e on e.id = r.event_id
   where (r.id = p_registration_id or r.public_token = p_token) and r.status = 'confirmed' and e.status <> 'cancelled'
  on conflict (registration_id, kind) do update
    set status = 'sending', attempts = public.notifications.attempts + 1, last_error = null
    where public.notifications.status = 'failed' and public.notifications.attempts < 5
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'notification_id', v_id,
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
    from public.registrations r
    join public.events e on e.id = r.event_id
    join public.organizations o on o.id = r.organization_id
    join public.ticket_types t on t.id = r.ticket_type_id
    join public.notifications n on n.registration_id = r.id
    where n.id = v_id
  );
end;
$$;
