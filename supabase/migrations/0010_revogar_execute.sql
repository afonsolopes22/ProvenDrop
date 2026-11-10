-- ProvenDrop · 0010: funções privilegiadas só para a service role (auditoria de 2026-11-10).
--
-- Achado: as funções SECURITY DEFINER de 0004 e 0006 tinham "revoke all … from public",
-- mas o Supabase concede EXECUTE diretamente a anon e a authenticated por privilégios
-- por omissão do schema public. Resultado: qualquer pessoa com a chave anon (pública,
-- está em config.js) conseguia chamá-las por /rest/v1/rpc/…:
--   * corrigir_email_subscritor  → trocar o e-mail de um subscritor (e passar a receber
--                                  o e-mail diário dele);
--   * recalcular_subscritor      → forçar a derivação de uma linha;
--   * reservar_boas_vindas       → gastar as 5 tentativas de boas-vindas de um membro novo;
--   * registar_pedido_correcao   → encher o rate-limit da correção de e-mail.
-- Só as Edge Functions (service role) as usam. Aqui tira-se o EXECUTE a anon,
-- authenticated e public e garante-se o da service role.
--
-- Ficam como estavam, de propósito:
--   * membro_ativo_direto()  → as políticas RLS de feed_dia, verdes e do bucket kits
--                              chamam-na como authenticated (não recebe argumentos e só
--                              responde sobre quem chama); tira-se apenas a anon.
--   * tem_acesso(subscritores) → não é SECURITY DEFINER e só calcula sobre a linha dada.
--
-- Para o futuro: as funções novas criadas pelo dono das migrações deixam de nascer com
-- EXECUTE para anon/authenticated/public; quem precisar recebe um grant explícito.
-- Idempotente: pode correr-se mais de uma vez. Não altera 0001–0009.

revoke execute on function public.corrigir_email_subscritor(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.recalcular_subscritor(text)                             from public, anon, authenticated;
revoke execute on function public.reservar_boas_vindas(text, integer)                     from public, anon, authenticated;
revoke execute on function public.registar_pedido_correcao(text, integer, integer)        from public, anon, authenticated;
revoke execute on function public.membro_ativo_direto()                                   from public, anon;

grant execute on function public.corrigir_email_subscritor(text, text, text, text, text) to service_role;
grant execute on function public.recalcular_subscritor(text)                             to service_role;
grant execute on function public.reservar_boas_vindas(text, integer)                     to service_role;
grant execute on function public.registar_pedido_correcao(text, integer, integer)        to service_role;
grant execute on function public.membro_ativo_direto()                                   to authenticated, service_role;

-- id do utilizador de Auth por e-mail, sem gerar magic link. Até aqui as funções usavam
-- auth.admin.generateLink só para descobrir o id de um utilizador que já existia, e cada
-- generateLink invalida o link anterior: com vários eventos do Stripe em paralelo, o link
-- de boas-vindas acabado de enviar podia morrer. Só a service role a executa.
create or replace function public.id_utilizador(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;
revoke execute on function public.id_utilizador(text) from public, anon, authenticated;
grant execute on function public.id_utilizador(text) to service_role;

-- Funções futuras: sem EXECUTE automático para anon/authenticated/public.
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to service_role;
