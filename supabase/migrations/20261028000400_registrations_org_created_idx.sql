-- Lista geral de inscrições da organização: filtro por organização, mais recentes primeiro.
create index if not exists registrations_org_created_idx on public.registrations (organization_id, created_at desc);
