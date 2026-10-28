-- Exclusão de evento sem inscrições (qualquer status) e duplicação de evento.

-- A exclusão passa a ser só pela função: ela trava o evento, a mesma trava de
-- register_for_event, então nenhuma inscrição entra entre a conferência e o delete.
drop policy events_delete_managers on public.events;
revoke delete on public.events from authenticated;

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or not private.has_org_role(v_event.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Qualquer inscrição (até expirada ou cancelada) é histórico e talvez pagamento: aí, cancele.
  if exists (select 1 from public.registrations r where r.event_id = v_event.id) then
    raise exception 'EVENT_HAS_REGISTRATIONS' using errcode = 'P0001';
  end if;

  delete from public.events where id = v_event.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_event.organization_id, v_user, 'event.deleted', 'event', v_event.id::text, jsonb_build_object('title', v_event.title));
end;
$$;

revoke execute on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;

-- Cópia em rascunho com os mesmos dados, ingressos e formulário, sem inscrições.
-- Datas são copiadas como estão: a publicação já recusa evento no passado.
create or replace function public.duplicate_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
  v_base text;
  v_slug text;
  v_n integer := 1;
  v_new uuid;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or not private.has_org_role(v_event.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_base := left(v_event.slug, 52) || '-copia';
  v_slug := v_base;
  while exists (select 1 from public.events where organization_id = v_event.organization_id and slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.events (
    organization_id, slug, title, description, cover_image_url, format, venue_name, address, online_url,
    starts_at, ends_at, timezone, capacity, contact_email, contact_phone, participant_terms, is_paid,
    sales_start_at, created_by
  ) values (
    v_event.organization_id, v_slug, left(v_event.title, 132) || ' (cópia)', v_event.description,
    v_event.cover_image_url, v_event.format, v_event.venue_name, v_event.address, v_event.online_url,
    v_event.starts_at, v_event.ends_at, v_event.timezone, v_event.capacity, v_event.contact_email,
    v_event.contact_phone, v_event.participant_terms, v_event.is_paid, v_event.sales_start_at, v_user
  )
  returning id into v_new;

  -- O gatilho de criação gravou o formulário padrão; troca pelos campos do original e refaz a versão 1.
  delete from public.form_fields where event_id = v_new;
  delete from public.event_forms where event_id = v_new;
  insert into public.form_fields (
    organization_id, event_id, key, label, type, required, position, options, validation, help_text, placeholder, is_active
  )
  select organization_id, v_new, key, label, type, required, position, options, validation, help_text, placeholder, is_active
    from public.form_fields where event_id = v_event.id;
  perform private.snapshot_event_form(v_new);

  insert into public.ticket_types (
    organization_id, event_id, name, description, price_cents, currency, sales_start_at, sales_end_at,
    quantity_limit, min_per_order, max_per_order, is_active, position
  )
  select organization_id, v_new, name, description, price_cents, currency, sales_start_at, sales_end_at,
         quantity_limit, min_per_order, max_per_order, is_active, position
    from public.ticket_types where event_id = v_event.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_event.organization_id, v_user, 'event.duplicated', 'event', v_new::text, jsonb_build_object('from', v_event.id));

  return v_new;
end;
$$;

revoke execute on function public.duplicate_event(uuid) from public, anon;
grant execute on function public.duplicate_event(uuid) to authenticated;
