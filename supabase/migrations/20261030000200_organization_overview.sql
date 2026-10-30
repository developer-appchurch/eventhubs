-- EventHubs · Gráficos da visão geral da organização.
--
-- payments.method guarda a forma de pagamento informada pelo Mercado Pago (Pix ou cartão).
-- Pagamentos anteriores a esta migration ficam sem forma (null) e aparecem como "não informado".
-- organization_overview agrega no banco, como event_report: só números, nenhum dado pessoal,
-- e para o mesmo grupo do financeiro (private.payment_reader_roles).

alter table public.payments
  add column method text check (method in ('pix', 'card', 'other'));

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
    -- Os 8 eventos mais recentes por data de início, com inscrições confirmadas e aguardando.
    'by_event', coalesce((
      select jsonb_agg(jsonb_build_object('title', e.title, 'confirmed', e.confirmed, 'pending', e.pending) order by e.starts_at desc)
        from (
          select ev.title, ev.starts_at,
                 count(r.id) filter (where r.status = 'confirmed') as confirmed,
                 count(r.id) filter (where r.status = 'pending_payment' and r.expires_at > now()) as pending
            from public.events ev
            left join public.registrations r on r.event_id = ev.id
           where ev.organization_id = p_org
           group by ev.id
           order by ev.starts_at desc
           limit 8
        ) e
    ), '[]'::jsonb),
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
