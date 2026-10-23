-- EventHubs · diretório de membros da organização
-- Expõe nome e papel dos membros ativos da mesma organização sem liberar a leitura
-- de perfis alheios (profiles continua restrita ao próprio usuário).

create or replace function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role public.organization_role,
  status public.membership_status,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member(p_organization_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
    select m.user_id, p.full_name, m.role, m.status, m.created_at
    from public.organization_members m
    left join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;

revoke execute on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;
