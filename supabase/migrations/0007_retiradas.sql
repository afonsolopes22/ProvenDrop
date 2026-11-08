-- ProvenDrop · 0007: coleções retiradas depois de enviadas (2026-11-08).
--
-- Uma coleção pode sair da lista depois de enviada: a loja é excluída (não é
-- dropshipping, operador próprio), o veredito desce de 🟢 para 🟡, o link deixa
-- de existir. A linha de feed_dia fica (é o registo do que foi enviado nesse dia)
-- mas passa a retirada = true, com o motivo em texto livre.
--
--   * feed_dia.retirada        boolean, default false. A área de membros (app.js)
--                              não mostra linhas retiradas em Today, Earlier this
--                              week nem Library, e não oferece o kit. Uma coleção
--                              cujo envio mais recente está retirado desaparece
--                              também das linhas antigas e da entrada em verdes.
--   * feed_dia.retirada_motivo text, só para a rotina e para quem lê a base;
--                              nunca é mostrado na área de membros.
--
-- Escrita pela rotina (publicar_plataforma.py, service role): basta enviar
-- "retirada": true e "retirada_motivo": "…" na linha do upsert; omitido fica
-- false. Ou à mão, no SQL Editor:
--   update public.feed_dia set retirada = true, retirada_motivo = '…'
--    where dia = '2026-11-05' and ordem = 3;
--
-- Acesso: as colunas seguem as políticas de 0001 (só membros direto leem feed_dia;
-- anon sem privilégios). Idempotente: pode correr-se mais de uma vez.

alter table public.feed_dia add column if not exists retirada        boolean not null default false;
alter table public.feed_dia add column if not exists retirada_motivo text;

comment on column public.feed_dia.retirada        is 'True quando a coleção foi retirada depois de enviada (loja excluída, veredito desceu, link morto). A área de membros não a mostra nem oferece o kit.';
comment on column public.feed_dia.retirada_motivo is 'Porquê (texto livre da rotina, ex.: "loja excluída: operador próprio"). Só na base; nunca na área de membros.';

-- Garantia (já verdade desde 0001): nada de feed_dia para anónimos.
revoke all on table public.feed_dia from anon;
