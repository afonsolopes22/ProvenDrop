-- Reversão da 0017 (teste grátis Click), gerada a 2026-11-14 a partir das definições que estavam em produção
-- imediatamente antes de a 0017 ser aplicada (pg_get_functiondef, pg_policies, pg_constraint).
--
-- Repõe o comportamento anterior: tem_acesso() e recalcular_subscritor() exatamente como estavam, as três
-- regras de acesso (feed_dia, verdes, kits) só com membro_ativo_direto(), e as restrições de estado sem 'teste'.
-- Apaga as duas funções novas (membro_em_teste, ultimo_dia_feed).
-- NÃO apaga as colunas e tabelas novas (teste_fim, dados anti-abuso, testes_click_usados, kit_downloads):
-- ficam vazias e sem uso, e apagá-las perderia dados. Se houver linhas em 'teste', passam a 'ativo' antes de
-- repor as restrições (senão a restrição antiga recusava-as).
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0017_click_teste_reverter.sql
-- Numa transação: ou reverte tudo, ou nada.

begin;

update public.subscricoes  set estado = 'ativo' where estado = 'teste';
update public.subscritores set estado = 'ativo' where estado = 'teste';

alter table public.subscricoes drop constraint if exists subscricoes_estado_check;
alter table public.subscricoes add constraint subscricoes_estado_check
  check (estado in ('ativo', 'em_atraso', 'incompleto', 'cancelado'));
alter table public.subscritores drop constraint if exists subscritores_estado_check;
alter table public.subscritores add constraint subscritores_estado_check
  check (estado in ('ativo', 'cancelado', 'em_atraso', 'incompleto'));

drop policy if exists "feed so para membros direto ativos" on public.feed_dia;
create policy "feed so para membros direto ativos" on public.feed_dia
  for select to authenticated using (public.membro_ativo_direto());

drop policy if exists "verdes so para membros direto ativos" on public.verdes;
create policy "verdes so para membros direto ativos" on public.verdes
  for select to authenticated using (public.membro_ativo_direto());

drop policy if exists "kits para membros direto ativos" on storage.objects;
create policy "kits para membros direto ativos" on storage.objects
  for select to authenticated using (bucket_id = 'kits' and public.membro_ativo_direto());

-- tem_acesso() como estava (pg_get_functiondef):
CREATE OR REPLACE FUNCTION public.tem_acesso(s subscritores)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select s.bloqueado_em is null
     and (s.origem = 'direto'
          or (s.origem = 'click' and s.estado_click = 'validado'))
     and (s.estado = 'ativo'
          or (s.estado = 'em_atraso' and s.em_atraso_desde is not null
              and s.em_atraso_desde > now() - interval '7 days'));
$function$;

-- recalcular_subscritor() como estava (pg_get_functiondef):
CREATE OR REPLACE FUNCTION public.recalcular_subscritor(p_email text)
 RETURNS subscritores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d public.subscricoes%rowtype;
  c public.subscricoes%rowtype;
  r public.subscritores%rowtype;
  tem_d boolean; tem_c boolean;
begin
  select * into d from public.subscricoes
   where email = p_email and origem = 'direto'
   order by case estado when 'ativo' then 0 when 'em_atraso' then 1 when 'incompleto' then 2 else 3 end, atualizado_em desc
   limit 1;
  tem_d := found;
  select * into c from public.subscricoes
   where email = p_email and origem = 'click'
   order by case estado when 'ativo' then 0 when 'em_atraso' then 1 when 'incompleto' then 2 else 3 end, atualizado_em desc
   limit 1;
  tem_c := found;

  if not tem_d and not tem_c then
    select * into r from public.subscritores where email = p_email;
    return r;
  end if;

  if tem_d and (d.estado <> 'cancelado' or not tem_c) then
    update public.subscritores set origem = 'direto', estado = d.estado,
      stripe_customer_id = d.stripe_customer_id, stripe_subscription_id = d.stripe_subscription_id,
      em_atraso_desde = d.em_atraso_desde, acesso_fim = d.cancel_at
     where email = p_email returning * into r;
  else
    update public.subscritores set origem = 'click', estado = c.estado,
      stripe_customer_id = c.stripe_customer_id, stripe_subscription_id = c.stripe_subscription_id,
      em_atraso_desde = c.em_atraso_desde, acesso_fim = c.cancel_at
     where email = p_email returning * into r;
  end if;
  return r;
end $function$;

drop function if exists public.membro_em_teste();
drop function if exists public.ultimo_dia_feed();

commit;
