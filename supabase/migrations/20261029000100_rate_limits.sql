-- EventHubs · limite de taxa (contador por chave e janela de tempo).
--
-- Duas camadas: o app consulta public.rate_limit_hit (service_role) antes de login, cadastro,
-- reset de senha, criação de organização e inscrição; e um trigger em registrations limita
-- inscrições por evento mesmo quando alguém chama /rest/v1/rpc/register_for_event direto.
-- Só contadores: nenhum dado de pessoa é guardado (as chaves do app são hash de IP).

create table private.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (key, window_start)
);

alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- true = dentro do limite; false = estourou. A janela é fixa (alinhada ao relógio).
create or replace function private.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into private.rate_limits (key, window_start) values (p_key, v_window)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;

  -- Faxina barata: só quando uma janela nova abre.
  if v_hits = 1 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke execute on function private.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.rate_limit_hit(p_key, p_max, p_window_seconds);
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- Teto de inscrições por evento: 120 por minuto. Protege vagas e custo contra robôs que
-- ignoram o app. Acima disso a inscrição falha com RATE_LIMITED e nada é gravado.
create or replace function private.limit_registration_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.rate_limit_hit('registration:' || new.event_id::text, 120, 60) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function private.limit_registration_rate() from public, anon, authenticated;

create trigger registrations_rate_limit
  before insert on public.registrations
  for each row execute function private.limit_registration_rate();
