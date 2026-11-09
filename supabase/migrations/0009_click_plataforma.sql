-- ProvenDrop · 0009: clientes Click na área de membros (2026-11-08).
--
-- O plano ProvenDrop × Click passa a dar acesso à área de membros completa.
-- A compra é automática (Stripe), mas a entrada depende de a Click confirmar
-- que a pessoa é cliente dela; o Afonso marca o resultado numa página de
-- administração (Edge Function admin-click). Até lá o cliente fica "pendente"
-- e não entra. A decisão de acesso continua toda em tem_acesso(): direto como
-- antes; click só com estado_click = 'validado'.
--
--   * subscritores.estado_click  'pendente' | 'validado' | 'recusado' | null.
--                                Null para direto. O webhook escreve 'pendente'
--                                explicitamente em cada compra Click (não há
--                                default), admin-click passa a 'validado' ou
--                                'recusado'. Quem já era Click antes desta
--                                migração fica 'validado' (backfill abaixo):
--                                continua com o que tinha e ganha a área.
--   * subscritores.loja          nome da loja/empresa indicado no checkout
--                                (campo personalizado do Payment Link Click).
--                                Serve para a Click confirmar o cliente.
--   * feed_dia.id_curto          código curto e estável da coleção (6 caracteres,
--                                calculado pela rotina a partir do link) usado
--                                nos links provendrop.com/c/<id> da mensagem de
--                                WhatsApp. Índice (id_curto, dia desc) para a
--                                área resolver o link pela linha mais recente.
--   * tem_acesso(s)              nova regra: não bloqueado, e (direto, ou click
--                                validado), e ativo ou em atraso há menos de
--                                7 dias (regra de 0004, inalterada).
--   * membro_ativo_direto()      mantém o nome e a implementação de 0004 (as
--                                políticas de feed_dia, verdes e do bucket kits
--                                dependem dele); como chama tem_acesso, passa a
--                                incluir os clientes Click validados. Os nomes
--                                das políticas ("… membros direto ativos") ficam
--                                como estão.
--
-- Escritas só pela service role (stripe-webhook, admin-click, rotina). O grant
-- de update do membro continua limitado a nichos, paises e guia_visto (0001);
-- não se mexe aqui. Idempotente: pode correr-se mais de uma vez. Não altera
-- 0001–0008.
--
-- Consultar as compras Click por confirmar:
--   select email, nome, telefone, loja, codigo_compra, criado_em from public.subscritores
--    where origem = 'click' and estado_click = 'pendente' order by criado_em;

-- ─────────────────────────────────────────────────────────────────────
-- subscritores: estado da validação pela Click e loja do checkout.
-- ─────────────────────────────────────────────────────────────────────
alter table public.subscritores add column if not exists estado_click text;
alter table public.subscritores add column if not exists loja         text;

alter table public.subscritores drop constraint if exists subscritores_estado_click_check;
alter table public.subscritores add constraint subscritores_estado_click_check
  check (estado_click in ('pendente', 'validado', 'recusado'));

comment on column public.subscritores.estado_click is 'Validação do cliente Click: ''pendente'' (pagou, a Click ainda não confirmou), ''validado'' (entra na área de membros), ''recusado'' (não é cliente: reembolsado e cancelado). Null para origem direto. Escrito pelo stripe-webhook (pendente) e por admin-click.';
comment on column public.subscritores.loja         is 'Nome da loja/empresa indicado no checkout do plano Click (campo personalizado do Payment Link). Serve para a Click confirmar que é cliente. Null para origem direto.';

-- ─────────────────────────────────────────────────────────────────────
-- feed_dia: id curto da coleção para os links /c/<id> do WhatsApp.
-- ─────────────────────────────────────────────────────────────────────
alter table public.feed_dia add column if not exists id_curto text;
create index if not exists feed_dia_id_curto on public.feed_dia (id_curto, dia desc);

comment on column public.feed_dia.id_curto is 'Código curto e estável da coleção (6 caracteres, derivado do link normalizado pela rotina). provendrop.com/c/<id> abre a coleção na área de membros pela linha mais recente com este id. Null em linhas antigas até a rotina o preencher.';

-- ─────────────────────────────────────────────────────────────────────
-- Backfill: quem já era Click antes desta migração continua com o que tinha
-- e ganha acesso à área. Só toca em linhas sem estado_click, por isso numa
-- segunda execução não altera compras novas que o webhook marcou 'pendente'.
-- ─────────────────────────────────────────────────────────────────────
update public.subscritores set estado_click = 'validado'
 where origem = 'click' and estado_click is null;

-- ─────────────────────────────────────────────────────────────────────
-- Acesso: não bloqueado; direto, ou click validado pela Click; ativo ou em
-- atraso há menos de 7 dias (tolerância de 0004, inalterada).
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.tem_acesso(s public.subscritores) returns boolean
language sql stable as $$
  select s.bloqueado_em is null
     and (s.origem = 'direto'
          or (s.origem = 'click' and s.estado_click = 'validado'))
     and (s.estado = 'ativo'
          or (s.estado = 'em_atraso' and s.em_atraso_desde is not null
              and s.em_atraso_desde > now() - interval '7 days'));
$$;
revoke all on function public.tem_acesso(public.subscritores) from public;

-- Mesmo nome e mesma implementação de 0004: as políticas RLS dependem dele.
create or replace function public.membro_ativo_direto() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscritores s
    where s.user_id = auth.uid() and public.tem_acesso(s)
  );
$$;
revoke all on function public.membro_ativo_direto() from public;
grant execute on function public.membro_ativo_direto() to authenticated;

-- Garantia (já verdade desde 0001): nada destas tabelas para anónimos.
revoke all on table public.subscritores, public.feed_dia from anon;
