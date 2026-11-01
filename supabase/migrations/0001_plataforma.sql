-- ProvenDrop · porta "Direto": área de membros, feed diário e arquivo.
-- Aplicar no SQL Editor do projeto Supabase (ou `supabase db push`).
-- Idempotente: pode correr-se mais de uma vez.
--
-- Regras de acesso (RLS):
--   * feed_dia, verdes e o bucket "kits" só são lidos por subscritores
--     com estado 'ativo' e origem 'direto'. Nenhuma leitura anónima.
--   * cada subscritor lê o seu registo e só pode alterar nichos, países
--     e guia_visto. Tudo o resto é escrito pelas Edge Functions
--     (service role) ou pelo script publicar_plataforma.py.
--   * config e stripe_eventos: sem políticas, logo só a service role.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─────────────────────────────────────────────────────────────────────
-- Subscritores (uma linha por cliente, nas duas portas)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.subscritores (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid unique references auth.users (id) on delete set null,  -- só os 'direto' têm login
  email                  text not null unique check (email = lower(email)),
  origem                 text not null check (origem in ('direto', 'click')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  estado                 text not null default 'ativo' check (estado in ('ativo', 'cancelado', 'em_atraso')),
  nichos                 text[] not null default '{}',
  paises                 text[] not null default '{}',
  guia_visto             boolean not null default false,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);

create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists subscritores_atualizado_em on public.subscritores;
create trigger subscritores_atualizado_em
  before update on public.subscritores
  for each row execute function public.tocar_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────
-- Feed do dia (o que o bot da Click mostra em /pr hoje, agora em tabela)
-- Chave (dia, ordem). Escrito por publicar_plataforma.py.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.feed_dia (
  dia               date not null,
  ordem             integer not null,
  nicho             text,
  colecao           text,
  loja              text,
  link_colecao      text,
  score             numeric(4,2),
  veredito          text,
  mercado_destaque  text,
  mercados_verdes   text[] not null default '{}',
  paises_ads        text[] not null default '{}',
  estado            text,                    -- 'aprovada' | 'a observar'
  alcance_eu        numeric,
  anuncios_ativos   integer,
  dias_ativo        integer,
  trends_validados  integer,
  keyword_en        text,
  keyword_it        text,
  zip_url           text,                    -- link externo (Drive) enquanto não houver ficheiro no Storage
  zip_path          text,                    -- caminho no bucket privado "kits" (preferido)
  nota              text,
  atualizado_em     timestamptz not null default now(),
  primary key (dia, ordem)
);

-- ─────────────────────────────────────────────────────────────────────
-- Arquivo de aprovadas ("verdes"): mesmas colunas do separador atual
-- Chave (loja, colecao).
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.verdes (
  loja                        text not null,
  colecao                     text not null,
  nicho                       text,
  link_colecao                text,
  score                       numeric(4,2),
  veredito                    text,
  mercado_destaque            text,
  mercados_verdes             text[] not null default '{}',
  paises_ads                  text[] not null default '{}',
  trends_validados            integer,
  alcance_eu                  numeric,
  anuncios_ativos             integer,
  dias_ativo                  integer,
  data_aprovacao              date,
  ainda_a_anunciar            boolean,
  anuncios_ultima_verificacao integer,
  ultima_verificacao          date,
  zip_url                     text,
  zip_path                    text,
  nota                        text,
  atualizado_em               timestamptz not null default now(),
  primary key (loja, colecao)
);

-- Registo do email diário (um por dia) e dos eventos Stripe (idempotência)
create table if not exists public.envios_diarios (
  dia         date primary key,
  enviados    integer not null default 0,
  enviado_em  timestamptz not null default now()
);

create table if not exists public.stripe_eventos (
  id          text primary key,
  tipo        text not null,
  recebido_em timestamptz not null default now()
);

-- Valores que o pg_cron precisa de ler (preenchidos à mão depois do deploy)
create table if not exists public.config (
  chave text primary key,
  valor text not null
);
insert into public.config (chave, valor) values
  ('email_diario_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/email-diario'),
  ('cron_secret',      'MUDAR-ESTE-VALOR')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- Funções de apoio
-- ─────────────────────────────────────────────────────────────────────
-- Verdadeiro se quem chama é um subscritor 'direto' com estado 'ativo'.
create or replace function public.membro_ativo_direto() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscritores s
    where s.user_id = auth.uid() and s.estado = 'ativo' and s.origem = 'direto'
  );
$$;
revoke all on function public.membro_ativo_direto() from public;
grant execute on function public.membro_ativo_direto() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Privilégios e RLS
-- ─────────────────────────────────────────────────────────────────────
alter table public.subscritores   enable row level security;
alter table public.feed_dia       enable row level security;
alter table public.verdes         enable row level security;
alter table public.envios_diarios enable row level security;
alter table public.stripe_eventos enable row level security;
alter table public.config         enable row level security;

-- O Supabase concede tudo a anon/authenticated por defeito: retirar e dar só o necessário.
revoke all on table public.subscritores, public.feed_dia, public.verdes,
               public.envios_diarios, public.stripe_eventos, public.config
  from anon, authenticated;
grant select on table public.subscritores, public.feed_dia, public.verdes to authenticated;
grant update (nichos, paises, guia_visto) on table public.subscritores to authenticated;

drop policy if exists "subscritor le o proprio registo" on public.subscritores;
create policy "subscritor le o proprio registo" on public.subscritores
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "subscritor altera preferencias" on public.subscritores;
create policy "subscritor altera preferencias" on public.subscritores
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "feed so para membros direto ativos" on public.feed_dia;
create policy "feed so para membros direto ativos" on public.feed_dia
  for select to authenticated using (public.membro_ativo_direto());

drop policy if exists "verdes so para membros direto ativos" on public.verdes;
create policy "verdes so para membros direto ativos" on public.verdes
  for select to authenticated using (public.membro_ativo_direto());

-- ─────────────────────────────────────────────────────────────────────
-- Storage: bucket privado "kits" (zips). Leitura só para membros direto ativos.
-- Escrita apenas pela service role (publicar_plataforma.py).
-- ─────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('kits', 'kits', false, 209715200)   -- 200 MB por ficheiro
on conflict (id) do update set public = false;

drop policy if exists "kits para membros direto ativos" on storage.objects;
create policy "kits para membros direto ativos" on storage.objects
  for select to authenticated using (bucket_id = 'kits' and public.membro_ativo_direto());

-- ─────────────────────────────────────────────────────────────────────
-- Email diário: o pg_cron chama a Edge Function a cada hora certa; a
-- função só envia quando a hora em Europe/Lisbon for HORA_ENVIO (variável
-- de ambiente da função) e ainda não tiver enviado nesse dia. Assim o
-- horário de verão não desalinha nada.
-- ─────────────────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'provendrop-email-diario';
select cron.schedule(
  'provendrop-email-diario',
  '0 * * * *',
  $cron$
    select net.http_post(
      url     := (select valor from public.config where chave = 'email_diario_url'),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select valor from public.config where chave = 'cron_secret')),
      body    := '{}'::jsonb
    );
  $cron$
);
