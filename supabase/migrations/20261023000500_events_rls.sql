-- EventHubs · Fase 2 (parte 2): RLS e grants das tabelas de eventos.

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
