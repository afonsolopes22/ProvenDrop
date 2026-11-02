-- ProvenDrop · 0003: registo do envio das boas-vindas.
-- O e-mail de boas-vindas (magic link) só conta como enviado quando o Resend
-- aceita a mensagem; até lá boas_vindas_em fica null e o webhook volta a
-- tentar no evento seguinte (ou no reenvio manual ?reenviar_boas_vindas=).
-- Idempotente: pode correr-se mais de uma vez. Não altera a 0001 nem a 0002.

alter table public.subscritores add column if not exists boas_vindas_em timestamptz;

comment on column public.subscritores.boas_vindas_em is 'Quando o e-mail de boas-vindas (magic link) foi aceite pelo Resend. Null = ainda por enviar (só porta direto).';
