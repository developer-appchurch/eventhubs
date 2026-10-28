-- Troca do endereço público (slug) da organização. O endereço antigo fica guardado para
-- redirecionar links já publicados (e-mails, QR de check-in, retorno do pagamento) e não
-- pode ser usado por outra organização, para ninguém capturar o tráfego desses links.

create table public.organization_slug_history (
  slug text primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index organization_slug_history_org_idx on public.organization_slug_history (organization_id);

-- Sem acesso direto pela API: a leitura passa por resolve_organization_slug.
alter table public.organization_slug_history enable row level security;
revoke all on public.organization_slug_history from anon, authenticated;

create or replace function private.track_organization_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.slug = old.slug then
    return new;
  end if;

  if exists (
    select 1 from public.organization_slug_history h
    where h.slug = new.slug and h.organization_id <> new.id
  ) then
    raise exception 'duplicate key value violates unique constraint "organizations_slug_key"'
      using errcode = '23505';
  end if;

  if tg_op = 'UPDATE' then
    -- Voltar a um endereço antigo libera a entrada do histórico.
    delete from public.organization_slug_history where slug = new.slug;
    insert into public.organization_slug_history (slug, organization_id)
    values (old.slug, new.id)
    on conflict (slug) do nothing;
  end if;

  return new;
end;
$$;

create trigger organizations_track_slug
  before insert or update of slug on public.organizations
  for each row execute function private.track_organization_slug();

-- Endereço atual de uma organização a partir de um endereço antigo (ou null).
create or replace function public.resolve_organization_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.slug
  from public.organization_slug_history h
  join public.organizations o on o.id = h.organization_id
  where h.slug = lower(p_slug);
$$;

revoke execute on function public.resolve_organization_slug(text) from public;
grant execute on function public.resolve_organization_slug(text) to anon, authenticated;

-- owner/admin passam a poder alterar o slug (a política organizations_update_admins já
-- restringe as linhas; o formato é validado pela constraint da tabela).
grant update (name, slug) on public.organizations to authenticated;
