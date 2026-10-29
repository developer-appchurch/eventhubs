-- EventHubs · capas: SELECT para gerentes da organização dona da pasta.
--
-- No Postgres, DELETE com WHERE só enxerga linhas que passam também numa política de SELECT.
-- Sem ela, o remove() do Storage apagava zero linhas, sem erro, e a capa descartada ficava
-- órfã. A leitura pública das capas não muda: o bucket é público e não passa pela RLS.

create policy event_covers_select_managers
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-covers'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.has_org_role(((storage.foldername(name))[1])::uuid, private.event_manager_roles())
      else false
    end
  );
