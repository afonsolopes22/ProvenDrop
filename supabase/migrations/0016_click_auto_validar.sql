-- 0016 · Plano Click: acesso imediato, com rejeição posterior (2026-11-13).
--
-- Até aqui quem pagava pelo link da Click ficava estado_click = 'pendente' e só entrava na área de
-- membros depois de o Afonso carregar "Validate" em admin.html. Agora o stripe-webhook grava logo
-- estado_click = 'validado' numa compra Click nova e marca a hora em validado_auto_em; o Afonso pode
-- recusar depois com "Reject & refund" (admin-click aceita recusar pendente OU validado com
-- validado_auto_em preenchido). Com CLICK_AUTO_VALIDAR=false no stripe-webhook volta tudo a 'pendente'.
--
--   * subscritores.validado_auto_em  quando a compra foi validada automaticamente; null = validação
--                                    manual, ou ainda não validada. Escrita só pela service role.
--
-- tem_acesso() NÃO muda: continua "direto, ou click com estado_click = 'validado'".
--
-- Aplicar ANTES de publicar o stripe-webhook novo (ele escreve esta coluna; sem ela, a compra Click
-- dá erro no webhook e o Stripe repete o evento):
--   supabase db query --linked --file supabase/migrations/0016_click_auto_validar.sql
-- Idempotente. Não altera dados existentes.

alter table public.subscritores add column if not exists validado_auto_em timestamptz;

-- Para a lista "Validados automaticamente nos últimos 7 dias" de admin.html.
create index if not exists subscritores_validado_auto_em on public.subscritores (validado_auto_em desc)
  where validado_auto_em is not null;

comment on column public.subscritores.validado_auto_em is 'Plano Click: quando a compra foi validada automaticamente pelo stripe-webhook (acesso imediato, com rejeição posterior em admin.html). Null = validação manual ou ainda não validada.';
