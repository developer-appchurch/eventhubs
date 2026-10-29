-- Desconectar o Mercado Pago: a organização troca de conta ou para de vender. Só owner/admin.
-- Recusa enquanto houver reserva paga valendo: a pessoa pode estar pagando agora, e o webhook
-- precisa do token da conta para confirmar. Apaga os tokens e deixa o registro na auditoria.

create or replace function public.disconnect_payment_account(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_account private.payment_accounts;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  if not private.has_org_role(p_org, array['owner', 'admin']::public.organization_role[]) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_account from private.payment_accounts where organization_id = p_org for update;
  if not found then
    return;
  end if;

  if exists (
    select 1 from public.registrations r
     where r.organization_id = p_org and r.status = 'pending_payment' and r.expires_at > now()
  ) then
    raise exception 'PAYMENTS_PENDING' using errcode = 'P0001';
  end if;

  delete from private.payment_accounts where organization_id = p_org;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (p_org, v_user, 'payments.disconnected', 'organization', p_org::text,
          jsonb_build_object('provider', 'mercadopago', 'provider_user_id', v_account.provider_user_id, 'live_mode', v_account.live_mode));
end;
$$;

revoke execute on function public.disconnect_payment_account(uuid) from public, anon;
grant execute on function public.disconnect_payment_account(uuid) to authenticated;
