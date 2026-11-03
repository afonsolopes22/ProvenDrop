-- ProvenDrop · 0002: dias de anúncio reais (US-54).
-- Acrescenta data_inicio (data do anúncio ativo mais antigo, escrita pela
-- rotina diária) a feed_dia e verdes. Com esta coluna, a área pessoal e o
-- site mostram os dias contados até hoje; sem ela mostram o valor da análise.
-- Idempotente: pode correr-se mais de uma vez. Não altera a 0001.

alter table public.feed_dia add column if not exists data_inicio date;
alter table public.verdes   add column if not exists data_inicio date;

-- O e-mail diário sai às HORA_ENVIO com a lista mais recente; regista-se qual
-- foi, para a mesma lista nunca sair duas vezes.
alter table public.envios_diarios add column if not exists feed_dia date;

comment on column public.feed_dia.data_inicio is 'Primeiro dia do anúncio ativo mais antigo (frontmatter data_inicio da nota). Null = desconhecido.';
comment on column public.verdes.data_inicio   is 'Primeiro dia do anúncio ativo mais antigo (frontmatter data_inicio da nota). Null = desconhecido.';
