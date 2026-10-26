-- EventHubs · e-mail de confirmação com o QR Code do check-in.
--
-- Uma notificação por inscrição e tipo (unique): a mesma transição nunca gera dois e-mails.
-- O envio é do servidor (service_role); aqui ficam o estado, as tentativas e o erro, para
-- nunca dizer que um e-mail saiu quando falhou.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  kind text not null check (kind in ('registration_confirmed')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  provider_message_id text check (char_length(provider_message_id) <= 200),
  last_error text check (char_length(last_error) <= 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notifications_once unique (registration_id, kind)
);

alter table public.notifications enable row level security;

-- Quem vê os inscritos vê se a confirmação foi entregue ao provedor.
create policy notifications_select_staff
  on public.notifications for select
  to authenticated
  using (private.has_org_role(organization_id, private.registration_reader_roles()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Reserva o envio e devolve os dados do e-mail. Nulo se a inscrição não estiver confirmada,
-- se o e-mail já saiu ou se outro envio está em andamento.
-- shortcut: um envio que morra no meio fica em 'sending' e não é retentado; criar reenvio manual quando houver painel de notificações.
-- Pela inscrição (webhook de pagamento) ou pelo token (inscrição gratuita, que só conhece o token).
create or replace function public.claim_confirmation_email(p_registration_id uuid default null, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (organization_id, registration_id, kind)
  select r.organization_id, r.id, 'registration_confirmed'
    from public.registrations r
    join public.events e on e.id = r.event_id
   where (r.id = p_registration_id or r.public_token = p_token) and r.status = 'confirmed' and e.status <> 'cancelled'
  on conflict (registration_id, kind) do update
    set status = 'sending', attempts = public.notifications.attempts + 1, last_error = null
    where public.notifications.status = 'failed'
  returning id into v_id;
  if v_id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'notification_id', v_id,
      'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
      'public_token', r.public_token, 'checkin_code', r.checkin_code, 'price_cents', r.price_cents,
      'ticket', t.name,
      'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
      'event', jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'title', e.title, 'format', e.format, 'venue_name', e.venue_name,
        'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
        'online_url', e.online_url, 'contact_email', e.contact_email
      )
    )
    from public.registrations r
    join public.events e on e.id = r.event_id
    join public.organizations o on o.id = r.organization_id
    join public.ticket_types t on t.id = r.ticket_type_id
    join public.notifications n on n.registration_id = r.id
    where n.id = v_id
  );
end;
$$;

create or replace function public.finish_confirmation_email(p_notification_id uuid, p_message_id text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set status = case when p_error is null then 'sent' else 'failed' end,
         provider_message_id = left(p_message_id, 200),
         last_error = left(p_error, 200),
         sent_at = case when p_error is null then now() end
   where id = p_notification_id and status = 'sending';
$$;

revoke execute on function public.claim_confirmation_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_confirmation_email(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_confirmation_email(uuid, text) to service_role;
grant execute on function public.finish_confirmation_email(uuid, text, text) to service_role;
