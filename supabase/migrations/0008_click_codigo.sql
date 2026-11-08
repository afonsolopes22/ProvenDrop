-- ProvenDrop · 0008: código de compra e contacto dos subscritores Click (2026-11-08).
--
-- Quem paga o plano Click é adicionado ao grupo de WhatsApp à mão. Para ligar o
-- pagamento à pessoa que escreve no WhatsApp, cada compra tem um código curto
-- "PD-XXXXXX" (6 caracteres derivados do id da sessão de checkout, o mesmo
-- cálculo em bem-vindo-click.html e no stripe-webhook: _shared/codigo.ts).
--
--   * subscritores.codigo_compra  "PD-XXXXXX" da última compra Click
--   * subscritores.telefone       telefone recolhido no checkout (Payment Link com
--                                 "Collect phone number"); null se não recolhido
--   * subscritores.nome           nome do checkout
--
-- Escritas só pela service role (stripe-webhook). O membro não lê nem altera estes
-- campos: a política de select de 0001 devolve a linha inteira, mas a área só pede
-- os campos de que precisa e nada disto é mostrado; o grant de update continua
-- limitado a nichos, paises e guia_visto. Idempotente.
--
-- Consultar as compras Click:
--   select email, nome, telefone, codigo_compra, criado_em from public.subscritores
--    where origem = 'click' order by criado_em desc;

alter table public.subscritores add column if not exists codigo_compra text;
alter table public.subscritores add column if not exists telefone      text;
alter table public.subscritores add column if not exists nome          text;

comment on column public.subscritores.codigo_compra is 'Código "PD-XXXXXX" da última compra Click (derivado do id da sessão de checkout; igual ao que a página de boas-vindas mostra e põe na mensagem de WhatsApp).';
comment on column public.subscritores.telefone      is 'Telefone recolhido no checkout do Stripe (Payment Link com recolha de telefone). Só para o Afonso identificar quem escreve no WhatsApp.';
comment on column public.subscritores.nome          is 'Nome recolhido no checkout do Stripe.';

create index if not exists subscritores_codigo_compra on public.subscritores (codigo_compra);
