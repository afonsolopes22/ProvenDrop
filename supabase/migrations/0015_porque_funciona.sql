-- 0015 · "Why it's working": uma frase por coleção.
--
-- feed_dia.porque_funciona (texto, pode ficar vazio, até 140 caracteres): uma frase em inglês,
-- só com números medidos, que explica porque a coleção está a funcionar. Enviada pela rotina
-- (publicar_plataforma.py) desde 2026-11-11, já cortada a 140 caracteres antes do envio; se o
-- envio falhar, a rotina repete sem as colunas novas. Por isso o limite é uma restrição simples.
--
-- Aparece na área de membros (cartões de Today e Library) e no e-mail diário. Sem frase, não
-- aparece nada. Só feed_dia: a tabela verdes não a tem.
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0015_porque_funciona.sql
-- Idempotente. Não altera dados existentes.

alter table public.feed_dia add column if not exists porque_funciona text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'feed_dia_porque_funciona_check') then
    alter table public.feed_dia add constraint feed_dia_porque_funciona_check
      check (porque_funciona is null or char_length(porque_funciona) <= 140);
  end if;
end $$;

comment on column public.feed_dia.porque_funciona is 'Why it''s working: uma frase em inglês (até 140 caracteres), enviada pela rotina. Vazio = não aparece.';
