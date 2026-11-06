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

Todos os valores **públicos** estão em [`config.js`](config.js), lido pelas quatro páginas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STRIPE_LINK_DIRECT`, `STRIPE_LINK_RETURN`, `STRIPE_PORTAL_LINK`, `DAILY_TIME`, `PRICE_MONTHLY`, `PRICE_JOINING`, `CONTACT_EMAIL` e `CTR`. Com valores vazios o site não inventa nada: o botão Subscribe fica desativado ("Subscriptions are not open on this page yet"), os botões "Manage subscription" ficam escondidos, o bloco CTR fica escondido e a hora mostra `[HOUR]`.

Os **segredos** (Stripe, Resend, CRON) nunca entram no repositório: vão para `supabase secrets set` através de [`scripts/setup-supabase.ps1`](scripts/setup-supabase.ps1). O `.gitignore` exclui `.env`, `supabase/.env` e `*.key`.

**Links do Stripe (decisão S1, 2026-11-02):** em `main` os três links (`STRIPE_LINK_DIRECT`, `STRIPE_LINK_RETURN`, `STRIPE_PORTAL_LINK`) ficam **vazios** até ao modo real, por isso o site publicado tem o Subscribe desativado e nunca abre um Checkout de teste. Para os testes locais existe [`config.local.js`](config.local.example.js) (no `.gitignore`; copiar de `config.local.example.js`), que `config.js` só carrega quando a página é servida em `localhost`/`127.0.0.1` e que sobrepõe os links de **teste**. Em qualquer outro host o ficheiro nem é pedido. Domínio previsto `provendrop.com`: ver `docs/DOMINIO.md`; o ficheiro `CNAME` só se cria quando o domínio estiver comprado.

## Ficheiros

| Ficheiro | Função |
|---|---|
| `config.js` | Configuração pública (ver acima). Links do Stripe vazios em `main` (S1). |
| `config.local.example.js` | Modelo do `config.local.js` (links de **teste** do Stripe, só carregado em `localhost`; o próprio `config.local.js` está no `.gitignore`). |
| `index.html` | Página pública (inglês). Montra com números da folha pública (nomes em barras), secções de produto, preço e FAQ. Dias de anúncio contados a partir de `data_inicio` quando a folha a tiver; senão "at analysis". |
| `bem-vindo.html` | Pós-pagamento da subscrição direta. |
| `bem-vindo-click.html` | Pós-pagamento dos clientes Click (WhatsApp). |
| `app.html` | Área pessoal (inglês): login por magic link, Today, Archive, Preferences, Subscription, guia de 1 minuto. Só usa a chave *anon*; o acesso é decidido pelas políticas RLS. Kits por URL assinada (15 min) do bucket privado. |
| `supabase/migrations/0001_plataforma.sql` | Tabelas, RLS, bucket privado `kits`, job pg_cron (já aplicada). |
| `supabase/migrations/0002_kits_datas.sql` | `data_inicio` em `feed_dia`/`verdes`; `feed_dia` em `envios_diarios` (aplicada pelo setup-supabase.ps1). |
| `supabase/migrations/0003_boas_vindas.sql` | `subscritores.boas_vindas_em`: as boas-vindas só contam como enviadas quando o Resend aceita (aplicada 2026-11-02). |
| `supabase/migrations/0004_subscricoes.sql` | Tabela `subscricoes` (uma linha por subscrição Stripe, direto e click), `subscritores` derivado, acesso com tolerância de 7 dias em atraso, bloqueio por disputa, reserva atómica das boas-vindas, `stripe_eventos.processado_em`, `cron_secret` aleatório, varrimentos pg_cron (boas-vindas 15 min, reconciliação diária). Aplicada 2026-11-02. |
| `supabase/migrations/0005_google_e_kits.sql` | `feed_dia.anuncios_meta`, `anuncios_google`, `plataformas`, `anunciante_google` (só área privada), `kit_pronto`; `verdes.anuncios_google`, `plataformas`. Kit em todas as coleções da lista (aprovadas e a observar). Aplicada 2026-11-03 com `supabase db query --linked`. |
| `supabase/functions/stripe-webhook` | Webhook do Stripe: relê sempre o estado no Stripe, escreve `subscricoes` e deriva `subscritores`; só aceita eventos do modo configurado (`STRIPE_ACCEPT_TEST`); boas-vindas e "welcome back" por magic link (token_hash); disputas bloqueiam o acesso e alertam; `?reenviar_boas_vindas=<email>` e `?varrer_boas_vindas=1` com `x-cron-secret`. |
| `supabase/functions/email-diario` | E-mail diário a quem tem acesso (direto, ativo ou em atraso < 7 dias), à hora `HORA_ENVIO`, com a lista mais recente: estado, coleção, nicho, mercado, "N Meta + N Google ads", dias, alcance, "kit ready" em todas as que têm kit (sem lojas, links, anunciantes nem zips). |
| `supabase/functions/reconciliar` | Reconciliação diária Stripe ↔ base, só leitura, alerta por e-mail se divergir (M7). |
| `supabase/functions/_shared/` | `email.ts` (Resend + molde), `auth.ts` (x-cron-secret em tempo constante), `log.ts` (sem e-mails nem chaves nos logs), `alerta.ts` (e-mail ao Afonso: `ALERT_EMAIL`). |
| `supabase/.env.example` | Nomes das variáveis (sem valores). |
| `app.js` | Lógica da área pessoal (fora do HTML para a CSP ser estrita). Desde 2026-11-05 o "Today" e o "Archive" são tabelas (uma linha por coleção, kit por baixo do nome; blocos chave/valor abaixo de 768 px) e `renderFeed` preenche os 4 contadores do dia (`#kpiTotal`, `#kpiOk`, `#kpiWatch`, `#kpiKits`). |
| `src/tailwind.css` | Fonte do CSS (Tailwind v4): tema "clean SaaS" (página clara `#F4F7F6`, cartões brancos arredondados com sombra suave, marca teal `#0D9488`, um painel escuro `#07201E` para os dados do dia, Manrope), e as poucas classes de componente que o `app.js` usa por nome (`.msg`, `.status`, `.dt`/`.dt-dark`, `.strip`, `.plat`, `.redact`, `.side-link`). |
| `tailwind.css` | CSS compilado e minificado, lido por `index.html` e `app.html` (fica no repo: o GitHub Pages não faz build). Regenerar com `npm run build:css` sempre que se mudarem classes nas páginas ou no `app.js`. |
| `package.json` | Só o build do CSS (`@tailwindcss/cli`). `node_modules/` está no `.gitignore`. |
| `scripts/setup-supabase.ps1` | Deploy num comando: link, segredos por `.env` temporário com ACL (nunca na linha de comandos), funções, migrações 0002–0005, `public.config`. Enter = não alterar; recusa misturas teste/real. |
| `scripts/stripe-teste.ps1` | Uma vez, em modo de teste: cria o Payment Link de regresso e acrescenta os eventos de disputa/reembolso ao webhook (pela API, com a tua chave sem eco). |
| `.gitleaks.toml`, `.pre-commit-config.yaml`, `.github/workflows/secret-scan.yml` | Gate de segredos local (`pip install pre-commit && pre-commit install`) e em CI (histórico completo). |
| `docs/SEGURANCA.md`, `docs/PAGAMENTOS.md` | Revisões de 2026-11-02 e o estado de cada achado. |
| `docs/SETUP.md` | Ordem completa de configuração. |
| `docs/STRIPE.md` | O que já existe no Stripe em modo de teste (ids e links), como confirmar e como repetir no modo real. |
| `docs/EMAIL.md` | Resend: conta, domínio, chave, SMTP do Supabase Auth. |
| `docs/DOMINIO.md` | provendrop.com: DNS do GitHub Pages e do Resend, `CNAME` (só quando o domínio existir), URLs a mudar. |
| `docs/TESTE.md` | Plano de teste com resultados. |
| vault `_dados/publicar_feed.py` | Gera `feed_bot.json` (bot da Click) e, só para a plataforma, `zip_path` e `data_inicio` em cada item. |
| vault `_dados/publicar_plataforma.py` | Publica o feed em `feed_dia`/`verdes` e envia os zips para o Storage. Desde 2026-11-02 passa `anuncios_meta`/`anuncios_google`/`plataformas`/`anunciante_google` (valores por omissão em feeds antigos) e `kit_pronto` = há zip, aprovada ou a observar. |

## Estilos (redesign de 2026-11-05)

`index.html` e `app.html` usam Tailwind **compilado** (sem CDN em runtime, por causa da CSP estrita do `app.html`). Tema "clean SaaS", à imagem de um dashboard moderno: página clara `#F4F7F6`, cartões brancos `rounded-2xl` com sombra suave, bordas `#E2E8E6`, marca em teal (`#0D9488`, botão de ação sólido com texto branco), verde-esmeralda para "Approved", âmbar para "Under observation", e um único painel escuro (`#07201E`) para os dados do dia (hero e lista no site; tabela "Today" na área). Tipografia Manrope (Google Fonts, já permitida na CSP), números tabulares. A área de membros é um dashboard: barra lateral à esquerda (Today, Archive, Preferences, Subscription) que vira barra inferior em telemóvel, faixa de 4 contadores do dia e a tabela dentro do painel escuro. Depois de alterar classes:

```bash
npm install
```

```bash
npm run build:css
```

e fazer commit do `tailwind.css` gerado. Nada muda na lógica: `app.js` e `config.js` mantêm as mesmas funções, ids e variáveis.

## Pôr a funcionar

Segue [`docs/SETUP.md`](docs/SETUP.md): Supabase CLI → Stripe ([`docs/STRIPE.md`](docs/STRIPE.md)) → Resend ([`docs/EMAIL.md`](docs/EMAIL.md)) → `scripts\setup-supabase.ps1` → `config.js` → teste ([`docs/TESTE.md`](docs/TESTE.md)).

### Rotina diária (vault)

Guardar a service role key num ficheiro de texto **fora do vault e do repo** (o caminho fica só na rotina, não aqui — S14) e correr, depois de `publicar_feed.py` e de `fazer_zip.py`, **a partir da raiz do vault "Product Research"** (os caminhos `zip:` das notas são relativos a essa raiz):

```bash
python3 "_dados/publicar_plataforma.py" --feed "_dados/feed_bot.json" --url https://maljrfgnnhtrjunnwlre.supabase.co --key-file "<ficheiro da service role key>" --zips-dir "."
```

Códigos de saída: 0 ok · 3 rede bloqueada · 4 credenciais. Os zips encontrados em disco vão para o bucket privado `kits`; se o zip não existir, fica o `zip_url` externo. Quando a rotina passar a escrever `data_inicio:` no frontmatter das notas, a área e o site passam a contar os dias de anúncio até hoje.

## Acesso, pagamentos falhados e regresso

- Acesso (`public.tem_acesso`): subscrição **direto**, não bloqueada, `ativo` ou `em_atraso` há menos de **7 dias** (decisão de 2026-11-02). Depois a área fecha e o e-mail diário pára; `invoice.paid` repõe.
- Quem cancela e volta **não paga a adesão outra vez**: a área mostra o link de regresso (`STRIPE_LINK_RETURN`, só mensalidade) a ex-membros, quando esse link existir (em modo real ainda não existe: até lá a área mostra o Subscribe normal). O site diz que a adesão é cobrada na primeira subscrição.
- **Adesão só no Direct** (decisão de 2026-11-06): quem entra pela Click paga 15 €/mês sem adesão; o link via Click nunca aparece no site.
- Não há promessa de vagas por nicho/país nem de reembolso (A9): o nicho e os países servem para ordenar as coleções.
- Disputa → acesso suspenso + alerta; reembolso → só alerta. Alertas vão para `ALERT_EMAIL` (ou `EMAIL_REPLY_TO`).

## E-mail diário

Sai às `DAILY_TIME` (Europe/Lisbon; `09:00`) do dia seguinte à rotina, com a lista mais recente de `feed_dia`, só para quem tem acesso. A mesma lista nunca sai duas vezes. Conteúdo: nome da coleção, mercado, anúncios, dias, alcance, "kit ready" e um botão para a área; **sem** lojas, links nem zips.

## Indicador de CTR

A secção logo a seguir ao topo do `index.html` só aparece quando `CTR` em `config.js` tiver os quatro campos preenchidos com dados de campanhas documentados:
```js
CTR: { valor: "14", tipo_campanha: "Search", periodo: "Jun–Oct 2026", impressoes: "120,000" }
```
À data de 2026-11-02 não existe no repo nem no vault nenhum registo (campanhas, período, impressões, cálculo) que sustente o valor; fica escondido até existir.

## Publicar

Settings → Pages → Deploy from branch → `main` / root. O ramo `plataforma-direto` só se funde em `main` depois do teste de `docs/TESTE.md` e da aprovação. Stripe fica em modo de teste até aprovação explícita.
