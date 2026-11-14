-- 0017 · Plano Click: teste grátis de 5 dias, com anti-abuso (2026-11-14).
--
-- O link Click passa a criar subscrições com 5 dias de teste (trialing no Stripe). Aqui:
--
--   * estado 'teste' em subscricoes e subscritores (subscrição trialing). tem_acesso() dá acesso em
--     'teste' como em 'ativo' (com estado_click = 'validado', como sempre para o plano Click).
--     teste_fim: quando acaba o teste (trial_end do Stripe).
--   * recalcular_subscritor() ordena 'teste' logo a seguir a 'ativo' e copia teste_fim.
--   * Anti-abuso (um teste por pessoa): subscritores guarda os últimos 4 dígitos, a impressão digital e
--     o tipo do cartão (credit/debit/prepaid), o telefone normalizado (só dígitos, com indicativo) e a loja
--     normalizada (minúsculas, sem espaços nem pontuação). testes_click_usados regista cada valor que já
--     teve teste (chave única por tipo+valor, ligada à subscrição: repetir o mesmo evento não conta como
--     repetição). teste_repetido / teste_motivo dizem porque é que uma compra não teve teste.
--   * Limites do teste impostos pela base (RLS):
--       - feed_dia: em teste só se lê a lista mais recente (ultimo_dia_feed());
--       - verdes (Library): em teste não se lê;
--       - bucket kits: em teste não se lê diretamente; o link do kit vem da função conta-membro, que
--         conta 1 kit por dia (Lisboa) em kit_downloads.
--
-- Para quem não está em 'teste' nada muda: as funções novas devolvem false/ignoram-se.
-- Escritas só pela service role (stripe-webhook, conta-membro, admin-click).
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0017_click_teste.sql
-- Idempotente.

-- ───────────────────────────────────────────────────────────────────
-- Estado 'teste' e fim do teste
-- ───────────────────────────────────────────────────────────────────
alter table public.subscricoes drop constraint if exists subscricoes_estado_check;
alter table public.subscricoes add constraint subscricoes_estado_check
  check (estado in ('ativo', 'teste', 'em_atraso', 'incompleto', 'cancelado'));
alter table public.subscritores drop constraint if exists subscritores_estado_check;
alter table public.subscritores add constraint subscritores_estado_check
  check (estado in ('ativo', 'teste', 'cancelado', 'em_atraso', 'incompleto'));

alter table public.subscricoes  add column if not exists teste_fim timestamptz;
alter table public.subscritores add column if not exists teste_fim timestamptz;

-- ───────────────────────────────────────────────────────────────────
-- Anti-abuso: dados do cartão, telefone e loja normalizados; valores que já tiveram teste
-- ───────────────────────────────────────────────────────────────────
alter table public.subscritores add column if not exists cartao_ultimos4  text;
alter table public.subscritores add column if not exists cartao_impressao text;
alter table public.subscritores add column if not exists cartao_tipo      text;   -- credit / debit / prepaid / unknown
alter table public.subscritores add column if not exists telefone_norm    text;
alter table public.subscritores add column if not exists loja_norm        text;
alter table public.subscritores add column if not exists teste_repetido   boolean not null default false;
alter table public.subscritores add column if not exists teste_motivo     text;   -- ex.: 'repeat: phone, store' / 'prepaid card'

create table if not exists public.testes_click_usados (
  tipo                   text not null check (tipo in ('cartao', 'telefone', 'loja')),
  valor                  text not null check (char_length(valor) >= 3),
  email                  text not null,
  stripe_subscription_id text not null,
  criado_em              timestamptz not null default now(),
  primary key (tipo, valor)
);
alter table public.testes_click_usados enable row level security;
revoke all on table public.testes_click_usados from anon, authenticated;
comment on table public.testes_click_usados is 'Plano Click: cada cartão (impressão digital), telefone e loja normalizados que já tiveram teste grátis, com a subscrição que o teve. Escrita só pelo stripe-webhook.';

-- ───────────────────────────────────────────────────────────────────
-- Downloads de kits em teste (1 por dia de Lisboa)
-- ───────────────────────────────────────────────────────────────────
create table if not exists public.kit_downloads (
  user_id   uuid not null,
  dia       date not null,
  zip_path  text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, dia)
);
alter table public.kit_downloads enable row level security;
revoke all on table public.kit_downloads from anon, authenticated;
comment on table public.kit_downloads is 'Kit escolhido por um membro em teste em cada dia (Lisboa): 1 por dia; o mesmo kit pode voltar a ser descarregado nesse dia. Escrita só pela função conta-membro.';

-- ───────────────────────────────────────────────────────────────────
-- Acesso: 'teste' conta como 'ativo' (resto igual a 0009)
-- ───────────────────────────────────────────────────────────────────
create or replace function public.tem_acesso(s public.subscritores) returns boolean
language sql stable as $$
  select s.bloqueado_em is null
     and (s.origem = 'direto'
          or (s.origem = 'click' and s.estado_click = 'validado'))
     and (s.estado in ('ativo', 'teste')
          or (s.estado = 'em_atraso' and s.em_atraso_desde is not null
              and s.em_atraso_desde > now() - interval '7 days'));
$$;
revoke all on function public.tem_acesso(public.subscritores) from public;

-- Derivação de subscritores: 'teste' logo a seguir a 'ativo'; teste_fim copiado.
create or replace function public.recalcular_subscritor(p_email text) returns public.subscritores
language plpgsql security definer set search_path = public as $$
declare
  d public.subscricoes%rowtype;
  c public.subscricoes%rowtype;
  r public.subscritores%rowtype;
  tem_d boolean; tem_c boolean;
begin
  select * into d from public.subscricoes
   where email = p_email and origem = 'direto'
   order by case estado when 'ativo' then 0 when 'teste' then 1 when 'em_atraso' then 2 when 'incompleto' then 3 else 4 end, atualizado_em desc
   limit 1;
  tem_d := found;
  select * into c from public.subscricoes
   where email = p_email and origem = 'click'
   order by case estado when 'ativo' then 0 when 'teste' then 1 when 'em_atraso' then 2 when 'incompleto' then 3 else 4 end, atualizado_em desc
   limit 1;
  tem_c := found;

  if not tem_d and not tem_c then
    select * into r from public.subscritores where email = p_email;
    return r;
  end if;

  if tem_d and (d.estado <> 'cancelado' or not tem_c) then
    update public.subscritores set origem = 'direto', estado = d.estado,
      stripe_customer_id = d.stripe_customer_id, stripe_subscription_id = d.stripe_subscription_id,
      em_atraso_desde = d.em_atraso_desde, acesso_fim = d.cancel_at, teste_fim = d.teste_fim
     where email = p_email returning * into r;
  else
    update public.subscritores set origem = 'click', estado = c.estado,
      stripe_customer_id = c.stripe_customer_id, stripe_subscription_id = c.stripe_subscription_id,
      em_atraso_desde = c.em_atraso_desde, acesso_fim = c.cancel_at, teste_fim = c.teste_fim
     where email = p_email returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.recalcular_subscritor(text) from public, anon, authenticated;
grant execute on function public.recalcular_subscritor(text) to service_role;

-- ───────────────────────────────────────────────────────────────────
-- Limites do teste (RLS)
-- ───────────────────────────────────────────────────────────────────
-- Quem chama está em teste (e com acesso)?
create or replace function public.membro_em_teste() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscritores s
    where s.user_id = auth.uid() and s.estado = 'teste' and public.tem_acesso(s)
  );
$$;
revoke all on function public.membro_em_teste() from public, anon;
grant execute on function public.membro_em_teste() to authenticated, service_role;

-- Dia da lista mais recente (função à parte: uma política de feed_dia não pode ler feed_dia sem recursão).
create or replace function public.ultimo_dia_feed() returns date
language sql stable security definer set search_path = public as $$
  select max(dia) from public.feed_dia;
$$;
revoke all on function public.ultimo_dia_feed() from public, anon;
grant execute on function public.ultimo_dia_feed() to authenticated, service_role;

drop policy if exists "feed so para membros direto ativos" on public.feed_dia;
create policy "feed so para membros direto ativos" on public.feed_dia
  for select to authenticated
  using (public.membro_ativo_direto() and (not public.membro_em_teste() or dia = public.ultimo_dia_feed()));

drop policy if exists "verdes so para membros direto ativos" on public.verdes;
create policy "verdes so para membros direto ativos" on public.verdes
  for select to authenticated
  using (public.membro_ativo_direto() and not public.membro_em_teste());

drop policy if exists "kits para membros direto ativos" on storage.objects;
create policy "kits para membros direto ativos" on storage.objects
  for select to authenticated
  using (bucket_id = 'kits' and public.membro_ativo_direto() and not public.membro_em_teste());

comment on column public.subscritores.teste_fim is 'Plano Click: fim do teste grátis (trial_end do Stripe). Null fora do teste.';
comment on column public.subscritores.teste_repetido is 'Plano Click: a compra não teve teste porque um dos dados (cartão, telefone, loja) já tinha tido teste.';
