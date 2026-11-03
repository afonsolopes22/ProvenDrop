-- ProvenDrop · 0005: anúncios no Google além do Meta e kit em todas as
-- coleções da lista do dia (research de 2026-11-02).
--
--   * feed_dia: anuncios_meta, anuncios_google, plataformas, anunciante_google,
--     kit_pronto. Escritas por publicar_plataforma.py a partir do feed_bot.json
--     (com valores por omissão para feeds antigos sem estes campos).
--   * verdes: anuncios_google, plataformas.
--   * kit_pronto = true sempre que a linha tem zip_path ou zip_url, seja qual
--     for o estado (aprovada ou a observar): desde 2026-11-02 todas as
--     coleções do feed recebem o Launch Kit.
--
-- Acesso: as colunas novas seguem as políticas de 0001/0004 (só membros direto
-- com acesso leem feed_dia e verdes). anon não tem privilégio nenhum nestas
-- tabelas (revoke em 0001), logo anunciante_google nunca é exposto a anónimos;
-- o revoke repete-se aqui por garantia.
-- Idempotente: pode correr-se mais de uma vez. Não altera 0001–0004.

alter table public.feed_dia add column if not exists anuncios_meta     integer;
alter table public.feed_dia add column if not exists anuncios_google   integer;
alter table public.feed_dia add column if not exists plataformas       text[];
alter table public.feed_dia add column if not exists anunciante_google text;
alter table public.feed_dia add column if not exists kit_pronto        boolean not null default false;

alter table public.verdes add column if not exists anuncios_google integer;
alter table public.verdes add column if not exists plataformas     text[];

comment on column public.feed_dia.anuncios_meta     is 'Anúncios ativos no Meta (Facebook/Instagram). Null em feeds antigos: usar anuncios_ativos.';
comment on column public.feed_dia.anuncios_google   is 'Anúncios ativos no Google (Shopping/YouTube/Display). Null em feeds antigos = 0.';
comment on column public.feed_dia.plataformas       is 'Onde a loja anuncia: {meta}, {google} ou {meta,google}. Null em feeds antigos = {meta}.';
comment on column public.feed_dia.anunciante_google is 'Nome da empresa anunciante no Google Ads Transparency (ex.: "Golden Season LLC"). Só na área privada; nunca no site nem no e-mail.';
comment on column public.feed_dia.kit_pronto        is 'True quando há Launch Kit (zip_path no bucket kits ou zip_url), aprovada ou a observar.';
comment on column public.verdes.anuncios_google     is 'Anúncios ativos no Google na aprovação. Null em registos antigos = 0.';
comment on column public.verdes.plataformas         is 'Onde a loja anunciava na aprovação: {meta}, {google} ou {meta,google}.';

-- Linhas já publicadas: kit_pronto reflete o que já lá está.
update public.feed_dia set kit_pronto = true
 where kit_pronto = false and (zip_path is not null or zip_url is not null);

-- Garantia (já verdade desde 0001): nada destas tabelas para anónimos.
revoke all on table public.feed_dia, public.verdes from anon;
