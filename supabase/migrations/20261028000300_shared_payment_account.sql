-- Uma mesma conta Mercado Pago pode atender várias organizações (ex.: ministérios de uma
-- igreja). Cada pagamento leva o nome da organização no item e nos metadados, e o webhook
-- resolve a organização pela inscrição (external_reference), nunca pela conta.

alter table private.payment_accounts drop constraint payment_accounts_provider_user_id_key;
create index payment_accounts_provider_user_idx on private.payment_accounts (provider_user_id);

-- Pelo vendedor, qualquer organização ligada a ele serve: o token só é usado para consultar o
-- pagamento. Prefere a conexão mais recente.
create or replace function public.get_payment_account(p_org uuid default null, p_provider_user_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_id', a.organization_id, 'provider_user_id', a.provider_user_id, 'public_key', a.public_key,
    'access_token_enc', a.access_token_enc, 'refresh_token_enc', a.refresh_token_enc,
    'token_expires_at', a.token_expires_at, 'live_mode', a.live_mode
  )
  from private.payment_accounts a
  where a.organization_id = p_org or (p_org is null and a.provider_user_id = p_provider_user_id)
  order by a.connected_at desc
  limit 1;
$$;

create or replace function public.checkout_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_id', r.id, 'organization_id', r.organization_id, 'public_token', r.public_token,
    'payable', r.status = 'pending_payment' and r.expires_at > now(),
    'expires_at', r.expires_at, 'price_cents', r.price_cents, 'currency', r.currency,
    'checkout_url', r.checkout_url, 'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'ticket', jsonb_build_object('id', t.id, 'name', t.name),
    'event', jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug),
    'organization', jsonb_build_object('slug', o.slug, 'name', o.name)
  )
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  join public.ticket_types t on t.id = r.ticket_type_id
  where p_token ~ '^[0-9a-f]{64}$' and r.public_token = p_token;
$$;
