-- 0012 · Fotos dos cartões da área de membros.
--
-- A vista "Today" passa a ter um cartão por coleção, com fotografia. A fotografia é sempre a
-- foto real do produto dessa coleção (a product_1 do kit), nunca uma imagem genérica.
--
--   * bucket público "fotos" no Storage: quem tem o endereço de um ficheiro vê-o, mas ninguém
--     consegue listar o bucket (não há política de select em storage.objects para ele).
--     Só imagens (JPEG, PNG, WebP), até 5 MB cada. Escrita apenas pela service role (a rotina).
--   * feed_dia.imagem_url (text, pode ficar vazia): endereço público da foto dessa coleção,
--     https://<projeto>.supabase.co/storage/v1/object/public/fotos/<caminho>.
--
-- A área de membros (app.js) só aceita endereços deste bucket. Sem imagem_url, com outro endereço,
-- ou se a imagem não carregar, o cartão fica com fundo verde-claro e o ícone do nicho.
-- Não há restrição (check) na coluna de propósito: um endereço mal formado nunca deve impedir
-- a rotina de publicar a lista do dia.
--
-- A rotina (publicar_plataforma.py) tem de enviar a product_1 de cada coleção para o bucket e
-- gravar o endereço em imagem_url. Sugestão de caminho: <dia>/<id_curto>.jpg (ex.: 2026-11-11/K7M2QX.jpg).
--
-- Aplicar:  supabase db query --linked --file supabase/migrations/0012_fotos.sql
-- Idempotente. Não altera dados existentes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.feed_dia add column if not exists imagem_url text;

comment on column public.feed_dia.imagem_url is 'Endereço público da foto do produto da coleção (product_1 do kit), no bucket "fotos". Enviado pela rotina; vazio = cartão com o ícone do nicho.';
