-- Teste da migração 0010 (só leitura; correr DEPOIS de a aplicar):
--   SQL Editor (colar inteiro) ou
--   supabase db query --linked --file supabase/tests/0010_revogar_execute.sql
-- Falha com "falhou N: …" se algum privilégio estiver errado; no fim dá "ok: 0010".
do $$
declare f text; r text;
begin
  -- 1. anon e authenticated não executam nenhuma das funções privilegiadas.
  foreach f in array array[
    'public.corrigir_email_subscritor(text,text,text,text,text)',
    'public.recalcular_subscritor(text)',
    'public.reservar_boas_vindas(text,integer)',
    'public.registar_pedido_correcao(text,integer,integer)'
  ] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'falhou 1: % ainda executa %', r, f; end if;
    end loop;
    -- 2. a service role continua a executar (as Edge Functions dependem disto).
    if not has_function_privilege('service_role', f, 'execute') then raise exception 'falhou 2: service_role não executa %', f; end if;
  end loop;
  -- 3. as políticas RLS continuam a funcionar: authenticated executa membro_ativo_direto; anon não.
  if not has_function_privilege('authenticated', 'public.membro_ativo_direto()', 'execute') then raise exception 'falhou 3: authenticated não executa membro_ativo_direto'; end if;
  if has_function_privilege('anon', 'public.membro_ativo_direto()', 'execute') then raise exception 'falhou 3: anon executa membro_ativo_direto'; end if;
  -- 4. nenhuma outra função SECURITY DEFINER do schema public fica aberta a anon.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')) then
    raise exception 'falhou 4: há funções security definer executáveis por anon';
  end if;
  raise notice 'ok: 0010 — funções privilegiadas só para a service role';
end $$;
