-- Publicar exige ao menos um ingresso que o público consiga comprar: um evento só com
-- ingressos pagos e sem Mercado Pago conectado ficava publicado sem nenhum ingresso à venda.
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
    if not exists (
      select 1 from public.ticket_types t
       where t.event_id = v_event.id and t.is_active
         and (t.price_cents = 0 or exists (select 1 from private.payment_accounts a where a.organization_id = v_event.organization_id))
    ) then
      raise exception 'PAYMENTS_NOT_CONNECTED' using errcode = 'P0001';
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
