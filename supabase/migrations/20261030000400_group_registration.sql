-- Inscrição em grupo: uma pessoa escolhe o ingresso e a quantidade e preenche um formulário
-- por participante. Cada participante vira uma inscrição própria (vaga, e-mail, QR), e o grupo
-- é pago de uma vez pela inscrição de quem fez o pedido (a "principal"), cujo id já é a
-- external_reference do Mercado Pago. group_id aponta para a principal em todas as linhas do
-- grupo, inclusive nela; inscrição individual fica com group_id nulo.
alter table public.registrations
  add column group_id uuid references public.registrations (id) on delete set null;

create index registrations_group_idx on public.registrations (group_id) where group_id is not null;

-- Linhas do grupo de uma inscrição (ela mesma, se for individual).
create or replace function private.group_registration_ids(p_registration public.registrations)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_registration.group_id is null then array[p_registration.id]
    else array(select r.id from public.registrations r where r.group_id = p_registration.group_id order by r.created_at, r.id) end;
$$;

revoke execute on function private.group_registration_ids(public.registrations) from public, anon, authenticated;

-- Uma inscrição por participante, todas na mesma transação: se uma falha (vaga, e-mail já
-- inscrito, resposta inválida), nenhuma é gravada. register_for_event faz todas as checagens.
create or replace function public.register_group_for_event(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_form_version integer,
  p_answers jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.ticket_types;
  v_count integer;
  v_created jsonb;
  v_tokens text[] := '{}';
  v_lead uuid;
  v_status text;
begin
  if p_idempotency_key is null or jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'INVALID_ANSWERS' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_answers);

  select * into v_ticket from public.ticket_types where id = p_ticket_type_id and event_id = p_event_id;
  if not found then
    raise exception 'TICKET_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_count < greatest(v_ticket.min_per_order, 1) or v_count > v_ticket.max_per_order then
    raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
  end if;

  for i in 0 .. v_count - 1 loop
    -- A primeira usa a chave do pedido (igual à inscrição individual); as outras, chaves derivadas,
    -- para que reenviar o mesmo pedido devolva as mesmas inscrições.
    v_created := public.register_for_event(
      p_event_id, p_ticket_type_id, p_form_version, p_answers -> i,
      case when i = 0 then p_idempotency_key else md5(p_idempotency_key::text || ':' || i)::uuid end
    );
    v_tokens := v_tokens || (v_created ->> 'public_token');
    if i = 0 then
      v_status := v_created ->> 'status';
    end if;
  end loop;

  if v_count > 1 then
    select id into v_lead from public.registrations where public_token = v_tokens[1];
    update public.registrations set group_id = v_lead where event_id = p_event_id and public_token = any(v_tokens);
  end if;

  return jsonb_build_object('public_token', v_tokens[1], 'status', v_status, 'tokens', to_jsonb(v_tokens));
end;
$$;

revoke execute on function public.register_group_for_event(uuid, uuid, integer, jsonb, uuid) from public;
grant execute on function public.register_group_for_event(uuid, uuid, integer, jsonb, uuid) to anon, authenticated;

-- Só a principal paga, pelo total do grupo. As demais aguardam o pagamento dela.
create or replace function public.checkout_context(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'registration_id', r.id, 'organization_id', r.organization_id, 'public_token', r.public_token,
    'payable', r.status = 'pending_payment' and r.expires_at > now() and (r.group_id is null or r.group_id = r.id),
    'expires_at', r.expires_at,
    'price_cents', (select coalesce(sum(g.price_cents), r.price_cents)::integer from public.registrations g where g.id = any(private.group_registration_ids(r))),
    'quantity', cardinality(private.group_registration_ids(r)),
    'currency', r.currency,
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

-- Página do participante: total e participantes do grupo, e se o pagamento é feito por ela.
create or replace function public.get_registration(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', case when r.status = 'pending_payment' and r.expires_at <= now() then 'expired' else r.status::text end,
    'attendee_name', r.attendee_name, 'attendee_email', r.attendee_email,
    'created_at', r.created_at, 'confirmed_at', r.confirmed_at, 'cancelled_at', r.cancelled_at,
    'price_cents', r.price_cents, 'expires_at', r.expires_at,
    'checkin_code', case when r.status = 'confirmed' and e.status <> 'cancelled' then r.checkin_code end,
    'pays_here', r.group_id is null or r.group_id = r.id,
    'total_cents', (select sum(g.price_cents)::integer from public.registrations g where g.id = any(private.group_registration_ids(r))),
    -- Só nomes: e-mails dos outros participantes não aparecem no link de cada um.
    'group_names', case when r.group_id is null then '[]'::jsonb
      else (select jsonb_agg(g.attendee_name order by g.created_at, g.id) from public.registrations g where g.group_id = r.group_id) end,
    'ticket', jsonb_build_object('name', t.name),
    'organization', jsonb_build_object('name', o.name, 'slug', o.slug),
    'event', jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'status', e.status, 'format', e.format,
      'venue_name', e.venue_name, 'address', e.address, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
      'timezone', e.timezone, 'contact_email', e.contact_email, 'contact_phone', e.contact_phone,
      'online_url', case when r.status = 'confirmed' and e.status <> 'cancelled' then e.online_url end
    )
  )
  from public.registrations r
  join public.events e on e.id = r.event_id
  join public.organizations o on o.id = r.organization_id
  join public.ticket_types t on t.id = r.ticket_type_id
  where p_token ~ '^[0-9a-f]{64}$' and r.public_token = p_token;
$$;

-- record_payment com grupo: o valor esperado é o total do grupo, e aprovar, reembolsar ou
-- estornar vale para todas as inscrições dele. Devolve os ids confirmados para os e-mails.
create or replace function public.record_payment(
  p_registration_id uuid,
  p_seller_id text,
  p_external_id text,
  p_status text,
  p_status_detail text,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
  v_event public.events;
  v_ticket public.ticket_types;
  v_pay public.payments;
  v_attention text;
  v_result text := 'recorded';
  v_ids uuid[];
  v_total integer;
  v_confirmed uuid[] := '{}';
begin
  select * into v_reg from public.registrations where id = p_registration_id;
  if not found then
    raise exception 'UNKNOWN_REFERENCE' using errcode = 'P0001';
  end if;
  -- Mesma trava de register_for_event: vagas são contadas com a fila do evento parada.
  select * into v_event from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.registrations where id = p_registration_id;
  v_ids := private.group_registration_ids(v_reg);
  select sum(price_cents)::integer into v_total from public.registrations where id = any(v_ids);

  -- O pagamento precisa ser da conta em nome da qual o checkout foi criado.
  if v_reg.payment_seller_id is null or v_reg.payment_seller_id <> p_seller_id then
    raise exception 'SELLER_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.payments (
    organization_id, event_id, registration_id, external_id, status, status_detail, amount_cents, currency,
    platform_fee_cents, approved_at
  ) values (
    v_reg.organization_id, v_reg.event_id, v_reg.id, p_external_id, p_status, left(p_status_detail, 100), p_amount_cents,
    p_currency, v_reg.platform_fee_cents, case when p_status = 'approved' then now() end
  )
  on conflict (provider, external_id) do update
    -- Duas notificações processadas em paralelo podem chegar invertidas: um estado em
    -- andamento nunca sobrescreve um estado final.
    set status = case
          when public.payments.status in ('approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
           and excluded.status in ('pending', 'in_process', 'authorized') then public.payments.status
          else excluded.status
        end,
        status_detail = excluded.status_detail,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        approved_at = coalesce(public.payments.approved_at, excluded.approved_at)
    where public.payments.registration_id = excluded.registration_id
  returning * into v_pay;
  if v_pay.id is null then
    raise exception 'REFERENCE_MISMATCH' using errcode = 'P0001';
  end if;

  if p_status = 'approved' and v_pay.attention is null then
    if p_currency <> v_reg.currency or p_amount_cents <> v_total then
      v_attention := 'amount_mismatch';
    elsif v_reg.status = 'confirmed' then
      if exists (
        select 1 from public.payments p
         where p.registration_id = v_reg.id and p.status = 'approved' and p.attention is null and p.id <> v_pay.id
      ) then
        v_attention := 'duplicate_payment';
      else
        v_result := 'already_confirmed';
      end if;
    elsif v_reg.status in ('cancelled', 'refunded') then
      v_attention := 'paid_after_cancellation';
    elsif v_reg.status = 'pending_payment' and v_reg.expires_at > now() then
      v_result := 'confirmed';
    else
      -- Reserva vencida: confirma só se ainda houver vaga para o grupo todo e nenhum e-mail dele
      -- tiver outra inscrição ativa.
      select * into v_ticket from public.ticket_types where id = v_reg.ticket_type_id;
      if private.active_registrations(v_event.id) + cardinality(v_ids) <= v_event.capacity
         and (v_ticket.quantity_limit is null
              or private.active_registrations(v_event.id, v_ticket.id) + cardinality(v_ids) <= v_ticket.quantity_limit)
         and not exists (
           select 1 from public.registrations r
            where r.event_id = v_event.id and r.id <> all(v_ids)
              and r.attendee_email in (select g.attendee_email from public.registrations g where g.id = any(v_ids))
              and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.expires_at > now()))
         ) then
        v_result := 'confirmed_late';
      else
        v_attention := 'paid_without_seat';
      end if;
    end if;

    if v_result in ('confirmed', 'confirmed_late') then
      -- shortcut: participante do grupo cancelado pelo organizador antes do pagamento continua
      -- cancelado (o valor dele fica pago); tratar com reembolso parcial se isso aparecer.
      with done as (
        update public.registrations set status = 'confirmed', confirmed_at = now()
         where id = any(v_ids) and status in ('pending_payment', 'expired')
        returning id
      )
      select coalesce(array_agg(id), '{}') into v_confirmed from done;
    end if;
  elsif p_status in ('refunded', 'charged_back') and v_pay.attention is null and v_reg.status = 'confirmed' then
    update public.registrations set status = 'refunded', cancelled_at = now() where id = any(v_ids) and status = 'confirmed';
    v_result := 'refunded';
  end if;

  if v_attention is not null then
    update public.payments set attention = v_attention where id = v_pay.id;
    v_result := v_attention;
  end if;

  if v_result <> 'recorded' and v_result <> 'already_confirmed' then
    insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, metadata)
    values (v_reg.organization_id, null, 'payment.' || v_result, 'registration', v_reg.id::text,
            jsonb_build_object('external_id', p_external_id, 'status', p_status, 'quantity', cardinality(v_ids)));
  end if;

  return jsonb_build_object('result', v_result, 'organization_id', v_reg.organization_id, 'registration_ids', to_jsonb(v_confirmed));
end;
$$;
