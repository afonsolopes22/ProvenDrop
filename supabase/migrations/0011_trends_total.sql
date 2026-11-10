-- 0011 · Procura: em quantos mercados foi verificada.
--
-- A área de membros mostrava "Demand: X of 6 markets" com o 6 escrito à mão. X vem de
-- trends_validados (mercados onde a procura foi confirmada). O denominador passa a vir
-- dos dados: trends_total = número de mercados onde a rotina verificou a procura dessa
-- coleção (hoje 6; passa a 8 quando a rotina validar os oito mercados).
--
-- A rotina (publicar_plataforma.py) tem de enviar "trends_total" em cada linha de
-- feed_dia e de verdes. Enquanto a coluna estiver vazia, a área mostra só
-- "Demand checked in X markets", sem denominador: nenhum número é assumido.
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0011_trends_total.sql
-- Idempotente. Não altera dados existentes.

alter table public.feed_dia add column if not exists trends_total integer;
alter table public.verdes   add column if not exists trends_total integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feed_dia_trends_total_check') then
    alter table public.feed_dia add constraint feed_dia_trends_total_check
      check (trends_total is null or (trends_total > 0 and (trends_validados is null or trends_validados <= trends_total)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'verdes_trends_total_check') then
    alter table public.verdes add constraint verdes_trends_total_check
      check (trends_total is null or (trends_total > 0 and (trends_validados is null or trends_validados <= trends_total)));
  end if;
end $$;

comment on column public.feed_dia.trends_total is 'Mercados onde a procura foi verificada (denominador de trends_validados). Enviado pela rotina.';
comment on column public.verdes.trends_total   is 'Mercados onde a procura foi verificada (denominador de trends_validados). Enviado pela rotina.';
