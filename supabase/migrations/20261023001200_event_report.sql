-- EventHubs · Fase 6: relatório do evento.
--
-- Uma função agrega tudo no banco (sem trazer linhas de inscrição para a aplicação) e entrega
-- só números: nenhum dado pessoal. Mesmo grupo do financeiro (private.payment_reader_roles):
-- owner, admin, event_manager e report_viewer. Operador de check-in não vê.
-- Valores são brutos, como registrados pelo Mercado Pago; tarifas e líquido ficam no painel dele.

create or replace function public.event_report(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.events;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select * into v_event from public.events where id = p_event_id;
  -- Inexistente e sem permissão respondem igual: não revela se o evento existe.
  if not found or not private.has_org_role(v_event.organization_id, private.payment_reader_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'capacity', v_event.capacity,
    'timezone', v_event.timezone,
    'by_status', coalesce((
      select jsonb_object_agg(s.status, s.n)
        from (select r.status, count(*) as n from public.registrations r where r.event_id = p_event_id group by r.status) s
    ), '{}'::jsonb),
    'checked_in', (select count(*) from public.checkins c where c.event_id = p_event_id),
    'by_ticket', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', t.name, 'price_cents', t.price_cents,
               'confirmed', (select count(*) from public.registrations r where r.ticket_type_id = t.id and r.status = 'confirmed')
             ) order by t.position)
        from public.ticket_types t where t.event_id = p_event_id
    ), '[]'::jsonb),
    -- Confirmações por dia no fuso do evento, últimos 60 dias com movimento.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'n', d.n) order by d.day)
        from (
          select (r.confirmed_at at time zone v_event.timezone)::date as day, count(*) as n
            from public.registrations r
           where r.event_id = p_event_id and r.status = 'confirmed' and r.confirmed_at is not null
           group by 1 order by 1 desc limit 60
        ) d
    ), '[]'::jsonb),
    'finance', (
      select jsonb_build_object(
        'approved_cents', coalesce(sum(p.amount_cents) filter (where p.status = 'approved'), 0),
        'platform_fee_cents', coalesce(sum(p.platform_fee_cents) filter (where p.status = 'approved'), 0),
        'refunded_cents', coalesce(sum(p.amount_cents) filter (where p.status in ('refunded', 'charged_back')), 0),
        'attention', count(*) filter (where p.attention is not null)
      )
      from public.payments p where p.event_id = p_event_id
    )
  );
end;
$$;

revoke execute on function public.event_report(uuid) from public, anon;
grant execute on function public.event_report(uuid) to authenticated;
