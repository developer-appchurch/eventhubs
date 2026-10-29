-- EventHubs · políticas de Storage das capas (bucket event-covers).
--
-- A política de INSERT original convertia o primeiro segmento do caminho em uuid; um caminho
-- fora do padrão dava erro em vez de ser negado. Aqui o formato é verificado antes da
-- conversão (CASE garante a ordem). Entra também DELETE para gerentes da organização dona da pasta, usado para
-- descartar a capa recém-enviada quando a gravação do evento falha. Nada é apagado por esta
-- migration. Não há UPDATE: o upload nunca sobrescreve (cada capa tem uuid novo).

drop policy if exists event_covers_insert_managers on storage.objects;

create policy event_covers_insert_managers
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-covers'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.has_org_role(((storage.foldername(name))[1])::uuid, private.event_manager_roles())
      else false
    end
  );

create policy event_covers_delete_managers
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-covers'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.has_org_role(((storage.foldername(name))[1])::uuid, private.event_manager_roles())
      else false
    end
  );
