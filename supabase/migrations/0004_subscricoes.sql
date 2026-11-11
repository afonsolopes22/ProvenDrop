-- ProvenDrop · 0004: uma linha por subscrição, idempotência sem perda,
-- tolerância em atraso, bloqueio por disputa, boas-vindas com reserva,
-- varrimentos por pg_cron e cron_secret aleatório.
-- Achados: C1, C2, S3, A1, A2, A3, A4, M1, M7, S10 (docs/PAGAMENTOS.md, docs/SEGURANCA.md).
-- Idempotente: pode correr-se mais de uma vez. Não altera 0001–0003.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────
-- A1/A2 · stripe_eventos: nunca apagar; processado_em marca a conclusão.
-- ─────────────────────────────────────────────────────────────────────
alter table public.stripe_eventos add column if not exists processado_em timestamptz;
alter table public.stripe_eventos add column if not exists tentativas integer not null default 1;
comment on column public.stripe_eventos.processado_em is 'Null = em curso (ou falhou). Repetido concluído → 200; em curso há < 5 min → 503; em curso há mais → reprocessa.';

-- ─────────────────────────────────────────────────────────────────────
-- C2/S3 · subscricoes: uma linha por stripe_subscription_id (direto e click).
-- Escrita só pelo webhook (service role). A comissão da Click lê-se daqui.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.subscricoes (
  stripe_subscription_id text primary key,
  stripe_customer_id     text,
  email                  text not null check (email = lower(email)),
  origem                 text not null check (origem in ('direto', 'click')),
  estado                 text not null check (estado in ('ativo', 'em_atraso', 'incompleto', 'cancelado')),
  cancel_at              timestamptz,          -- fim do acesso quando cancel_at_period_end
  em_atraso_desde        timestamptz,          -- 1.ª falha de pagamento (tolerância de 7 dias)
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create index if not exists subscricoes_email on public.subscricoes (email);
create index if not exists subscricoes_customer on public.subscricoes (stripe_customer_id);
drop trigger if exists subscricoes_atualizado_em on public.subscricoes;
create trigger subscricoes_atualizado_em
  before update on public.subscricoes
  for each row execute function public.tocar_atualizado_em();
alter table public.subscricoes enable row level security;
revoke all on table public.subscricoes from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- subscritores: origem/estado passam a DERIVADOS de subscricoes
-- (recalcular_subscritor). Campos novos de acesso e de boas-vindas.
-- ─────────────────────────────────────────────────────────────────────
alter table public.subscritores add column if not exists em_atraso_desde          timestamptz;
alter table public.subscritores add column if not exists acesso_fim               timestamptz;  -- B4: data de fim quando cancel_at_period_end
alter table public.subscritores add column if not exists bloqueado_em             timestamptz;  -- A4: disputa → sem acesso
alter table public.subscritores add column if not exists bloqueado_motivo         text;
alter table public.subscritores add column if not exists boas_vindas_tentativa_em timestamptz;  -- A3: reserva atómica
alter table public.subscritores add column if not exists boas_vindas_tentativas   integer not null default 0;
alter table public.subscritores add column if not exists regresso_em              timestamptz;  -- e-mail de regresso enviado

alter table public.subscritores drop constraint if exists subscritores_estado_check;
alter table public.subscritores add constraint subscritores_estado_check
  check (estado in ('ativo', 'cancelado', 'em_atraso', 'incompleto'));
-- Um e-mail pode ter várias subscrições: os ids em subscritores são só "a atual".
alter table public.subscritores drop constraint if exists subscritores_stripe_customer_id_key;
alter table public.subscritores drop constraint if exists subscritores_stripe_subscription_id_key;

-- O membro continua a ler a própria linha (política de 0001); as colunas novas
-- são visíveis para a área mostrar dias de tolerância e data de fim.

-- ─────────────────────────────────────────────────────────────────────
-- Acesso (M1, A4): direto, não bloqueado, ativo ou em atraso há menos de 7 dias.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.tem_acesso(s public.subscritores) returns boolean
language sql stable as $$
  select s.origem = 'direto'
     and s.bloqueado_em is null
     and (s.estado = 'ativo'
          or (s.estado = 'em_atraso' and s.em_atraso_desde is not null
              and s.em_atraso_desde > now() - interval '7 days'));
$$;
revoke all on function public.tem_acesso(public.subscritores) from public;

create or replace function public.membro_ativo_direto() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscritores s
    where s.user_id = auth.uid() and public.tem_acesso(s)
  );
$$;
revoke all on function public.membro_ativo_direto() from public;
grant execute on function public.membro_ativo_direto() to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- Derivação: a melhor subscrição direto manda; se só houver click (ou a direto
-- estiver cancelada e houver click), a linha reflete a click. Um evento click
-- nunca retira acesso a uma direto com acesso (S3).
-- ─────────────────────────────────────────────────────────────────────
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
end $$;
revoke all on function public.recalcular_subscritor(text) from public;

-- ─────────────────────────────────────────────────────────────────────
-- A3 · reserva atómica das boas-vindas: devolve o n.º da tentativa se reservou,
-- null se não há nada a enviar (já enviadas, sem acesso, ou tentativa recente).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.reservar_boas_vindas(p_email text, p_minutos integer default 10) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.subscritores s
     set boas_vindas_tentativa_em = now(), boas_vindas_tentativas = s.boas_vindas_tentativas + 1
   where s.email = p_email
     and s.boas_vindas_em is null
     and public.tem_acesso(s)
     and (s.boas_vindas_tentativa_em is null or s.boas_vindas_tentativa_em < now() - make_interval(mins => p_minutos))
  returning s.boas_vindas_tentativas into n;
  return n;
end $$;
revoke all on function public.reservar_boas_vindas(text, integer) from public;

-- ─────────────────────────────────────────────────────────────────────
-- S10 · cron_secret aleatório se ainda for o valor do repositório.
-- URLs das funções chamadas pelo pg_cron.
-- ─────────────────────────────────────────────────────────────────────
update public.config set valor = encode(gen_random_bytes(32), 'hex')
 where chave = 'cron_secret' and valor = 'MUDAR-ESTE-VALOR';
insert into public.config (chave, valor) values
  ('stripe_webhook_url', 'https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook'),
  ('reconciliar_url',    'https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/reconciliar')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- A3 · varrimento das boas-vindas por enviar, de 15 em 15 minutos.
-- M7 · reconciliação Stripe ↔ base, 1× por dia (06:30 UTC), só leitura + alerta.
-- ─────────────────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'provendrop-boas-vindas';
select cron.schedule(
  'provendrop-boas-vindas',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url     := (select valor from public.config where chave = 'stripe_webhook_url') || '?varrer_boas_vindas=1',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select valor from public.config where chave = 'cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000   -- 0013: o pg_net espera 5 s por omissão, menos do que um arranque a frio
    );
  $cron$
);

select cron.unschedule(jobid) from cron.job where jobname = 'provendrop-reconciliar';
select cron.schedule(
  'provendrop-reconciliar',
  '30 6 * * *',
  $cron$
    select net.http_post(
      url     := (select valor from public.config where chave = 'reconciliar_url'),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select valor from public.config where chave = 'cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000   -- 0013: o pg_net espera 5 s por omissão, menos do que um arranque a frio
    );
  $cron$
);
