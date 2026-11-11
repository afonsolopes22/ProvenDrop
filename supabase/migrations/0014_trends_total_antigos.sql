-- 0014 · trends_total nas coleções antigas de feed_dia.
--
-- A coluna trends_total (0011) nasceu vazia. Até 2026-11-11 a rotina verificou sempre a procura
-- em 6 mercados, por isso as linhas enviadas até esse dia ficam com trends_total = 6 quando têm
-- trends_validados. A área de membros passa a mostrar "Demand checked in X of 6 markets" nessas
-- coleções. Linhas sem trends_validados ficam como estão ("Demand: no data").
--
-- Só feed_dia (a tabela verdes não é tocada). Linhas posteriores a 2026-11-11 nunca são alteradas:
-- o número delas tem de vir da rotina.
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0014_trends_total_antigos.sql
-- Idempotente (só preenche o que está vazio).

update public.feed_dia
   set trends_total = 6
 where trends_total is null
   and trends_validados is not null
   and trends_validados <= 6
   and dia <= date '2026-11-11';
