-- ProvenDrop · 0006: correção do e-mail errado no checkout Direct (2026-11-06).
-- Usada pela Edge Function corrigir-email (docs/EMAIL.md). Idempotente.
--
--   subscritores.email_corrigido_em / email_corrigido_sessao  → uma correção por compra
--   correcoes_email                                             → auditoria (e-mail antigo e novo)
--   pedidos_correcao_email + registar_pedido_correcao()        → rate-limit por IP (só o hash)
--   corrigir_email_subscritor()                                 → troca o e-mail em subscricoes e
--                                                                 subscritores e regista a auditoria,
--                                                                 numa única transação

alter table public.subscritores add column if not exists email_corrigido_em     timestamptz;
alter table public.subscritores add column if not exists email_corrigido_sessao text;
comment on column public.subscritores.email_corrigido_em is 'Quando o e-mail do checkout foi corrigido pelo próprio (corrigir-email). Uma correção por sessão de checkout.';

create table if not exists public.correcoes_email (
  id                 bigint generated always as identity primary key,
  sessao             text not null,                 -- cs_… da sessão de checkout corrigida
  stripe_customer_id text,
  email_antigo       text not null,
  email_novo         text not null,
  ip_hash            text,                          -- SHA-256 do IP (nunca o IP)
  criado_em          timestamptz not null default now()
);
create index if not exists correcoes_email_sessao on public.correcoes_email (sessao);
alter table public.correcoes_email enable row level security;
revoke all on table public.correcoes_email from anon, authenticated;

-- Rate-limit: uma linha por pedido, só com o hash do IP; limpa-se o que tem mais de 1 dia.
create table if not exists public.pedidos_correcao_email (
  ip_hash   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists pedidos_correcao_email_ip on public.pedidos_correcao_email (ip_hash, criado_em);
alter table public.pedidos_correcao_email enable row level security;
revoke all on table public.pedidos_correcao_email from anon, authenticated;

-- Devolve true e regista o pedido se o IP ainda não atingiu p_limite pedidos nos últimos p_minutos;
-- false (sem registar) se já atingiu.
create or replace function public.registar_pedido_correcao(p_ip_hash text, p_limite integer, p_minutos integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.pedidos_correcao_email where criado_em < now() - interval '1 day';
  select count(*) into n from public.pedidos_correcao_email
   where ip_hash = p_ip_hash and criado_em > now() - make_interval(mins => p_minutos);
  if n >= p_limite then return false; end if;
  insert into public.pedidos_correcao_email (ip_hash) values (p_ip_hash);
  return true;
end $$;
revoke all on function public.registar_pedido_correcao(text, integer, integer) from public;

-- Troca o e-mail (minúsculas) em subscricoes e subscritores e regista a auditoria. Falha (e nada muda)
-- se o e-mail antigo não existir em subscritores, se a sessão já tiver sido corrigida, ou se o novo
-- e-mail já for de outro subscritor (unique). Devolve a linha de subscritores já corrigida.
create or replace function public.corrigir_email_subscritor(p_antigo text, p_novo text, p_sessao text, p_customer text, p_ip_hash text)
returns public.subscritores
language plpgsql security definer set search_path = public as $$
declare r public.subscritores%rowtype;
begin
  p_antigo := lower(trim(p_antigo)); p_novo := lower(trim(p_novo));
  if p_antigo = p_novo then raise exception 'mesmo_email'; end if;
  if exists (select 1 from public.correcoes_email where sessao = p_sessao) then raise exception 'ja_corrigido'; end if;
  select * into r from public.subscritores where email = p_antigo for update;
  if not found then raise exception 'subscritor_nao_encontrado'; end if;
  if r.email_corrigido_sessao = p_sessao then raise exception 'ja_corrigido'; end if;
  if exists (select 1 from public.subscritores where email = p_novo) then raise exception 'email_em_uso'; end if;
  update public.subscricoes set email = p_novo where email = p_antigo;
  update public.subscritores
     set email = p_novo, email_corrigido_em = now(), email_corrigido_sessao = p_sessao
   where email = p_antigo returning * into r;
  insert into public.correcoes_email (sessao, stripe_customer_id, email_antigo, email_novo, ip_hash)
  values (p_sessao, p_customer, p_antigo, p_novo, p_ip_hash);
  return r;
end $$;
revoke all on function public.corrigir_email_subscritor(text, text, text, text, text) from public;
