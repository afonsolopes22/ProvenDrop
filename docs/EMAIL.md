# E-mail (Resend): boas-vindas e e-mail diário

As duas funções (`stripe-webhook` e `email-diario`) enviam pela API do Resend com os segredos `RESEND_API_KEY` e `EMAIL_FROM` (opcional `EMAIL_REPLY_TO`), definidos pelo `scripts/setup-supabase.ps1`. Nada disto é lido de ficheiros nem escrito nos logs.

| E-mail | Quem envia | Para quem | Conteúdo |
|---|---|---|---|
| Boas-vindas ("Welcome to ProvenDrop: your access") | `stripe-webhook`, uma vez por subscritor | só `origem = direto` | magic link para `app.html`, hora do e-mail diário |
| Diário ("ProvenDrop · dd/mm: N collections") | `email-diario`, chamada pelo pg_cron de hora a hora | só quem tem acesso: `direto`, não bloqueado, `ativo` ou `em_atraso` há < 7 dias | uma linha por coleção: estado (🟢/🟡 "under observation"), nome da coleção, nicho, mercado, "N Meta + N Google ads", dias, alcance, "kit ready" em todas as que têm kit; botão **Open today's collections**. **Sem** nomes de lojas, links de coleções nem zips: esses só na área, com sessão iniciada. |
| Link de entrada pedido na página de login | Supabase Auth (SMTP) | quem tem conta | link por `token_hash` (§5) |
| Regresso ("Welcome back to ProvenDrop") | `stripe-webhook`, quando cancelado → ativo | só `direto` | magic link; nichos/países mantidos |
| Alertas operacionais | `stripe-webhook`, `reconciliar` | `ALERT_EMAIL` (ou `EMAIL_REPLY_TO`) | duas subscrições no mesmo e-mail, disputa (com prazo), reembolso, boas-vindas falhadas 5×, divergências Stripe ↔ base |

## Quando sai o e-mail diário

- O job `provendrop-email-diario` (pg_cron, migração 0001) chama a função **a cada hora certa**.
- A função só envia quando a hora em **Europe/Lisbon** é `HORA_ENVIO` (o setup-supabase.ps1 lê-a de `DAILY_TIME` em `config.js`: `09:00` → `9`) e **uma vez por dia** (tabela `envios_diarios`, chave = dia do envio).
- Envia a **lista mais recente** de `feed_dia` (a rotina publica ao fim da tarde; às 09:00 do dia seguinte envia a lista de ontem). A mesma lista nunca é enviada duas vezes (`envios_diarios.feed_dia`): se um dia a rotina não publicar, não sai e-mail repetido.
- Envio manual de teste: `POST https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/email-diario?forcar=1` com o cabeçalho `x-cron-secret: <CRON_SECRET>` (ver `docs/TESTE.md`).

## 1. Criar a conta Resend

1. `resend.com` → **Sign up** (e-mail do ProvenDrop). Confirma o e-mail.
2. Plano **Free**: 3 000 e-mails/mês, **100 por dia**, 3 domínios. Chega para ~90 subscritores directos (1 e-mail diário cada + boas-vindas). Acima disso, plano **Pro** (20 USD/mês, 50 000/mês, sem limite diário).

## 2. Verificar o domínio de envio

Sem domínio verificado o Resend só envia para o e-mail da própria conta (modo de teste, ver secção 4).

1. Menu **Domains** → **Add Domain**.
2. Escreve `provendrop.com` (o domínio previsto; ver [DOMINIO.md](DOMINIO.md) para a compra e os DNS do site). Região: **EU (Ireland)** para ficar perto do Supabase. O Resend recomenda um subdomínio só para envios (`mail.provendrop.com`); a decisão tomada foi enviar da raiz, `noreply@provendrop.com`, o que é igualmente válido.
3. O Resend mostra os registos DNS a criar no painel do registrador do domínio (onde o domínio está alojado):
   - **DKIM**: registo `TXT` em `resend._domainkey.<domínio>` com o valor longo `p=MIG…`.
   - **SPF / Return-Path**: registo `MX` em `send.<domínio>` (prioridade 10, valor `feedback-smtp.<região>.amazonses.com`) e registo `TXT` em `send.<domínio>` com `v=spf1 include:amazonses.com ~all`.
   - **DMARC** (recomendado): `TXT` em `_dmarc.<domínio>` com `v=DMARC1; p=none;` para começar.
   Copia cada registo exactamente como o Resend o mostra (nome, tipo, valor, prioridade).
4. Volta ao Resend → **Verify DNS Records**. A propagação demora de minutos a algumas horas; o estado passa a **Verified**.

## 3. Criar a API key

1. Menu **API Keys** → **Create API Key**.
2. **Name**: `provendrop-supabase`. **Permission**: **Sending access**. **Domain**: o domínio verificado (restringe a chave).
3. **Add** → copia a chave `re_…` **agora** (não volta a ser mostrada) → é `RESEND_API_KEY`, pedido pelo `scripts/setup-supabase.ps1`. Não a guardes em ficheiros.

## 4. `EMAIL_FROM` e `EMAIL_REPLY_TO`

- `EMAIL_FROM`: um endereço **do domínio verificado**, com nome: `ProvenDrop <noreply@provendrop.com>` (valor proposto pelo `setup-supabase.ps1`). O Resend rejeita remetentes de domínios não verificados.
- `EMAIL_REPLY_TO` (opcional): o endereço onde queres receber as respostas dos clientes, por exemplo `afonso@…`. Os dois e-mails dizem "reply to this e-mail".

### Ainda sem domínio próprio: modo de teste do Resend

Enquanto `provendrop.com` não estiver comprado e verificado, o `setup-supabase.ps1` propõe `ProvenDrop <onboarding@resend.dev>` (Enter aceita). Limite: **só entrega ao e-mail com que criaste a conta Resend**; para qualquer outro destinatário a API devolve erro 403, o webhook deixa `boas_vindas_em` a null e volta a tentar, e o `email-diario` responde `502 {"erro": …}` sem registar o dia. Serve para o teste completo (`docs/TESTE.md`) feito com o teu próprio e-mail; **não serve para clientes**. Quando o domínio estiver verificado, volta a correr o `setup-supabase.ps1` e escreve `ProvenDrop <noreply@provendrop.com>` quando pedir `EMAIL_FROM` (Enter nos segredos deixa-os como estão).

## 5. Link de entrada da página de login (SMTP do Supabase)

O magic link de boas-vindas vai pelo Resend (API), mas o link que o cliente pede na página de login (`app.html` → "Send sign-in link") é enviado pelo **Supabase Auth**, que por defeito usa um SMTP limitado a 2–4 e-mails por hora. Para não falhar:

1. Supabase → **Authentication** → **Emails** → **SMTP Settings** → **Enable Custom SMTP**.
2. **Sender email**: o mesmo endereço de `EMAIL_FROM` (`noreply@provendrop.com`; em teste, `onboarding@resend.dev`); **Sender name**: `ProvenDrop`.
3. **Host**: `smtp.resend.com`; **Port**: `465`; **Username**: `resend`; **Password**: a API key do Resend (podes criar uma segunda chave só para isto).
4. **Authentication** → **Emails** → **Templates** → **Magic Link**: assunto `Your ProvenDrop sign-in link`, corpo em inglês com o link **por token_hash** (S12: não é consumido por scanners de e-mail; a área corre `verifyOtp` quando a página abre):
   `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=magiclink">Sign in to ProvenDrop</a>`
   (`{{ .RedirectTo }}` é o `app.html` pedido pela página de login.) O e-mail de boas-vindas e o de regresso já usam este formato, enviados pelo Resend a partir do webhook.
5. **Authentication** → **URL Configuration**: **Site URL** `https://afonsolopes22.github.io/ProvenDrop/` e, em **Redirect URLs**, `https://afonsolopes22.github.io/ProvenDrop/app.html`.
6. A validade do link está em **Authentication → Settings → Email OTP expiration** (3600 s por defeito) e tem de ser igual a `MAGIC_LINK_MINUTOS` (60).

## 6. Enquanto o domínio não está verificado: frases do site

Até o domínio estar verificado no Resend (§2), o site **não promete** que o e-mail de acesso chega logo. Em `index.html` (secção Access, texto do `#noteSubscribe`) e em `bem-vindo.html` (frase de abertura) está, desde 2026-11-06: *"You'll receive your access link by e-mail. If it doesn't arrive within 10 minutes, message us on WhatsApp: +351 920 414 823."* Os dois sítios têm um comentário `TODO (Afonso)` com a frase original, para voltar a ela quando o domínio estiver verificado. A página de entrada (`app.html`) e `bem-vindo.html` têm ainda a linha "Problems signing in? WhatsApp +351 920 414 823".

## 7. Correção do e-mail errado no checkout (`corrigir-email`)

Quem se engana no e-mail ao pagar o link Direct nunca receberia o acesso. Desde 2026-11-06 o link Direct redireciona para `bem-vindo.html?session_id={CHECKOUT_SESSION_ID}` (STRIPE.md a) e a página, com esse `session_id`:

1. pede à Edge Function `corrigir-email` (`GET …/functions/v1/corrigir-email?session_id=cs_…`) **só o e-mail mascarado** da compra (`afo•••@gmail.com`) e mostra "We sent your access to afo•••@gmail.com" + **Not my e-mail? Fix it**; o `session_id` é retirado da barra de endereço;
2. o botão abre um formulário com o e-mail novo duas vezes (têm de coincidir) e faz `POST { session_id, novo_email, confirmacao }`;
3. a função valida no Stripe (sessão **paga**, criada há **menos de 24 h**, porta **Direct** pela metadata ou pelo `price_`), recusa uma **segunda correção** da mesma sessão (`subscritores.email_corrigido_sessao` + tabela `correcoes_email`) e um e-mail já usado por outro subscritor; depois, por esta ordem: utilizador de Auth com o e-mail novo (confirmado) → `customer.email` no Stripe → `subscricoes` + `subscritores` + auditoria numa transação (`corrigir_email_subscritor`, migração `0006`; se falhar, Stripe e Auth são revertidos) → magic link por `token_hash` enviado ao e-mail novo pelo Resend → alerta "E-mail corrigido no checkout" em `ALERT_EMAIL` (só hashes);
4. sem `session_id` (ou inválido) a página mostra só a linha de apoio por WhatsApp.

Respostas: 404 `sessao_nao_encontrada` (não paga, porta Click, sem e-mail ou inexistente: nunca se diz qual), 410 `expirada`, 409 `ja_corrigido`, 422 `emails_diferentes` / `email_invalido` / `mesmo_email` / `email_em_uso`, 503 `ainda_a_registar` (o webhook ainda não registou a compra), 429 `limite` (rate-limit por IP, 20 GET / 5 POST em 10 min, guardado só o hash do IP). Se o Resend falhar, a correção fica feita e a resposta traz `enviado:false`: o cliente pede o link na página de entrada com o e-mail novo (§5). Verify JWT desligado (`config.toml`); CORS só para a origem de `APP_URL` e `localhost`. Regras puras em `validar.ts`, testadas em `validar.test.ts` (`deno test`). Teste real: TESTE.md §8.
