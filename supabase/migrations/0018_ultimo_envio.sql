-- 0018 · Último envio diário, para a área de membros saber qual é a "lista de hoje" (2026-11-17).
--
-- O e-mail das 09:00 envia a lista do dia ANTERIOR (envios_diarios.feed_dia), por isso a área de membros mostrava
-- "Today's list is not in yet" mesmo depois do envio: comparava a data da lista com hoje. A "lista de hoje" passa a
-- ser a do envio de hoje. envios_diarios não está aberta aos membros (só a service role escreve e lê); esta função
-- devolve só o último envio (dia do envio e dia da lista), nada mais, e só a quem tem sessão.
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0018_ultimo_envio.sql
-- Idempotente. Reverter: drop function if exists public.ultimo_envio();

create or replace function public.ultimo_envio() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('dia', dia, 'feed_dia', feed_dia)
  from public.envios_diarios
  order by dia desc
  limit 1;
$$;
revoke all on function public.ultimo_envio() from public, anon;
grant execute on function public.ultimo_envio() to authenticated, service_role;
