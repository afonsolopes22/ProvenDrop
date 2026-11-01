# ProvenDrop

Site estático (GitHub Pages) + plataforma de membros para a subscrição direta.

**Este repo e o site são públicos: não colocar aqui `data.json`, coleções, lojas, links de ZIP nem segredos.** As coleções só são entregues a quem subscreve: na área pessoal (com sessão iniciada) e, para clientes da Click, no grupo de WhatsApp da Click.

## Duas portas, o mesmo produto

| | Via Click | Direto |
|---|---|---|
| Como paga | Payment Link que a Click envia aos clientes dela (fica como está) | Botão **Subscribe** do site → Payment Link "ProvenDrop" |
| Onde recebe | Grupo de WhatsApp da Click (bot `/pr`) | Área pessoal `app.html` + email diário |
| Depois de pagar | `bem-vindo-click.html` (configurar o redirecionamento do link da Click para esta página) | `bem-vindo.html` → email com magic link → `app.html` |
| Registo | `subscritores.origem = 'click'` (sem login, sem email) | `subscritores.origem = 'direto'` + utilizador Auth |

O research, a Metodologia v7, o bot da Click, as folhas Google e a rotina diária não mudam. A única novidade na rotina é uma chamada ao script `publicar_plataforma.py` (ver abaixo).

## Ficheiros

| Ficheiro | Função |
|---|---|
| `index.html` | Página pública (inglês). Montra com números da folha pública; secções "Three steps", "What you receive every day", "Where you receive it", bloco de CTR (escondido), preço e FAQ. |
| `bem-vindo.html` | Pós-pagamento da subscrição direta. |
| `bem-vindo-click.html` | Pós-pagamento dos clientes Click (WhatsApp). |
| `app.html` | Área pessoal (PT-PT): login por magic link, Hoje, Arquivo, Preferências, Subscrição, guia de 1 minuto. Só usa a chave *anon* pública; o acesso é decidido pelas políticas RLS. |
| `supabase/migrations/0001_plataforma.sql` | Tabelas, RLS, bucket privado `kits`, job pg_cron. |
| `supabase/functions/stripe-webhook` | Webhook do Stripe: cria/atualiza subscritores, envia boas-vindas com magic link. |
| `supabase/functions/email-diario` | Email diário aos subscritores diretos ativos (sem links de lojas nem zips). |
| `supabase/functions/_shared/email.ts` | Envio pelo Resend e molde HTML. |
| `supabase/.env.example` | Nomes das variáveis (sem valores). O `.env` real é ignorado pelo git. |
| vault `_dados/publicar_plataforma.py` | Publica o `feed_bot.json` em `feed_dia`/`verdes` e envia os zips para o Storage. |

## Configuração (por ordem)

Os campos `[HOUR]`, preços e CTR do site são placeholders: ficam visíveis até serem preenchidos no bloco de configuração no `<head>` de cada página.

### 1. Supabase
1. Criar projeto (região EU). Guardar o **Project URL** e a **anon key** (públicos) e a **service role key** (segredo: nunca no repo nem no vault).
2. SQL Editor → correr `supabase/migrations/0001_plataforma.sql`.
3. Authentication → Providers → Email: ativar; desativar "Confirm email" não é necessário (os utilizadores são criados já confirmados pelo webhook). Em **Sign in / Up**, pode desativar-se "Allow new users to sign up": a área usa `shouldCreateUser:false` e só quem pagou tem conta.
4. Authentication → URL Configuration: **Site URL** `https://afonsolopes22.github.io/ProvenDrop/` e **Redirect URLs** com `https://afonsolopes22.github.io/ProvenDrop/app.html`.
5. Authentication → Emails → **SMTP settings**: ligar o SMTP do Resend (host `smtp.resend.com`, utilizador `resend`, palavra-passe = API key). O SMTP por defeito do Supabase só envia 2 a 4 emails por hora, o que não serve para os links de entrada pedidos na página de login.
6. Authentication → Emails → Templates → *Magic Link*: texto PT-PT com `{{ .ConfirmationURL }}` (é o email que sai quando alguém pede um link na página de login; o de boas-vindas sai do webhook pelo Resend). A validade do link está em "Email OTP expiration" (3600 s por defeito; é o valor `[X] minutos` dos textos → `MAGIC_LINK_MINUTOS`).
7. `app.html`: preencher `PROVENDROP_SUPABASE_URL` e `PROVENDROP_SUPABASE_ANON_KEY`.

### 2. Resend (ou Brevo)
Verificar o domínio de envio (registos SPF/DKIM no DNS) e criar uma API key. `EMAIL_FROM` tem de ser um endereço desse domínio. Plano gratuito: 3 000 emails/mês e **100/dia**; acima de ~100 subscritores diretos é preciso o plano pago (ou Brevo, 300/dia).

### 3. Stripe (modo de teste primeiro)
1. Produto **"ProvenDrop"**: preço recorrente 15 €/mês. Para a adesão de 25 € uma vez: segundo preço único no mesmo Payment Link (o Stripe permite juntar um preço único a uma subscrição), ou um produto "Adesão" adicionado ao link.
2. Payment Link desse produto: recolher email; **Após o pagamento → redirecionar para** `https://afonsolopes22.github.io/ProvenDrop/bem-vindo.html`; em **Metadata** acrescentar `origem = direto`. Copiar o URL para `window.PROVENDROP_STRIPE_LINK` no `index.html` e o id `plink_…` para `STRIPE_PAYMENT_LINK_DIRETO`.
3. Payment Link atual da Click: acrescentar metadata `origem = click` e confirmar que o redirecionamento aponta para `bem-vindo-click.html` (e não para `bem-vindo.html`).
4. Developers → Webhooks → endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook` com os eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copiar o signing secret para `STRIPE_WEBHOOK_SECRET`.
5. Settings → Billing → **Customer portal**: ativar cancelamento e atualização de cartão; ativar o **link de login** sem código e copiar para `window.PROVENDROP_PORTAL_LINK` em `app.html`.
6. Só passar a modo real (chaves `sk_live_`, link live, webhook live) depois do teste completo e com aprovação explícita.

### 4. Edge Functions
```bash
supabase link --project-ref <ref>
cp supabase/.env.example supabase/.env   # preencher; nunca commitar
supabase secrets set --env-file supabase/.env
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy email-diario --no-verify-jwt
```
Depois, no SQL Editor:
```sql
update public.config set valor = 'https://<ref>.supabase.co/functions/v1/email-diario' where chave = 'email_diario_url';
update public.config set valor = '<o mesmo valor de CRON_SECRET>' where chave = 'cron_secret';
```
O job `provendrop-email-diario` corre a cada hora certa; a função só envia quando a hora em Europe/Lisbon for `HORA_ENVIO` e ainda não tiver enviado nesse dia. Envio manual de teste: `POST …/email-diario?forcar=1` com o cabeçalho `x-cron-secret`.

### 5. Rotina diária (vault)
Guardar a service role key num ficheiro fora do vault e do repo, por exemplo `%USERPROFILE%\.provendrop\supabase_service_key.txt`, e acrescentar à rotina, depois de `publicar_feed.py` e de `fazer_zip.py`:
```bash
python3 "_dados/publicar_plataforma.py" --feed "_dados/feed_bot.json" --url https://<ref>.supabase.co --key-file "%USERPROFILE%\.provendrop\supabase_service_key.txt" --zips-dir "_dados"
```
Códigos de saída: 0 ok · 3 rede bloqueada · 4 credenciais. Os zips encontrados em disco vão para o bucket privado `kits` e a área gera URLs assinadas de 1 hora; se o zip não existir, fica o `zip_url` externo.

### 6. Textos
Preencher nos blocos `<head>`: `PROVENDROP_DAILY_TIME` (index, bem-vindo, app), `PROVENDROP_STRIPE_LINK`, `PROVENDROP_PORTAL_LINK`, e opcionalmente `PROVENDROP_CONTACT_EMAIL`. Confirmar o preço (15 € + 25 €) nos cartões antes de publicar.

## Indicador de CTR

A secção logo a seguir ao topo do `index.html` só aparece quando `window.PROVENDROP_CTR` tiver os cinco campos preenchidos com dados de campanhas documentados:
```js
window.PROVENDROP_CTR = { value: "14", campaign_type: "Search", from: "Jun 2026", to: "Oct 2026", impressions: "120,000" };
```
À data de 2026-11-01 não existe no repo nem no vault nenhum registo (campanhas, período, impressões, cálculo) que sustente o valor; fica escondido até existir. O texto da nota já diz que o resultado foi medido nas nossas campanhas e que o desempenho não é garantido.

## Teste completo em modo de teste
1. Pagar no Payment Link de teste com o cartão `4242 4242 4242 4242` → redireciona para `bem-vindo.html`.
2. Logs da função `stripe-webhook`: `checkout.session.completed` processado; linha em `subscritores` com `origem = direto`, `estado = ativo`, `user_id` preenchido.
3. Email "Bem-vindo ao ProvenDrop: o teu acesso" recebido → botão abre `app.html` com sessão.
4. Guia de 1 minuto → preferências → "Hoje" mostra o `feed_dia` publicado com `publicar_plataforma.py` (projeto de teste); "Descarregar kit" abre a URL assinada.
5. `POST …/email-diario?forcar=1` → email diário recebido, sem links de lojas nem zips.
6. Cancelar no portal de cliente → `customer.subscription.deleted` → `estado = cancelado` → recarregar `app.html` mostra "Subscrição cancelada" e as consultas a `feed_dia` devolvem 0 linhas (RLS).
7. Pedir novo link na página de login com um email sem subscrição → mensagem "Este email não tem subscrição".

## Publicar
Settings → Pages → Deploy from branch → `main` / root. O ramo `plataforma-direto` só se funde em `main` depois do teste acima e da aprovação.
