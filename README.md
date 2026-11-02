# ProvenDrop

Site estático (GitHub Pages) + plataforma de membros para a subscrição direta.

**Este repo e o site são públicos: não colocar aqui `data.json`, coleções, lojas, links de ZIP nem segredos.** As coleções só são entregues a quem subscreve: na área pessoal (com sessão iniciada) e, para clientes da Click, no grupo de WhatsApp da Click.

## Duas portas, o mesmo produto

| | Via Click | Direto |
|---|---|---|
| Como paga | Payment Link que a Click envia aos clientes dela (fica como está) | Botão **Subscribe** do site → Payment Link "ProvenDrop Direct" |
| Onde recebe | Grupo de WhatsApp da Click (bot `/pr`) | Área pessoal `app.html` + e-mail diário |
| Depois de pagar | `bem-vindo-click.html` | `bem-vindo.html` → e-mail com magic link → `app.html` |
| Registo | `subscritores.origem = 'click'` (sem login, sem e-mail; serve para a comissão) | `subscritores.origem = 'direto'` + utilizador Auth |

O research, a Metodologia v7, o bot da Click, as folhas Google e a rotina diária não mudam. A única novidade na rotina é a chamada ao script `publicar_plataforma.py` (ver abaixo).

## Configuração: um só sítio

Todos os valores **públicos** estão em [`config.js`](config.js), lido pelas quatro páginas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_LINK_DIRECT`, `STRIPE_PORTAL_LINK`, `DAILY_TIME`, `PRICE_MONTHLY`, `PRICE_JOINING`, `CONTACT_EMAIL` e `CTR`. Com valores vazios o site não inventa nada: o botão Subscribe fica desativado ("Subscriptions are not open on this page yet"), o bloco CTR fica escondido e a hora mostra `[HOUR]`.

Os **segredos** (Stripe, Resend, CRON) nunca entram no repositório: vão para `supabase secrets set` através de [`scripts/setup-supabase.ps1`](scripts/setup-supabase.ps1). O `.gitignore` exclui `.env`, `supabase/.env` e `*.key`.

Os links do Stripe em `config.js` são os de **modo de teste**: o botão Subscribe abre o Checkout de teste até à passagem a modo real (aprovação explícita). Domínio previsto `provendrop.com`: ver `docs/DOMINIO.md`; o ficheiro `CNAME` só se cria quando o domínio estiver comprado.

## Ficheiros

| Ficheiro | Função |
|---|---|
| `config.js` | Configuração pública (ver acima). |
| `index.html` | Página pública (inglês). Montra com números da folha pública (nomes em barras), secções de produto, preço e FAQ. Dias de anúncio contados a partir de `data_inicio` quando a folha a tiver; senão "at analysis". |
| `bem-vindo.html` | Pós-pagamento da subscrição direta. |
| `bem-vindo-click.html` | Pós-pagamento dos clientes Click (WhatsApp). |
| `app.html` | Área pessoal (inglês): login por magic link, Today, Archive, Preferences, Subscription, guia de 1 minuto. Só usa a chave *anon*; o acesso é decidido pelas políticas RLS. Kits por URL assinada (15 min) do bucket privado. |
| `supabase/migrations/0001_plataforma.sql` | Tabelas, RLS, bucket privado `kits`, job pg_cron (já aplicada). |
| `supabase/migrations/0002_kits_datas.sql` | `data_inicio` em `feed_dia`/`verdes`; `feed_dia` em `envios_diarios` (aplicada pelo setup-supabase.ps1). |
| `supabase/functions/stripe-webhook` | Webhook do Stripe: regista subscritores (origem por metadata → price_id → payment link), boas-vindas com magic link. |
| `supabase/functions/email-diario` | E-mail diário aos subscritores diretos ativos, à hora `HORA_ENVIO`, com a lista mais recente (sem lojas, links nem zips). |
| `supabase/functions/_shared/email.ts` | Envio pelo Resend e molde HTML. |
| `supabase/.env.example` | Nomes das variáveis (sem valores). |
| `scripts/setup-supabase.ps1` | Deploy num comando: link, segredos (sem eco), funções, migração 0002, `public.config`. |
| `docs/SETUP.md` | Ordem completa de configuração. |
| `docs/STRIPE.md` | O que já existe no Stripe em modo de teste (ids e links), como confirmar e como repetir no modo real. |
| `docs/EMAIL.md` | Resend: conta, domínio, chave, SMTP do Supabase Auth. |
| `docs/DOMINIO.md` | provendrop.com: DNS do GitHub Pages e do Resend, `CNAME` (só quando o domínio existir), URLs a mudar. |
| `docs/TESTE.md` | Plano de teste com resultados. |
| vault `_dados/publicar_feed.py` | Gera `feed_bot.json` (bot da Click) e, só para a plataforma, `zip_path` e `data_inicio` em cada item. |
| vault `_dados/publicar_plataforma.py` | Publica o feed em `feed_dia`/`verdes` e envia os zips para o Storage. |

## Pôr a funcionar

Segue [`docs/SETUP.md`](docs/SETUP.md): Supabase CLI → Stripe ([`docs/STRIPE.md`](docs/STRIPE.md)) → Resend ([`docs/EMAIL.md`](docs/EMAIL.md)) → `scripts\setup-supabase.ps1` → `config.js` → teste ([`docs/TESTE.md`](docs/TESTE.md)).

### Rotina diária (vault)

Guardar a service role key num ficheiro fora do vault e do repo, por exemplo `%USERPROFILE%\.provendrop\supabase_service_key.txt`, e correr, depois de `publicar_feed.py` e de `fazer_zip.py`, **a partir da raiz do vault "Product Research"** (os caminhos `zip:` das notas são relativos a essa raiz):

```bash
python3 "_dados/publicar_plataforma.py" --feed "_dados/feed_bot.json" --url https://maljrfgnnhtrjunnwlre.supabase.co --key-file "%USERPROFILE%\.provendrop\supabase_service_key.txt" --zips-dir "."
```

Códigos de saída: 0 ok · 3 rede bloqueada · 4 credenciais. Os zips encontrados em disco vão para o bucket privado `kits`; se o zip não existir, fica o `zip_url` externo. Quando a rotina passar a escrever `data_inicio:` no frontmatter das notas, a área e o site passam a contar os dias de anúncio até hoje.

## E-mail diário

Sai às `DAILY_TIME` (Europe/Lisbon; `09:00`) do dia seguinte à rotina, com a lista mais recente de `feed_dia`, só para `origem = direto` e `estado = ativo`. A mesma lista nunca sai duas vezes. Conteúdo: nome da coleção, mercado, anúncios, dias, alcance, "kit ready" e um botão para a área; **sem** lojas, links nem zips.

## Indicador de CTR

A secção logo a seguir ao topo do `index.html` só aparece quando `CTR` em `config.js` tiver os quatro campos preenchidos com dados de campanhas documentados:
```js
CTR: { valor: "14", tipo_campanha: "Search", periodo: "Jun–Oct 2026", impressoes: "120,000" }
```
À data de 2026-11-02 não existe no repo nem no vault nenhum registo (campanhas, período, impressões, cálculo) que sustente o valor; fica escondido até existir.

## Publicar

Settings → Pages → Deploy from branch → `main` / root. O ramo `plataforma-direto` só se funde em `main` depois do teste de `docs/TESTE.md` e da aprovação. Stripe fica em modo de teste até aprovação explícita.
