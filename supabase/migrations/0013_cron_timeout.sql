-- 0013 · Agendamentos: esperar 30 s pela resposta das funções, em vez de 5 s.
--
-- O pg_net espera 5 s por omissão. Quando a Edge Function arranca a frio (o stripe-webhook carrega
-- o SDK do Stripe), a resposta chega depois disso e o pedido fica registado em net._http_response
-- como "Timeout of 5000 ms reached" (visto a 2026-11-10 às 22:15, 22:30, 23:00 e 23:15, nos três
-- agendamentos). Com 30 s o pedido espera pela resposta e o registo passa a dizer o que a função
-- respondeu.
--
-- Só muda o tempo de espera: nomes, horários, endereços e cabeçalhos ficam iguais. cron.schedule
-- com um nome que já existe atualiza esse agendamento (mantém o jobid e o histórico).
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0013_cron_timeout.sql
-- Idempotente.

select cron.schedule(
  'provendrop-email-diario',
  '0 * * * *',
  $cron$
    select net.http_post(
      url     := (select valor from public.config where chave = 'email_diario_url'),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select valor from public.config where chave = 'cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

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
      timeout_milliseconds := 30000
    );
  $cron$
);

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
      timeout_milliseconds := 30000
    );
  $cron$
);
