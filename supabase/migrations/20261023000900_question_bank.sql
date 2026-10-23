-- EventHubs · Banco de perguntas da organização.
-- Perguntas reutilizáveis entre formulários. Ao entrar num formulário, a pergunta é copiada
-- para form_fields com a chave estável 'q_' || id (sem hífens), o que liga o campo à
-- pergunta sem mudar form_fields nem as versões do formulário. "always_on" marca as
-- perguntas que entram (ativas e obrigatórias) em todo formulário da organização.
-- Migration apenas aditiva.

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  -- Nome e e-mail já são campos fixos de todo formulário.
  type public.form_field_type not null check (type not in ('name', 'email')),
  required boolean not null default false,
  always_on boolean not null default false,
  options text[] not null default '{}' check (cardinality(options) <= 50),
  validation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(validation) = 'object' and pg_column_size(validation) <= 1024),
  help_text text not null default '' check (char_length(help_text) <= 300),
  placeholder text not null default '' check (char_length(placeholder) <= 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_bank_always_on_required check (not always_on or required),
  constraint question_bank_choice_options_check
    check (type not in ('single_choice', 'multiple_choice', 'dropdown') or cardinality(options) >= 2)
);

create index question_bank_org_idx on public.question_bank (organization_id, label);

create trigger question_bank_set_updated_at
  before update on public.question_bank
  for each row execute function private.set_updated_at();

alter table public.question_bank enable row level security;

create policy question_bank_select_members
  on public.question_bank for select
  to authenticated
  using (private.is_active_member(organization_id));

create policy question_bank_insert_managers
  on public.question_bank for insert
  to authenticated
  with check (private.has_org_role(organization_id, private.event_manager_roles()));

create policy question_bank_update_managers
  on public.question_bank for update
  to authenticated
  using (private.has_org_role(organization_id, private.event_manager_roles()))
  with check (private.has_org_role(organization_id, private.event_manager_roles()));

create policy question_bank_delete_managers
  on public.question_bank for delete
  to authenticated
  using (private.has_org_role(organization_id, private.event_manager_roles()));

revoke all on public.question_bank from anon, authenticated;
grant select, delete on public.question_bank to authenticated;
grant insert (organization_id, label, type, required, always_on, options, validation, help_text, placeholder)
  on public.question_bank to authenticated;
grant update (label, type, required, always_on, options, validation, help_text, placeholder)
  on public.question_bank to authenticated;

-- Novo evento nasce com nome, e-mail e as perguntas "sempre" do banco da organização.
create or replace function private.handle_new_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.form_fields (organization_id, event_id, key, label, type, required, position)
  values
    (new.organization_id, new.id, 'full_name', 'Nome completo', 'name', true, 1),
    (new.organization_id, new.id, 'email', 'E-mail', 'email', true, 2);

  insert into public.form_fields (
    organization_id, event_id, key, label, type, required, position, options, validation, help_text, placeholder
  )
  select new.organization_id, new.id, 'q_' || replace(q.id::text, '-', ''), q.label, q.type, true,
         2 + row_number() over (order by q.created_at, q.id), q.options, q.validation, q.help_text, q.placeholder
    from public.question_bank q
   where q.organization_id = new.organization_id and q.always_on
   limit 58;

  perform private.snapshot_event_form(new.id);

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (new.organization_id, (select auth.uid()), 'event.created', 'event', new.id::text);

  return new;
end;
$$;

revoke execute on function private.handle_new_event() from public, anon, authenticated;
