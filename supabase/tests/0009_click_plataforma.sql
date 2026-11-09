-- ProvenDrop · teste da migração 0009 (estado Click, loja, id curto, acesso).
--
-- Corre DEPOIS de 0009_click_plataforma.sql estar aplicada (precisa das colunas
-- estado_click, loja e id_curto). Tudo dentro de begin … rollback: insere linhas
-- de teste (e-mails teste-click-*@example.com), verifica e desfaz; a base fica
-- como estava. Se alguma verificação falhar, o bloco lança uma exceção com o
-- motivo e a transação é anulada na mesma.
--
-- Como correr:
--   * SQL Editor do Supabase: colar o ficheiro inteiro e executar (já inclui o
--     begin e o rollback). Sucesso = termina sem erro e a última linha é o
--     "ok: 0009" do notice.
--   * CLI: supabase db query --linked --file supabase/tests/0009_click_plataforma.sql
--
-- O que verifica (tem_acesso):
--   1. click, ativo, estado_click = 'validado'              → true
--   2. click, ativo, estado_click = 'pendente'              → false
--   3. click, ativo, estado_click = 'recusado'              → false
--   4. direto, ativo, estado_click = null                   → true  (sem regressão)
--   5. direto, cancelado                                    → false
--   6. click validado, em_atraso há 3 dias                  → true  (tolerância de 0004)
--   7. click validado, em_atraso há 10 dias                 → false
--   8. click validado, bloqueado_em preenchido              → false
--   9. uma linha click ativa com estado_click null antes do backfill fica
--      'validado' depois de correr a mesma instrução de backfill de 0009
--  10. a constraint recusa um valor fora de pendente/validado/recusado
--  11. feed_dia.id_curto existe e aceita escrita

begin;

-- Limpeza defensiva (dentro da transação; não sobra nada depois do rollback).
delete from public.subscritores where email like 'teste-click-%@example.com';

insert into public.subscritores (email, origem, estado, estado_click, loja) values
  ('teste-click-validado@example.com',  'click',  'ativo',     'validado', 'Loja Teste'),
  ('teste-click-pendente@example.com',  'click',  'ativo',     'pendente', 'Loja Teste'),
  ('teste-click-recusado@example.com',  'click',  'ativo',     'recusado', 'Loja Teste'),
  ('teste-click-direto@example.com',    'direto', 'ativo',     null,       null),
  ('teste-click-direto-cancelado@example.com', 'direto', 'cancelado', null, null),
  ('teste-click-backfill@example.com',  'click',  'ativo',     null,       'Loja Antiga');

insert into public.subscritores (email, origem, estado, estado_click, em_atraso_desde) values
  ('teste-click-atraso-3d@example.com',  'click', 'em_atraso', 'validado', now() - interval '3 days'),
  ('teste-click-atraso-10d@example.com', 'click', 'em_atraso', 'validado', now() - interval '10 days');

insert into public.subscritores (email, origem, estado, estado_click, bloqueado_em, bloqueado_motivo) values
  ('teste-click-bloqueado@example.com', 'click', 'ativo', 'validado', now(), 'teste');

do $$
declare
  s public.subscritores%rowtype;
begin
  -- 1. click ativo validado → acesso
  select * into s from public.subscritores where email = 'teste-click-validado@example.com';
  if not public.tem_acesso(s) then
    raise exception 'falhou 1: click ativo validado devia ter acesso';
  end if;

  -- 2. click ativo pendente → sem acesso
  select * into s from public.subscritores where email = 'teste-click-pendente@example.com';
  if public.tem_acesso(s) then
    raise exception 'falhou 2: click ativo pendente não devia ter acesso';
  end if;

  -- 3. click ativo recusado → sem acesso
  select * into s from public.subscritores where email = 'teste-click-recusado@example.com';
  if public.tem_acesso(s) then
    raise exception 'falhou 3: click ativo recusado não devia ter acesso';
  end if;

  -- 4. direto ativo, estado_click null → acesso (sem regressão)
  select * into s from public.subscritores where email = 'teste-click-direto@example.com';
  if s.estado_click is not null then
    raise exception 'falhou 4: direto não devia ter estado_click (tem %)', s.estado_click;
  end if;
  if not public.tem_acesso(s) then
    raise exception 'falhou 4: direto ativo devia ter acesso';
  end if;

  -- 5. direto cancelado → sem acesso
  select * into s from public.subscritores where email = 'teste-click-direto-cancelado@example.com';
  if public.tem_acesso(s) then
    raise exception 'falhou 5: direto cancelado não devia ter acesso';
  end if;

  -- 6. click validado em atraso há 3 dias → acesso (tolerância de 7 dias)
  select * into s from public.subscritores where email = 'teste-click-atraso-3d@example.com';
  if not public.tem_acesso(s) then
    raise exception 'falhou 6: click validado em atraso há 3 dias devia ter acesso';
  end if;

  -- 7. click validado em atraso há 10 dias → sem acesso
  select * into s from public.subscritores where email = 'teste-click-atraso-10d@example.com';
  if public.tem_acesso(s) then
    raise exception 'falhou 7: click validado em atraso há 10 dias não devia ter acesso';
  end if;

  -- 8. click validado mas bloqueado (disputa) → sem acesso
  select * into s from public.subscritores where email = 'teste-click-bloqueado@example.com';
  if public.tem_acesso(s) then
    raise exception 'falhou 8: bloqueado não devia ter acesso';
  end if;

  -- 9. antes do backfill: click ativo sem estado_click não entra
  select * into s from public.subscritores where email = 'teste-click-backfill@example.com';
  if s.estado_click is not null then
    raise exception 'falhou 9: a linha de backfill devia começar com estado_click null';
  end if;
  if public.tem_acesso(s) then
    raise exception 'falhou 9: click ativo sem estado_click não devia ter acesso antes do backfill';
  end if;
end $$;

-- 9. A mesma instrução de backfill de 0009 (simula a migração a correr sobre
-- clientes Click que já existiam).
update public.subscritores set estado_click = 'validado'
 where origem = 'click' and estado_click is null;

do $$
declare
  s public.subscritores%rowtype;
begin
  select * into s from public.subscritores where email = 'teste-click-backfill@example.com';
  if s.estado_click is distinct from 'validado' then
    raise exception 'falhou 9: depois do backfill estado_click devia ser validado (é %)', s.estado_click;
  end if;
  if not public.tem_acesso(s) then
    raise exception 'falhou 9: depois do backfill o cliente Click antigo devia ter acesso';
  end if;

  -- O backfill não pode mexer em quem já tinha um estado.
  select * into s from public.subscritores where email = 'teste-click-pendente@example.com';
  if s.estado_click <> 'pendente' then
    raise exception 'falhou 9: o backfill alterou uma linha pendente (ficou %)', s.estado_click;
  end if;
  select * into s from public.subscritores where email = 'teste-click-recusado@example.com';
  if s.estado_click <> 'recusado' then
    raise exception 'falhou 9: o backfill alterou uma linha recusada (ficou %)', s.estado_click;
  end if;
  select * into s from public.subscritores where email = 'teste-click-direto@example.com';
  if s.estado_click is not null then
    raise exception 'falhou 9: o backfill tocou numa linha direto (ficou %)', s.estado_click;
  end if;

  -- 10. constraint: valor inválido recusado
  begin
    update public.subscritores set estado_click = 'outro'
     where email = 'teste-click-validado@example.com';
    raise exception 'falhou 10: a constraint aceitou estado_click = ''outro''';
  exception
    when check_violation then
      null; -- esperado
  end;

  -- 11. feed_dia.id_curto existe e aceita escrita
  insert into public.feed_dia (dia, ordem, colecao, loja, id_curto)
  values ('1999-01-01', 999, 'Teste 0009', 'Loja Teste', 'TESTE9');
  if not exists (select 1 from public.feed_dia where dia = '1999-01-01' and ordem = 999 and id_curto = 'TESTE9') then
    raise exception 'falhou 11: feed_dia.id_curto não guardou o valor';
  end if;

  raise notice 'ok: 0009 — tem_acesso, backfill, constraint e id_curto verificados';
end $$;

rollback;
