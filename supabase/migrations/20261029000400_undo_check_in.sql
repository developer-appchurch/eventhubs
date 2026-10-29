-- Desfazer check-in: corrige uma presença lançada na pessoa errada. Mesmos papéis de quem faz
-- o check-in (inclusive o operador). Apaga a linha e deixa o registro original na auditoria.
-- Sem check-in, não faz nada: dois cliques no botão não dão erro.

create or replace function public.undo_check_in(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_checkin public.checkins;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_checkin from public.checkins where registration_id = p_registration_id;
  if not found then
    -- Sem check-in ou sem acesso respondem igual para quem não é da equipe.
    if not exists (
      select 1 from public.registrations r
       where r.id = p_registration_id and private.has_org_role(r.organization_id, private.registration_reader_roles())
    ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    return;
  end if;
  if not private.has_org_role(v_checkin.organization_id, private.registration_reader_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.checkins where id = v_checkin.id;

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_checkin.organization_id, v_user, 'registration.check_in_undone', 'registration', p_registration_id::text,
          jsonb_build_object('method', v_checkin.method, 'checked_in_at', v_checkin.checked_in_at, 'checked_in_by', v_checkin.checked_in_by));
end;
$$;

revoke execute on function public.undo_check_in(uuid) from public, anon;
grant execute on function public.undo_check_in(uuid) to authenticated;
