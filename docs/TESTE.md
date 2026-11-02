# Teste completo em modo de teste

Preencher a coluna **Resultado** a cada passo (data, quem, o que se viu). Nada passa a `main` sem todos os passos verdes. Última actualização: 2026-11-02.

Legenda: ✅ passou · ❌ falhou · ⏳ por executar (depende de contas que ainda não existem: Stripe, Resend, deploy).

## 0. O que já foi verificado localmente (2026-11-02, sem Stripe, sem Resend, sem deploy)

| Verificação | Resultado |
|---|---|
| `index.html`, `bem-vindo.html`, `bem-vindo-click.html`, `app.html` carregam a 1440 e 390 px, sem overflow nem erros de consola, com `config.js` real | ✅ (Playwright, Chrome, servidor local) |
| Com `config.js` **vazio**: botão Subscribe desativado ("Subscriptions are not open on this page yet"), bloco CTR escondido, `[HOUR]` visível nas 4 páginas, `app.html` mostra "The member area is not active yet" | ✅ |
| Com `config.js` real: `09:00` em todos os `[HOUR]`, preço €15 + €25, `app.html` abre o ecrã de login (Supabase ligado) | ✅ |
| Nenhuma página pública contém o ID da folha proibida, lojas, links de coleções ou zips (`index.html` continua a ler só a folha pública; nomes em barras `.redact`) | ✅ |
| `publicar_feed.py` (vault) gera o mesmo `texto_whatsapp` e os mesmos campos antigos; só acrescenta `zip_path` e `data_inicio` | ✅ (comparado com o `feed_bot.json` real, sem o reescrever) |
| `publicar_plataforma.py --dry-run` com `--zips-dir` = raiz do vault encontra o zip da coleção aprovada e prepararia o upload para `kits/2026-11-01/…` | ✅ |
| `scripts/setup-supabase.ps1` sem erros de sintaxe (parser do PowerShell) | ✅ (executado pelo Afonso em 2026-11-02: link, segredos e deploy feitos) |
| Migração `0003_boas_vindas.sql` aplicada com `supabase db query --linked` (CLI 2.122.0) e `stripe-webhook` com novo deploy (`--no-verify-jwt`) | ✅ 2026-11-02 |
| Função publicada responde: POST sem assinatura → 400; `?reenviar_boas_vindas=` sem `x-cron-secret` → 401 `{"erro":"não autorizado"}`; GET → 405 | ✅ 2026-11-02 (curl) |
| Edge Functions: sintaxe TypeScript verificada com o compilador TypeScript (transpileModule, sem erros); não executadas: sem Deno nem deploy | ✅ |

## 1. Pagamento Direct → acesso → cancelamento

Pré-requisitos: STRIPE.md a), c), d), e) feitos; EMAIL.md 1–5 feitos; `setup-supabase.ps1` corrido; `config.js` com `STRIPE_LINK_DIRECT` e `STRIPE_PORTAL_LINK` de teste; site publicado numa branch ou servido localmente com o mesmo `config.js`.

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 1.1 | Abrir o site → **Subscribe** | Checkout de teste do Stripe com "ProvenDrop Direct · 15,00 €/mês" + "Joining fee 25,00 €" (total 40 €) | ⏳ |
| 1.2 | Pagar com o cartão de teste `4242 4242 4242 4242`, validade futura, CVC qualquer, e-mail **teu** | Redireciona para `bem-vindo.html` ("Payment received. Welcome.") com `09:00` no passo 3 | ⏳ |
| 1.3 | Supabase → Edge Functions → `stripe-webhook` → **Logs** | `checkout.session.completed` e `customer.subscription.created` com 200; a resposta traz `boas_vindas: "enviadas"` num deles e `"ja_enviadas"` no outro; sem erros | ❌ 2026-11-02 (1.ª tentativa): `customer.subscription.created` falhou no Resend → 500, e o `checkout.session.completed` seguinte passou **sem e-mail** porque o `user_id` já estava gravado. **Corrigido** (migração 0003 + webhook, deploy 2026-11-02): as boas-vindas só contam como enviadas quando `boas_vindas_em` é gravado, depois de o Resend aceitar; uma falha do Resend regista `console.error`, devolve 200 e volta a tentar no evento seguinte. ⏳ repetir |
| 1.4 | SQL Editor: `select email, origem, estado, user_id is not null as login, boas_vindas_em from public.subscritores` | 1 linha: o teu e-mail, `direto`, `ativo`, `login = true`, `boas_vindas_em` preenchido | ⏳ |
| 1.4b | Se `boas_vindas_em` estiver null (Resend falhou): `curl -X POST "https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook?reenviar_boas_vindas=<o-teu-email>" -H "x-cron-secret: <CRON_SECRET>"` | `{ok:true, boas_vindas:"enviadas"}`; e-mail novo com magic link novo; `boas_vindas_em` passa a preenchido. Sem o cabeçalho → 401; e-mail de um subscritor click → 409 | ⏳ |
| 1.5 | SQL Editor: `select * from public.stripe_eventos order by recebido_em` | um `evt_…` por evento, sem repetidos | ⏳ |
| 1.6 | Caixa de correio | E-mail "Welcome to ProvenDrop: your access" (remetente `EMAIL_FROM`), botão **Sign in to ProvenDrop**, menciona `09:00` | ⏳ |
| 1.7 | Clicar no botão | Abre `app.html` com sessão: guia de 1 minuto → **Choose my niche and countries** → guardar | ⏳ |
| 1.8 | Separador **Today** | As coleções publicadas pela rotina (`feed_dia`), com nome, loja, link, números; aprovadas com **Download Launch Kit** | ⏳ |
| 1.9 | **Download Launch Kit** | Abre uma URL assinada do bucket `kits` e descarrega o zip (link válido 15 min). Se a coleção só tiver `zip_url`, abre o link externo | ⏳ |
| 1.10 | **Archive** | Tabela de aprovadas, filtros por nicho/mercado/ainda a anunciar, botão **Kit** | ⏳ |
| 1.11 | **Subscription** → **Manage subscription** | Portal do Stripe (pede o e-mail, envia link) → **Cancel subscription** → confirmar | ⏳ |
| 1.12 | Logs do webhook + SQL | `customer.subscription.updated`/`deleted` → `estado = cancelado` (ou `ativo` com `cancel_at_period_end` até ao fim do período, se o portal estiver configurado assim; nesse caso ver 1.13) | ⏳ |
| 1.13 | Recarregar `app.html` | "Subscription cancelled" e sem acesso; SQL `select count(*) from feed_dia` com a sessão do utilizador devolve 0 (RLS). Para testar sem esperar o fim do período: Stripe → cliente → subscrição → **Cancel subscription** → **Immediately** | ⏳ |
| 1.14 | Página de login com um e-mail sem subscrição → **Send sign-in link** | "This e-mail has no subscription…" | ⏳ |
| 1.15 | Página de login com o e-mail do teste → **Send sign-in link** | E-mail "Your ProvenDrop sign-in link" pelo SMTP do Resend (EMAIL.md §5); o link abre a área | ⏳ |

## 2. Pagamento pelo link da Click

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 2.1 | Abrir o Payment Link da Click (teste) e pagar com `4242…` e **outro** e-mail | Redireciona para `bem-vindo-click.html` (WhatsApp da Click) | ⏳ |
| 2.2 | SQL `select email, origem, estado, user_id from public.subscritores` | Nova linha `origem = click`, `estado = ativo`, `user_id` **null** | ⏳ |
| 2.3 | Caixa de correio desse e-mail | **Nenhum** e-mail de boas-vindas do ProvenDrop | ⏳ |
| 2.4 | `app.html` → pedir link de entrada com esse e-mail | "This e-mail has no subscription…" (não tem conta Auth) | ⏳ |
| 2.5 | Se o produto da Click não tiver metadata nem `STRIPE_PRICE_CLICK` definido | Logs: aviso "origem desconhecida… registado como click"; o resultado é o mesmo (sem acesso) | ⏳ |

## 3. E-mail diário

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 3.1 | Com 1 subscritor `direto` `ativo` (do teste 1, antes de cancelar) e feed publicado, forçar: `curl -X POST "https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/email-diario?forcar=1" -H "x-cron-secret: <CRON_SECRET>"` | JSON `{ok:true, feed_dia:"…", colecoes:N, destinatarios:1, enviados:1}` | ⏳ |
| 3.2 | Caixa de correio | Assunto "ProvenDrop · dd/mm: N collections today"; uma linha por coleção com **nome da coleção, mercado, ads, days, people, kit ready**; botão **Open today's collections** → `app.html` | ⏳ |
| 3.3 | Inspeccionar o e-mail | **Sem** nomes de lojas, **sem** links de coleções, **sem** links de zips (o único link é `app.html`) | ⏳ |
| 3.4 | Sem `x-cron-secret` ou com valor errado | 401 `{"erro":"não autorizado"}` | ⏳ |
| 3.5 | Chamada sem `forcar` fora das 09:00 | `{ok:true, saltado:"fora da hora"}` | ⏳ |
| 3.6 | SQL `select * from public.envios_diarios` | 1 linha por dia de envio, com `feed_dia` | ⏳ |
| 3.7 | No dia seguinte às 09:00 (Lisboa), sem forçar | E-mail chega sozinho (pg_cron → função); `cron.job_run_details` mostra a chamada | ⏳ |

## 4. Páginas públicas sem dados privados

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 4.1 | Ver código-fonte de `index.html`, `bem-vindo.html`, `bem-vindo-click.html`, `app.html` (sem sessão) e `config.js` publicados | Nenhuma loja, link de coleção, zip, `data.json`, chave `sk_`/`whsec_`/`re_`, nem o ID da folha Google privada (a que não é a "dados públicos do site") | ✅ local (2026-11-02) · ⏳ no site publicado |
| 4.2 | `app.html` sem sessão, com o DevTools → Network | Só pedidos a `config.js`, fontes e `supabase.min.js`; nenhum dado de `feed_dia`/`verdes` (RLS) | ⏳ |
| 4.3 | Com a anon key, `curl "https://maljrfgnnhtrjunnwlre.supabase.co/rest/v1/feed_dia?select=*" -H "apikey: <anon>"` | `[]` ou erro de permissão; nunca linhas | ⏳ |
| 4.4 | Com a anon key, `curl "https://maljrfgnnhtrjunnwlre.supabase.co/storage/v1/object/kits/<caminho>" -H "apikey: <anon>"` | 400/403; o bucket é privado | ⏳ |

## 5. Depois do teste

- Apagar os subscritores de teste (`delete from public.subscritores where email in (...)`, e o utilizador em **Authentication → Users**) ou deixá-los: os de teste do Stripe não existem em modo real.
- Só então: commit, PR, revisão, merge em `main` com aprovação, e a passagem a modo real (STRIPE.md, última secção).
