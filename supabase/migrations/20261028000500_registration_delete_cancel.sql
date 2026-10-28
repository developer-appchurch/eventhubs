-- Gestão de inscrições pelo organizador: cancelar e apagar.
--
-- Cancelar libera a vaga e o e-mail (só inscrições ativas contam) e mantém a linha, então o
-- histórico de pagamento fica. Um pagamento que chegue depois é marcado paid_after_cancellation
-- por record_payment. O reembolso, se houver, é feito no Mercado Pago.
--
-- Apagar remove a linha (e, em cascata, check-in e notificações). Só vale para inscrição sem
-- nenhum registro de pagamento, para não apagar histórico financeiro, e fora de uma reserva
-- ainda válida, em que a pessoa pode estar pagando agora. Nos outros casos, cancele.

create or replace function public.cancel_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reg public.registrations;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_reg from public.registrations where id = p_registration_id;
  if not found or not private.has_org_role(v_reg.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Mesma trava de register_for_event e record_payment.
  perform 1 from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.registrations where id = p_registration_id;

  if v_reg.status not in ('pending_payment', 'confirmed') then
    raise exception 'REGISTRATION_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.registrations set status = 'cancelled', cancelled_at = now() where id = v_reg.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_reg.organization_id, v_user, 'registration.cancelled', 'registration', v_reg.id::text,
          jsonb_build_object('previous_status', v_reg.status, 'email', v_reg.attendee_email));
end;
$$;

revoke execute on function public.cancel_registration(uuid) from public, anon;
grant execute on function public.cancel_registration(uuid) to authenticated;

create or replace function public.delete_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reg public.registrations;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_reg from public.registrations where id = p_registration_id;
  if not found or not private.has_org_role(v_reg.organization_id, private.event_manager_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1 from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.registrations where id = p_registration_id;

  if exists (select 1 from public.payments p where p.registration_id = v_reg.id) then
    raise exception 'REGISTRATION_HAS_PAYMENT' using errcode = 'P0001';
  end if;
  if v_reg.status = 'pending_payment' and v_reg.expires_at > now() then
    raise exception 'REGISTRATION_RESERVED' using errcode = 'P0001';
  end if;

  delete from public.registrations where id = v_reg.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_reg.organization_id, v_user, 'registration.deleted', 'registration', v_reg.id::text,
          jsonb_build_object('status', v_reg.status, 'email', v_reg.attendee_email, 'event_id', v_reg.event_id));
end;
$$;

revoke execute on function public.delete_registration(uuid) from public, anon;
grant execute on function public.delete_registration(uuid) to authenticated;
