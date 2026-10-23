-- EventHubs · Fase 2 (parte 4): conteúdo público do evento e pré-visualização.

-- Conteúdo público de um evento: só colunas pensadas para exibição. Sem created_by,
-- online_url (link de acesso é dos inscritos) nem dados de outros eventos.
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
      'participant_terms', e.participant_terms, 'status', e.status
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents,
               'currency', t.currency, 'sales_start_at', t.sales_start_at, 'sales_end_at', t.sales_end_at,
               'min_per_order', t.min_per_order, 'max_per_order', t.max_per_order
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

-- Página pública: rascunhos nunca aparecem; inexistente e rascunho respondem igual (null).
create or replace function public.get_public_event(p_org_slug text, p_event_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_public_payload(e.id)
    from public.events e
    join public.organizations o on o.id = e.organization_id
   where o.slug = lower(p_org_slug)
     and e.slug = lower(p_event_slug)
     and e.status <> 'draft';
$$;

-- Lista pública da organização: eventos publicados ou com inscrições encerradas que ainda
-- não terminaram. Retorna null quando a organização não existe.
create or replace function public.list_public_events(p_org_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', e.slug, 'title', e.title, 'cover_image_url', e.cover_image_url,
               'format', e.format, 'venue_name', e.venue_name, 'starts_at', e.starts_at,
               'timezone', e.timezone, 'status', e.status
             ) order by e.starts_at)
        from public.events e
       where e.organization_id = o.id
         and e.status in ('published', 'registration_closed')
         and e.ends_at > now()
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = lower(p_org_slug);
$$;

-- Pré-visualização para a equipe: mesmo conteúdo da página pública, inclusive rascunhos.
create or replace function public.get_event_preview(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null or not private.is_active_member(v_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.event_public_payload(p_event_id);
end;
$$;

revoke execute on function public.get_public_event(text, text) from public;
revoke execute on function public.list_public_events(text) from public;
revoke execute on function public.get_event_preview(uuid) from public, anon;
grant execute on function public.get_public_event(text, text) to anon, authenticated;
grant execute on function public.list_public_events(text) to anon, authenticated;
grant execute on function public.get_event_preview(uuid) to authenticated;
