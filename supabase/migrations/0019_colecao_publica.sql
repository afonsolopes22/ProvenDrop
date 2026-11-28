-- 0019 · Pré-visualização pública de uma coleção, para os links provendrop.com/c/<id> do grupo da Click (2026-11-28).
--
-- Quem chega por /c/<id> sem sessão via só o login e desistia. A página passa a mostrar uma pré-visualização, mas
-- feed_dia continua fechada (só membros com sessão, RLS): esta função devolve, para UM id_curto, só campos seguros.
-- NUNCA devolve: loja, link_colecao (domínio, /collections/), o título da coleção (só na área de membros), zip_url,
-- zip_path, kit_pronto, nota, keywords, anunciante_google, a foto nem a data do envio (com o id, a data daria o
-- endereço da foto original no bucket público "fotos"). Em vez da foto devolve tem_foto: a página pede uma miniatura
-- desfocada à Edge Function colecao-foto. Em vez do título devolve "tipo": o tipo de produto, tirado do início da
-- frase "Why it's working" ("Printed quilted laundry baskets at $60–70; …" → "Printed quilted laundry baskets").
-- A frase e o tipo só vêm se não mencionarem a loja nem o domínio (sem maiúsculas, espaços nem pontuação).
-- Coleção retirada (o envio mais recente com esse id tem retirada = true) ou id inválido → null.
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0019_colecao_publica.sql
-- Idempotente. Reverter: drop function if exists public.colecao_publica(text);

create or replace function public.colecao_publica(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.feed_dia;
  host text; base text; loja text;
  porque text; tipo text;
  norm constant text := '[^a-z0-9]';
begin
  if p_id is null or upper(trim(p_id)) !~ '^[A-HJ-NP-Z2-9]{6}$' then return null; end if;
  select * into r from public.feed_dia where id_curto = upper(trim(p_id)) order by dia desc, ordem limit 1;
  if not found or r.retirada is true then return null; end if;

  host := lower(coalesce(substring(coalesce(r.link_colecao, '') from '^[A-Za-z]+://(?:www\.)?([^/?#:]+)'), ''));
  base := regexp_replace(split_part(host, '.', 1), norm, '', 'g');
  loja := regexp_replace(lower(coalesce(r.loja, '')), norm, '', 'g');

  -- "Why it's working": safe when, without case, spaces or punctuation, it names neither the store nor the domain.
  porque := r.porque_funciona;
  if porque is not null and (
       (length(loja) >= 3 and regexp_replace(lower(porque), norm, '', 'g') like '%' || loja || '%')
    or (length(base) >= 4 and regexp_replace(lower(porque), norm, '', 'g') like '%' || base || '%')
    or lower(porque) ~ '(https?:|www\.|/collections/|\.(com|net|shop|store|co|io|de|fr|it|es|nl|uk|pt)\M)') then
    porque := null;
  end if;
  -- Product type: the sentence up to the first ";" or ",", without the price part (" at …", " under …", …).
  if porque is not null then
    tipo := btrim(regexp_replace(split_part(split_part(porque, ';', 1), ',', 1), '\s+(at|under|from|for|with|around|over|between|in)\s.*$', '', 'i'));
    if length(tipo) < 4 or length(tipo) > 60 or tipo ~ '\d' then tipo := null; end if;
    -- never the exact collection title (that one is for members only): then the page shows the niche
    if tipo is not null and regexp_replace(lower(tipo), norm, '', 'g') = regexp_replace(lower(coalesce(r.colecao, '')), norm, '', 'g') then tipo := null; end if;
  end if;

  return jsonb_build_object(
    'id_curto', r.id_curto, 'nicho', r.nicho, 'tipo', tipo,
    'mercado_destaque', r.mercado_destaque, 'paises_ads', r.paises_ads, 'plataformas', r.plataformas,
    'estado', r.estado, 'veredito', r.veredito, 'score', r.score,
    'anuncios_meta', r.anuncios_meta, 'anuncios_google', r.anuncios_google, 'anuncios_ativos', r.anuncios_ativos,
    'dias_ativo', r.dias_ativo, 'data_inicio', r.data_inicio, 'alcance_eu', r.alcance_eu,
    'porque_funciona', porque,
    'tem_foto', coalesce(r.imagem_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/fotos/[A-Za-z0-9/_.-]+$', false));
end $$;
revoke all on function public.colecao_publica(text) from public;
grant execute on function public.colecao_publica(text) to anon, authenticated, service_role;
