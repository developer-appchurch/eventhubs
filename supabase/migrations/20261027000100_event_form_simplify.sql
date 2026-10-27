-- Formulário de evento simplificado: marcação de evento pago/gratuito e capa enviada como
-- arquivo. O período de inscrição continua nas colunas, mas o servidor o preenche sozinho
-- (abre na criação e fecha no término do evento).

alter table public.events add column is_paid boolean not null default false;

-- Eventos que já vendem ingresso pago continuam pagos. Encerrados/cancelados não mudam (trigger).
update public.events e
   set is_paid = true
 where e.status not in ('ended', 'cancelled')
   and exists (select 1 from public.ticket_types t where t.event_id = e.id and t.price_cents > 0);

grant insert (is_paid), update (is_paid) on public.events to authenticated;

-- Capas públicas, sempre WebP (o servidor converte). Caminho: <organization_id>/<uuid>.webp.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 1048576, array['image/webp'])
on conflict (id) do nothing;

-- shortcut: capas substituídas ficam no bucket; limpar órfãos quando o volume pesar.
create policy event_covers_insert_managers
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-covers'
    and private.has_org_role(((storage.foldername(name))[1])::uuid, private.event_manager_roles())
  );
