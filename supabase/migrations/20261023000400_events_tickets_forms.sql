-- EventHubs · Fase 2: eventos, ciclo de status, tipos de ingresso e formulários dinâmicos.
-- Toda tabela carrega organization_id e se liga ao evento por FK composta (event_id,
-- organization_id), de modo que um registro nunca aponta para evento de outra organização.

create type public.event_status as enum ('draft', 'published', 'registration_closed', 'ended', 'cancelled');
create type public.event_format as enum ('in_person', 'online', 'hybrid');
create type public.form_field_type as enum (
  'name', 'email', 'phone', 'short_text', 'long_text', 'number', 'date',
  'single_choice', 'multiple_choice', 'dropdown', 'consent'
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null
    constraint events_slug_check check (char_length(slug) between 3 and 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 20000),
  cover_image_url text check (cover_image_url is null or (cover_image_url ~ '^https://' and char_length(cover_image_url) <= 2048)),
  format public.event_format not null default 'in_person',
  venue_name text not null default '' check (char_length(venue_name) <= 160),
  address text not null default '' check (char_length(address) <= 300),
  online_url text check (online_url is null or (online_url ~ '^https://' and char_length(online_url) <= 2048)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Sao_Paulo' check (char_length(timezone) between 1 and 64),
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 1000000),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 40),
  participant_terms text not null default '' check (char_length(participant_terms) <= 20000),
  status public.event_status not null default 'draft',
  published_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_org_slug_key unique (organization_id, slug),
  constraint events_id_org_key unique (id, organization_id),
  constraint events_dates_check check (ends_at > starts_at),
  constraint events_registration_window_check check (registration_closes_at > registration_opens_at and registration_closes_at <= ends_at)
);

create index events_org_starts_idx on public.events (organization_id, starts_at desc);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  price_cents integer not null default 0 check (price_cents between 0 and 100000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  quantity_limit integer check (quantity_limit is null or quantity_limit > 0),
  min_per_order integer not null default 1 check (min_per_order >= 1),
  max_per_order integer not null default 1,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  constraint ticket_types_order_check check (max_per_order between min_per_order and 50),
  constraint ticket_types_sales_window_check check (sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at)
);

create index ticket_types_event_idx on public.ticket_types (event_id, position);

-- Definição atual (editável) dos campos. A chave é o identificador estável do campo.
create table public.form_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 120),
  type public.form_field_type not null,
  required boolean not null default false,
  position integer not null,
  options text[] not null default '{}' check (cardinality(options) <= 50),
  validation jsonb not null default '{}'::jsonb
    check (jsonb_typeof(validation) = 'object' and pg_column_size(validation) <= 1024),
  help_text text not null default '' check (char_length(help_text) <= 300),
  placeholder text not null default '' check (char_length(placeholder) <= 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  constraint form_fields_event_key unique (event_id, key),
  constraint form_fields_choice_options_check
    check (type not in ('single_choice', 'multiple_choice', 'dropdown') or cardinality(options) >= 2)
);

-- Versões imutáveis do formulário. A inscrição (Fase 3) aponta para a versão vigente, o que
-- preserva o significado das respostas mesmo se o organizador editar o formulário depois.
create table public.event_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  version integer not null check (version >= 1),
  fields jsonb not null check (jsonb_typeof(fields) = 'array'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.events (id, organization_id) on delete cascade,
  constraint event_forms_event_version_key unique (event_id, version)
);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function private.set_updated_at();

create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function private.set_updated_at();

create trigger form_fields_set_updated_at
  before update on public.form_fields
  for each row execute function private.set_updated_at();

-- Papéis que criam e administram eventos.
create or replace function private.event_manager_roles()
returns public.organization_role[]
language sql
immutable
set search_path = ''
as $$
  select array['owner', 'admin', 'event_manager']::public.organization_role[];
$$;

-- Evento existe, o chamador o administra e ele ainda aceita edição (não encerrado/cancelado).
create or replace function private.can_edit_event(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event
      and e.status not in ('ended', 'cancelled')
      and private.has_org_role(e.organization_id, private.event_manager_roles())
  );
$$;

-- Transições válidas do ciclo de vida. Espelhada em src/modules/events/status.ts e
-- verificada por teste (tests/security/events-rls.test.ts).
create or replace function private.event_transition_allowed(p_from public.event_status, p_to public.event_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('draft'::public.event_status, 'published'::public.event_status),
    ('draft', 'cancelled'),
    ('published', 'draft'),
    ('published', 'registration_closed'),
    ('published', 'ended'),
    ('published', 'cancelled'),
    ('registration_closed', 'published'),
    ('registration_closed', 'ended'),
    ('registration_closed', 'cancelled')
  );
$$;

revoke execute on function private.event_manager_roles() from public, anon;
revoke execute on function private.can_edit_event(uuid) from public, anon;
revoke execute on function private.event_transition_allowed(public.event_status, public.event_status) from public, anon;
grant execute on function private.event_manager_roles() to authenticated;
grant execute on function private.can_edit_event(uuid) to authenticated;

-- Protege o evento: slug fixo depois da primeira publicação (links públicos) e evento
-- encerrado ou cancelado não aceita mais edição.
create or replace function private.protect_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('ended', 'cancelled') then
    raise exception 'EVENT_LOCKED' using errcode = 'P0001';
  end if;
  if new.slug <> old.slug and old.published_at is not null then
    raise exception 'SLUG_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.protect_event() from public, anon, authenticated;

create trigger events_protect
  before update on public.events
  for each row execute function private.protect_event();

-- Grava uma nova versão do formulário se os campos ativos mudaram desde a última versão.
create or replace function private.snapshot_event_form(p_event uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_fields jsonb;
  v_last public.event_forms;
begin
  select organization_id into v_org from public.events where id = p_event;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', f.key, 'label', f.label, 'type', f.type, 'required', f.required,
           'options', to_jsonb(f.options), 'validation', f.validation,
           'help_text', f.help_text, 'placeholder', f.placeholder
         ) order by f.position), '[]'::jsonb)
    into v_fields
    from public.form_fields f
   where f.event_id = p_event and f.is_active;

  select * into v_last from public.event_forms
   where event_id = p_event order by version desc limit 1;

  if found and v_last.fields = v_fields then
    return v_last.version;
  end if;

  insert into public.event_forms (organization_id, event_id, version, fields, created_by)
  values (v_org, p_event, coalesce(v_last.version, 0) + 1, v_fields, (select auth.uid()));

  return coalesce(v_last.version, 0) + 1;
end;
$$;

revoke execute on function private.snapshot_event_form(uuid) from public, anon, authenticated;

-- Novo evento nasce com os campos obrigatórios de identificação (nome e e-mail), a
-- versão 1 do formulário e o registro de auditoria.
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

  perform private.snapshot_event_form(new.id);

  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id)
  values (new.organization_id, (select auth.uid()), 'event.created', 'event', new.id::text);

  return new;
end;
$$;

revoke execute on function private.handle_new_event() from public, anon, authenticated;

create trigger events_after_insert
  after insert on public.events
  for each row execute function private.handle_new_event();

-- Auditoria de tipos de ingresso: preço e disponibilidade afetam dinheiro e vagas.
create or replace function private.audit_ticket_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.ticket_types := case when tg_op = 'DELETE' then old else new end;
begin
  insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
  values (
    v_row.organization_id, (select auth.uid()), 'ticket_type.' || lower(tg_op), 'ticket_type', v_row.id::text,
    jsonb_build_object('event_id', v_row.event_id, 'price_cents', v_row.price_cents, 'is_active', v_row.is_active)
  );
  return null;
end;
$$;

revoke execute on function private.audit_ticket_type() from public, anon, authenticated;

create trigger ticket_types_audit
  after insert or update or delete on public.ticket_types
  for each row execute function private.audit_ticket_type();
