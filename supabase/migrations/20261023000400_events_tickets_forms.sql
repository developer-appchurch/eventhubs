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

-- Conteúdo público de um evento: só colunas pensadas para exibição. Sem created_by,
-- online_url (link de acesso é dos inscritos) nem dados de outros eventos.
create or replace function private.event_public_payload(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'description', e.description,
      'cover_image_url', e.cover_image_url, 'format', e.format, 'venue_name', e.venue_name,
      'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
      'registration_opens_at', e.registration_opens_at, 'registration_closes_at', e.registration_closes_at,
      'capacity', e.capacity, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
      'participant_terms', e.participant_terms, 'status', e.status
    ),
    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'description', t.description, 'price_cents', t.price_cents,
               'currency', t.currency, 'sales_start_at', t.sales_start_at, 'sales_end_at', t.sales_end_at,
               'min_per_order', t.min_per_order, 'max_per_order', t.max_per_order
             ) order by t.position, t.created_at)
        from public.ticket_types t
       where t.event_id = e.id and t.is_active
    ), '[]'::jsonb),
    'form', (
      select jsonb_build_object('version', f.version, 'fields', f.fields)
        from public.event_forms f
       where f.event_id = e.id
       order by f.version desc
       limit 1
    )
  )
  from public.events e
  join public.organizations o on o.id = e.organization_id
  where e.id = p_event;
$$;

revoke execute on function private.event_public_payload(uuid) from public, anon, authenticated;

-- Página pública: rascunhos nunca aparecem; inexistente e rascunho respondem igual (null).
create or replace function public.get_public_event(p_org_slug text, p_event_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.event_public_payload(e.id)
    from public.events e
    join public.organizations o on o.id = e.organization_id
   where o.slug = lower(p_org_slug)
     and e.slug = lower(p_event_slug)
     and e.status <> 'draft';
$$;

-- Lista pública da organização: eventos publicados ou com inscrições encerradas que ainda
-- não terminaram. Retorna null quando a organização não existe.
create or replace function public.list_public_events(p_org_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', e.slug, 'title', e.title, 'cover_image_url', e.cover_image_url,
               'format', e.format, 'venue_name', e.venue_name, 'starts_at', e.starts_at,
               'timezone', e.timezone, 'status', e.status
             ) order by e.starts_at)
        from public.events e
       where e.organization_id = o.id
         and e.status in ('published', 'registration_closed')
         and e.ends_at > now()
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = lower(p_org_slug);
$$;

-- Pré-visualização para a equipe: mesmo conteúdo da página pública, inclusive rascunhos.
create or replace function public.get_event_preview(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.events where id = p_event_id;
  if v_org is null or not private.is_active_member(v_org) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return private.event_public_payload(p_event_id);
end;
$$;

revoke execute on function public.get_public_event(text, text) from public;
revoke execute on function public.list_public_events(text) from public;
revoke execute on function public.get_event_preview(uuid) from public, anon;
grant execute on function public.get_public_event(text, text) to anon, authenticated;
grant execute on function public.list_public_events(text) to anon, authenticated;
grant execute on function public.get_event_preview(uuid) to authenticated;

-- RLS: leitura para membros ativos; escrita para owner/admin/event_manager. anon não lê
-- tabelas, só as funções públicas acima.
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.form_fields enable row level security;
alter table public.event_forms enable row level security;

create policy events_select_members
  on public.events for select
  to authenticated
  using (private.is_active_member(organization_id));

create policy events_insert_managers
  on public.events for insert
  to authenticated
  with check (private.has_org_role(organization_id, private.event_manager_roles()));

create policy events_update_managers
  on public.events for update
  to authenticated
  using (private.has_org_role(organization_id, private.event_manager_roles()))
  with check (private.has_org_role(organization_id, private.event_manager_roles()));

-- Só rascunhos nunca publicados podem ser apagados; os demais são cancelados.
create policy events_delete_managers
  on public.events for delete
  to authenticated
  using (
    status = 'draft' and published_at is null
    and private.has_org_role(organization_id, private.event_manager_roles())
  );

create policy ticket_types_select_members
  on public.ticket_types for select
  to authenticated
  using (private.is_active_member(organization_id));

create policy ticket_types_insert_managers
  on public.ticket_types for insert
  to authenticated
  with check (private.can_edit_event(event_id));

create policy ticket_types_update_managers
  on public.ticket_types for update
  to authenticated
  using (private.can_edit_event(event_id))
  with check (private.can_edit_event(event_id));

create policy ticket_types_delete_managers
  on public.ticket_types for delete
  to authenticated
  using (private.can_edit_event(event_id));

-- form_fields e event_forms: leitura por membros; escrita apenas por save_event_form.
create policy form_fields_select_members
  on public.form_fields for select
  to authenticated
  using (private.is_active_member(organization_id));

create policy event_forms_select_members
  on public.event_forms for select
  to authenticated
  using (private.is_active_member(organization_id));

-- Grants explícitos por coluna. status, published_at, cancelled_at e created_by não são
-- graváveis pelo cliente; organization_id só na criação (e a política confere o papel).
revoke all on public.events from anon, authenticated;
revoke all on public.ticket_types from anon, authenticated;
revoke all on public.form_fields from anon, authenticated;
revoke all on public.event_forms from anon, authenticated;

grant select, delete on public.events to authenticated;
grant insert (
  organization_id, slug, title, description, cover_image_url, format, venue_name, address, online_url,
  starts_at, ends_at, timezone, registration_opens_at, registration_closes_at, capacity,
  contact_email, contact_phone, participant_terms
) on public.events to authenticated;
grant update (
  slug, title, description, cover_image_url, format, venue_name, address, online_url,
  starts_at, ends_at, timezone, registration_opens_at, registration_closes_at, capacity,
  contact_email, contact_phone, participant_terms
) on public.events to authenticated;

grant select, delete on public.ticket_types to authenticated;
grant insert (
  organization_id, event_id, name, description, price_cents, sales_start_at, sales_end_at,
  quantity_limit, min_per_order, max_per_order, is_active, position
) on public.ticket_types to authenticated;
grant update (
  name, description, price_cents, sales_start_at, sales_end_at, quantity_limit,
  min_per_order, max_per_order, is_active, position
) on public.ticket_types to authenticated;

grant select on public.form_fields to authenticated;
grant select on public.event_forms to authenticated;
