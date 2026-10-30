-- Outras inscrições do mesmo e-mail, para a página do link já recebido. Quem tem o token prova
-- que é dono do e-mail; o índice por lower(attendee_email) evita varrer a tabela inteira.
create index if not exists registrations_attendee_email_lower_idx on public.registrations (lower(attendee_email));

create or replace function public.list_registrations_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select lower(r.attendee_email) as email from public.registrations r
    where p_token ~ '^[0-9a-f]{64}$' and r.public_token = p_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'public_token', r.public_token, 'status', r.status::text,
      'event_title', e.title, 'event_slug', e.slug, 'cover_image_url', e.cover_image_url,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
      'organization', jsonb_build_object('name', o.name, 'slug', o.slug)
    ) order by e.starts_at, r.id), '[]'::jsonb)
  from me
  join public.registrations r on lower(r.attendee_email) = me.email
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  where r.public_token <> p_token
    and e.status not in ('ended', 'cancelled')
    and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.expires_at > now()));
$$;

revoke execute on function public.list_registrations_by_token(text) from public;
grant execute on function public.list_registrations_by_token(text) to anon, authenticated;
