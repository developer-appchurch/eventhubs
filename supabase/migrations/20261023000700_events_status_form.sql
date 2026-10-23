-- EventHubs · Fase 2 (parte 3): mudança de status e salvamento do formulário.

-- Mudança de status: única porta para alterar status, com regras de transição, requisitos
-- de publicação, trava de linha e auditoria.
create or replace function public.change_event_status(p_event_id uuid, p_status public.event_status)
returns public.events
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
  -- Inexistente e sem permissão respondem igual: não revela se o evento existe.
  if not found or not private.has_org_role(v_event.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not private.event_transition_allowed(v_event.status, p_status) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  if p_status = 'published' then
    if v_event.ends_at <= now() then
      raise exception 'EVENT_IN_PAST' using errcode = 'P0001';
    end if;
    if v_event.format in ('in_person', 'hybrid') and btrim(v_event.venue_name) = '' then
      raise exception 'LOCATION_REQUIRED' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.ticket_types t where t.event_id = v_event.id and t.is_active) then
      raise exception 'NO_ACTIVE_TICKET' using errcode = 'P0001';
    end if;
    perform private.snapshot_event_form(v_event.id);
  end if;

  update public.events
     set status = p_status,
         published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = v_event.id
  returning * into v_event;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_event.organization_id, v_user, 'event.status_changed', 'event', v_event.id::text,
          jsonb_build_object('to', p_status));

  return v_event;
end;
$$;

revoke execute on function public.change_event_status(uuid, public.event_status) from public, anon;
grant execute on function public.change_event_status(uuid, public.event_status) to authenticated;

-- Salva o formulário inteiro de uma vez (ordem = posição no array), mantendo ids pelos
-- identificadores estáveis, e grava nova versão quando algo mudou.
create or replace function public.save_event_form(p_event_id uuid, p_fields jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_event public.events;
  v_keys text[];
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or not private.has_org_role(v_event.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_event.status in ('ended', 'cancelled') then
    raise exception 'EVENT_LOCKED' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) not between 2 and 60 then
    raise exception 'INVALID_FORM' using errcode = 'P0001';
  end if;

  -- Nome e e-mail identificam o participante: exatamente um de cada, ativo e obrigatório.
  if (select count(*) from jsonb_array_elements(p_fields) f
       where f ->> 'type' = 'name' and (f ->> 'required')::boolean and coalesce((f ->> 'is_active')::boolean, true)) <> 1
     or (select count(*) from jsonb_array_elements(p_fields) f where f ->> 'type' = 'name') <> 1
     or (select count(*) from jsonb_array_elements(p_fields) f
       where f ->> 'type' = 'email' and (f ->> 'required')::boolean and coalesce((f ->> 'is_active')::boolean, true)) <> 1
     or (select count(*) from jsonb_array_elements(p_fields) f where f ->> 'type' = 'email') <> 1 then
    raise exception 'IDENTITY_FIELDS_REQUIRED' using errcode = 'P0001';
  end if;

  select array_agg(f ->> 'key') into v_keys from jsonb_array_elements(p_fields) f;

  delete from public.form_fields where event_id = v_event.id and key <> all (v_keys);

  insert into public.form_fields (
    organization_id, event_id, key, label, type, required, position, options, validation,
    help_text, placeholder, is_active
  )
  select v_event.organization_id, v_event.id, f.value ->> 'key', f.value ->> 'label',
         (f.value ->> 'type')::public.form_field_type, coalesce((f.value ->> 'required')::boolean, false),
         f.ordinality::integer,
         coalesce(array(select jsonb_array_elements_text(f.value -> 'options')), '{}'),
         coalesce(f.value -> 'validation', '{}'::jsonb),
         coalesce(f.value ->> 'help_text', ''), coalesce(f.value ->> 'placeholder', ''),
         coalesce((f.value ->> 'is_active')::boolean, true)
    from jsonb_array_elements(p_fields) with ordinality as f
  on conflict (event_id, key) do update
     set label = excluded.label, type = excluded.type, required = excluded.required,
         position = excluded.position, options = excluded.options, validation = excluded.validation,
         help_text = excluded.help_text, placeholder = excluded.placeholder, is_active = excluded.is_active;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_event.organization_id, v_user, 'event.form_saved', 'event', v_event.id::text);

  return private.snapshot_event_form(v_event.id);
end;
$$;

revoke execute on function public.save_event_form(uuid, jsonb) from public, anon;
grant execute on function public.save_event_form(uuid, jsonb) to authenticated;
