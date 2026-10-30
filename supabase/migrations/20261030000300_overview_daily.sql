-- EventHubs · Visão geral: inscrições por dia no lugar de inscrições por evento.
--
-- organization_overview passa a devolver 'daily' (confirmadas por dia, últimos 30 dias) em vez
-- de 'by_event'. Mesmas permissões e mesma forma de pagamento de antes.

create or replace function public.organization_overview(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  if not private.has_org_role(p_org, private.payment_reader_roles()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    -- Inscrições confirmadas por dia nos últimos 30 dias (horário de Brasília), com zeros nos dias sem movimento.
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'n', coalesce(c.n, 0)) order by d.day)
        from generate_series(
               (now() at time zone 'America/Sao_Paulo')::date - 29,
               (now() at time zone 'America/Sao_Paulo')::date,
               interval '1 day'
             ) as g(ts)
        cross join lateral (select g.ts::date as day) d
        left join (
          select (r.confirmed_at at time zone 'America/Sao_Paulo')::date as day, count(*) as n
            from public.registrations r
           where r.organization_id = p_org and r.status = 'confirmed'
             and r.confirmed_at >= now() - interval '31 days'
           group by 1
        ) c on c.day = d.day
    ),
    -- Inscrições confirmadas por forma de pagamento. Gratuitas não passam pelo Mercado Pago.
    'by_method', (
      select jsonb_build_object(
        'free', count(*) filter (where r.price_cents = 0),
        'pix', count(*) filter (where r.price_cents > 0 and p.method = 'pix'),
        'card', count(*) filter (where r.price_cents > 0 and p.method = 'card'),
        'other', count(*) filter (where r.price_cents > 0 and coalesce(p.method, 'other') = 'other')
      )
      from public.registrations r
      left join lateral (
        select pay.method from public.payments pay
         where pay.registration_id = r.id and pay.status = 'approved' and pay.attention is null
         order by pay.approved_at desc nulls last
         limit 1
      ) p on true
      where r.organization_id = p_org and r.status = 'confirmed'
    )
  );
end;
$$;

revoke execute on function public.organization_overview(uuid) from public, anon;
grant execute on function public.organization_overview(uuid) to authenticated;
