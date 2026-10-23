-- EventHubs · organizações, membros, papéis, auditoria e RLS
-- Papéis: owner (proprietário), admin, event_manager, checkin_operator, report_viewer.

create type public.organization_role as enum (
  'owner',
  'admin',
  'event_manager',
  'checkin_operator',
  'report_viewer'
);

create type public.membership_status as enum ('active', 'suspended');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (char_length(target_type) <= 40),
  target_id text check (char_length(target_id) <= 80),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 4096),
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- Funções de autorização. SECURITY DEFINER evita recursão de RLS entre tabelas;
-- search_path vazio impede sequestro por objetos em outros schemas.
create or replace function private.has_org_role(p_org uuid, p_roles public.organization_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_active_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke execute on function private.has_org_role(uuid, public.organization_role[]) from public, anon;
revoke execute on function private.is_active_member(uuid) from public, anon;
grant execute on function private.has_org_role(uuid, public.organization_role[]) to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;

-- Impede remover ou rebaixar o último proprietário ativo.
create or replace function private.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    if not exists (
      select 1
      from public.organization_members m
      where m.organization_id = old.organization_id
        and m.role = 'owner'
        and m.status = 'active'
        and m.user_id <> old.user_id
    ) then
      raise exception 'LAST_OWNER' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_last_owner() from public, anon, authenticated;

create trigger organization_members_protect_last_owner
  before update or delete on public.organization_members
  for each row execute function private.protect_last_owner();

-- Criação de organização: a única porta de entrada. Cria a organização e o vínculo de
-- proprietário na mesma transação; o dono é sempre auth.uid(), nunca um parâmetro.
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org public.organizations;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_user)
  returning * into v_org;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org.id, v_user, 'owner', 'active');

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (v_org.id, v_user, 'organization.created', 'organization', v_org.id::text);

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- RLS: toda tabela de domínio tem política explícita por operação.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

-- organizations: leitura para membros ativos; alteração de nome para owner/admin; sem insert
-- direto (use create_organization) e sem delete pela API nesta fase.
create policy organizations_select_members
  on public.organizations for select
  to authenticated
  using (private.is_active_member(id));

create policy organizations_update_admins
  on public.organizations for update
  to authenticated
  using (private.has_org_role(id, array['owner', 'admin']::public.organization_role[]))
  with check (private.has_org_role(id, array['owner', 'admin']::public.organization_role[]));

-- organization_members: membros veem a equipe; somente owner altera papéis/status ou remove.
-- Não há INSERT pela API: vínculos novos passam por funções auditadas.
create policy organization_members_select_members
  on public.organization_members for select
  to authenticated
  using (private.is_active_member(organization_id));

create policy organization_members_update_owner
  on public.organization_members for update
  to authenticated
  using (private.has_org_role(organization_id, array['owner']::public.organization_role[]))
  with check (private.has_org_role(organization_id, array['owner']::public.organization_role[]));

create policy organization_members_delete_owner
  on public.organization_members for delete
  to authenticated
  using (private.has_org_role(organization_id, array['owner']::public.organization_role[]));

-- audit_logs: somente leitura por owner/admin; escrita apenas por funções do sistema.
create policy audit_logs_select_admins
  on public.audit_logs for select
  to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.organization_role[]));

-- Grants explícitos (negar por padrão). Colunas sensíveis como organization_id, user_id e
-- created_by não são graváveis pelo cliente.
revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select on public.organization_members to authenticated;
grant update (role, status) on public.organization_members to authenticated;
grant delete on public.organization_members to authenticated;

grant select on public.audit_logs to authenticated;

-- Novas tabelas em public não herdam privilégios para anon/authenticated.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
