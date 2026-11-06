# Teste completo em modo de teste

Preencher a coluna **Resultado** a cada passo (data, quem, o que se viu). Nada passa a `main` sem todos os passos verdes. Última actualização: 2026-11-06 (modo real: §0 novas linhas, §2.1 sem adesão na porta Click, §7 teste real).

Legenda: ✅ passou · ❌ falhou · ⏳ por executar (depende de contas que ainda não existem: Stripe, Resend, deploy).

## 0. O que já foi verificado localmente (2026-11-02, sem Stripe, sem Resend, sem deploy)

| Verificação | Resultado |
|---|---|
| `index.html`, `bem-vindo.html`, `bem-vindo-click.html`, `app.html` carregam a 1440 e 390 px, sem overflow nem erros de consola, com `config.js` real | ✅ (Playwright, Chrome, servidor local) |
| Com `config.js` **vazio**: botão Subscribe desativado ("Subscriptions are not open on this page yet"), bloco CTR escondido, `[HOUR]` visível nas 4 páginas, `app.html` mostra "The member area is not active yet" | ✅ |
| Com `config.js` real: `09:00` em todos os `[HOUR]`, preço €15 + €25, `app.html` abre o ecrã de login (Supabase ligado) | ✅ |
| **S1** (`config.js` com os 3 links do Stripe vazios, como em `main`): em `localhost` com `config.local.js` o Subscribe abre o Checkout de **teste** e o portal está ativo; num host que não é local (`provendrop.test`, simulado) `config.local.js` **não é pedido**, Subscribe desativado, "Manage subscription" escondido/WhatsApp | ✅ 2026-11-02 (Playwright: `127.0.0.1:8000` pede `config.local.js` e o Subscribe aponta para `buy.stripe.com/test_…`; `provendrop.test` servido do disco: 0 pedidos a `config.local.js`, `aria-disabled`, WhatsApp; sem erros de consola nas 3 páginas, CSP de `app.html` incluída) |
| Nenhuma página pública contém o ID da folha proibida, lojas, links de coleções ou zips (`index.html` continua a ler só a folha pública; nomes em barras `.redact`) | ✅ |
| `publicar_feed.py` (vault) gera o mesmo `texto_whatsapp` e os mesmos campos antigos; só acrescenta `zip_path` e `data_inicio` | ✅ (comparado com o `feed_bot.json` real, sem o reescrever) |
| `publicar_plataforma.py --dry-run` com `--zips-dir` = raiz do vault encontra o zip da coleção aprovada e prepararia o upload para `kits/2026-11-01/…` | ✅ |
| `scripts/setup-supabase.ps1` sem erros de sintaxe (parser do PowerShell) | ✅ (executado pelo Afonso em 2026-11-02: link, segredos e deploy feitos) |
| Migração `0003_boas_vindas.sql` aplicada com `supabase db query --linked` (CLI 2.122.0) e `stripe-webhook` com novo deploy (`--no-verify-jwt`) | ✅ 2026-11-02 |
| **Research 2026-11-02** (kits em todas, Meta+Google, lojas genéricas, nunca repetida): `publicar_plataforma.py --dry-run` com um feed novo (1 aprovada + 1 a observar, ambas com zip, `anuncios_meta/google`, `plataformas`, `anunciante_google`) e com um feed antigo sem os campos novos → os dois publicam; antigo fica `meta = anuncios_ativos`, `google 0`, `{meta}`, sem anunciante; `kit_pronto` true nas duas do feed novo | ✅ 2026-11-03 (dry-run, exit 0 nos dois) |
| Área de membros com Supabase simulado (Playwright): botão **Download Launch Kit** nos dois cartões (no 🟡 diz "(under observation)" + selo "Under observation — test with a small budget"); factos Meta ads / Google ads / Days / People reached; chips Meta/Google; "Advertiser: …" só quando há Google ads; linha antiga sem campos novos → Meta = anuncios_ativos, Google 0; Archive com filtro **Platform** (All/Meta/Google/Meta and Google) e coluna Platforms; sem overflow a 390 px; 0 erros de consola | ✅ 2026-11-03 |
| `index.html` com a folha real (ainda sem `anuncios_google`): "Active ads" como antes, nada inventado; com folha simulada **com** `anuncios_meta/anuncios_google`: "Meta ads" + "Google ads" na montra, na lista e coluna "Google ads" no arquivo, e-mail de exemplo "12 Meta + 5 Google ads"; **sem** a coluna: igual a antes. "Also tracked: Netherlands, Austria, Switzerland, Hungary." e as 4 FAQ novas/actualizadas presentes; sem overflow a 390 px; 0 erros | ✅ 2026-11-03 |
| Segurança do site (automático): `index.html`, `bem-vindo*.html`, `app.html`, `config.js` sem `/collections/`, `drive.google`, `zip_url`, `link_colecao`, ID da folha proibida, nomes de lojas do `feed_bot.json` nem nomes do `anunciantes_google.json`; `data.json` → 404 | ✅ 2026-11-03 (único "match" foi a palavra genérica `paises`) |
| Migração `0005_google_e_kits.sql` aplicada com `supabase db query --linked` (colunas confirmadas em `feed_dia` e `verdes`, `kit_pronto` true nas 2 linhas com zip, `anon` sem privilégios) e `email-diario` com novo deploy (`--no-verify-jwt`) | ✅ 2026-11-03 |
| Função publicada responde: POST sem assinatura → 400; `?reenviar_boas_vindas=` sem `x-cron-secret` → 401 `{"erro":"não autorizado"}`; GET → 405 | ✅ 2026-11-02 (curl) |
| **Modo real + montra (2026-11-06)** · Segurança do site: `index.html`, `bem-vindo*.html`, `app.html`, `config.js`, `app.js` sem `/collections/`, `drive.google`, `zip_url`, ID da folha proibida, `docs.google.com`/`gviz`, "Bellora", nomes de lojas (`feed_bot.json`) nem de anunciantes (`anunciantes_google.json`, 95 nomes); `data.json` → 404 | ✅ 2026-11-06 (Playwright + fetch local; únicos "matches": a coluna `link_colecao` lida por `app.js` na área privada e a data `2026-11-04` num comentário) |
| `index.html` **não faz pedidos à folha pública**: 0 pedidos a `docs.google.com`/`gviz` a 1280 e 375 px; só `fonts.googleapis.com`/`fonts.gstatic.com`; 0 erros de consola; sem overflow a 375; nenhum "0" visível nas maquetes (números desfocados); sem secção de arquivo; vídeo UGC com `muted loop playsinline controls preload="none"` | ✅ 2026-11-06 |
| Área de membros continua a ler do Supabase (`feed_dia` → `select dia` + `select *`, `verdes`, `subscritores`; REST simulado com o mesmo caminho de código, `app.js` sem alterações ao fetch): Today com 4 linhas; **Meta ads** = `anuncios_meta` ou `anuncios_ativos − anuncios_google` (14 − 3 = 11); linha sem Meta → **"No Meta data"** em vez de 0; alcance com anúncios só no Reino Unido/Suíça marcado com o país, nunca "EU reach"; **Switzerland / Netherlands / Hungary** com nome (7.ª célula na faixa de mercados); Archive com coluna **Meta reach** e score por mercado (**7.2 CH**, **7.2 HU**); 0 erros de consola | ✅ 2026-11-06 (Playwright, Supabase simulado) |
| Lighthouse mobile (`index.html`, performance): **antes 91 / depois 93**; LCP 2,8 s → 2,6 s; **CLS 0** nos dois; peso 189 → 171 KiB | ✅ 2026-11-06 |
| Screenshots desktop (1280) e mobile (375) das secções alteradas | ✅ `docs/screenshots/antes/` e `docs/screenshots/depois/` (JPEG) |
| `bem-vindo-click.html`: botão WhatsApp `wa.me/351920414823` com a mensagem pré-definida; com `?session_id=cs_live_…` a mensagem leva "Código da compra: …"; sem `session_id` ou com valor inválido (`<script>`) vai sem a linha do código; a página só pede fontes (nenhum pedido ao Stripe); 0 erros | ✅ 2026-11-06 |
| `stripe-webhook`: `compat.test.ts` (8 testes, fixtures acacia e 2026-10-28.endive) verdes com `deno test`; `deno check` limpo em `stripe-webhook`, `reconciliar` e `email-diario` | ✅ 2026-11-06 |
| `scripts/setup-supabase.ps1` sem erros de sintaxe (parser do PowerShell) | ✅ 2026-11-06 (não executado: só o Afonso, com as chaves reais) |
| Edge Functions: sintaxe TypeScript verificada com o compilador TypeScript (transpileModule, sem erros); não executadas: sem Deno nem deploy | ✅ |

## 1. Pagamento Direct → acesso → cancelamento

Pré-requisitos: STRIPE.md a), c), d), e) feitos; EMAIL.md 1–5 feitos; `setup-supabase.ps1` corrido; `config.local.js` criado a partir de `config.local.example.js` (links de teste; S1: `config.js` fica com os links vazios); site servido em `localhost` a partir da raiz do repo (`python -m http.server 8000`), porque é só aí que `config.local.js` é carregado.

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 1.1 | Abrir o site → **Subscribe** | Checkout de teste do Stripe com "ProvenDrop Direct · 15,00 €/mês" + "Joining fee 25,00 €" (total 40 €) | ✅ 2026-11-02 (site local, modo de teste) |
| 1.2 | Pagar com o cartão de teste `4242 4242 4242 4242`, validade futura, CVC qualquer, e-mail **teu** | Redireciona para `bem-vindo.html` ("Payment received. Welcome.") com `09:00` no passo 3 | ✅ 2026-11-02 (site local, modo de teste) |
| 1.3 | Supabase → Edge Functions → `stripe-webhook` → **Logs** | `checkout.session.completed` e `customer.subscription.created` com 200; a resposta traz `acesso:true` e `boas_vindas:"enviadas"` num deles; sem erros | ❌ 2026-11-02 (1.ª tentativa): o Resend falhou no `created` e o checkout passou sem e-mail (bug corrigido em fdcca13 e refeito em 0004/A3). **Não reenviar eventos antigos pelo Stripe** (PAGAMENTOS.md C1/A2: a fotografia antiga sobreporia o estado; hoje o webhook relê o Stripe, mas o teste limpo é um pagamento novo). ⏳ repetir com um **pagamento novo** |
| 1.4 | SQL Editor: `select email, origem, estado, user_id is not null as login, boas_vindas_em from public.subscritores` | 1 linha: o teu e-mail, `direto`, `ativo`, `login = true`, `boas_vindas_em` preenchido | ✅ 2026-11-02 (site local, modo de teste) |
| 1.4b | Se `boas_vindas_em` estiver null (Resend falhou): `curl -X POST "https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook?reenviar_boas_vindas=<o-teu-email>" -H "x-cron-secret: <CRON_SECRET>"` | `{ok:true, boas_vindas:"enviadas"}`; e-mail novo com magic link novo; `boas_vindas_em` passa a preenchido. Sem o cabeçalho → 401; e-mail de um subscritor click → 409 | ⏳ |
| 1.5 | SQL Editor: `select * from public.stripe_eventos order by recebido_em` | um `evt_…` por evento, sem repetidos | ✅ 2026-11-02 (site local, modo de teste) |
| 1.6 | Caixa de correio | E-mail "Welcome to ProvenDrop: your access" (remetente `EMAIL_FROM`), botão **Sign in to ProvenDrop**, menciona `09:00` | ❌ 2026-11-02: não chegou (o Resend falhou no `customer.subscription.created`; ver 1.3). **Corrigido** pelo ponto 2 (migração 0003 + webhook): agora repete-se até o Resend aceitar e há reenvio manual (1.4b). ⏳ confirmar com um reenvio ou um pagamento novo |
| 1.7 | Clicar no botão | Abre `app.html` com sessão: guia de 1 minuto → **Choose my niute and countries** → guardar | ✅ 2026-11-02 (site local, modo de teste). Encontrado e corrigido no mesmo dia: o texto de cada passo do guia caía na coluna de 32 px (letra a letra) e os botões ficavam fora do ecrã; agora `b`/`span` ficam na 2.ª coluna, o cartão tem `max-height` com scroll e um botão ✕ |
| 1.8 | Separador **Today** | As coleções publicadas pela rotina (`feed_dia`), com nome, loja, link, Meta/Google ads, chips das plataformas, "Advertiser" quando há Google; **Download Launch Kit** em todas as que têm zip (🟡 com "(under observation)" e selo) | ✅ 2026-11-02 (site local, modo de teste) · ⏳ repetir depois da migração 0005 e de um feed novo com os campos Google |
| 1.9 | **Download Launch Kit** | Abre uma URL assinada do bucket `kits` e descarrega o zip (link válido 15 min). Se a coleção só tiver `zip_url`, abre o link externo | ✅ 2026-11-02 (site local, modo de teste) |
| 1.10 | **Archive** | Tabela de aprovadas, filtros por nicho/mercado/ainda a anunciar, botão **Kit** | ✅ 2026-11-02 (site local, modo de teste) |
| 1.11 | **Subscription** → **Manage subscription** | Portal do Stripe (pede o e-mail, envia link) → **Cancel subscription** → confirmar | ✅ 2026-11-02 (site local, modo de teste) |
| 1.12 | Logs do webhook + SQL | `customer.subscription.updated`/`deleted` → `estado = cancelado` (ou `ativo` com `cancel_at_period_end` até ao fim do período, se o portal estiver configurado assim; nesse caso ver 1.13) | ✅ 2026-11-02 (site local, modo de teste) |
| 1.13 | Recarregar `app.html` | "Subscription cancelled" e sem acesso; SQL `select count(*) from feed_dia` com a sessão do utilizador devolve 0 (RLS). Para testar sem esperar o fim do período: Stripe → cliente → subscrição → **Cancel subscription** → **Immediately** | ✅ 2026-11-02 (site local, modo de teste) |
| 1.14 | Página de login com um e-mail sem subscrição → **Send sign-in link** | "This e-mail has no subscription…" | ⏳ |
| 1.15 | Página de login com o e-mail do teste → **Send sign-in link** | E-mail "Your ProvenDrop sign-in link" pelo SMTP do Resend (EMAIL.md §5); o link abre a área | ⏳ |

## 2. Pagamento pelo link da Click

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 2.1 | Abrir o Payment Link da Click (teste) e pagar com `4242…` e **outro** e-mail | Checkout **só** com "ProvenDrop via Click · 15,00 €/mês" (**sem** adesão, decisão de 2026-11-06); redireciona para `bem-vindo-click.html` (WhatsApp da Click, "No joining fee") | ⏳ |
| 2.2 | SQL `select email, origem, estado, user_id from public.subscritores` | Nova linha `origem = click`, `estado = ativo`, `user_id` **null** | ⏳ |
| 2.3 | Caixa de correio desse e-mail | **Nenhum** e-mail de boas-vindas do ProvenDrop | ⏳ |
| 2.4 | `app.html` → pedir link de entrada com esse e-mail | "This e-mail has no subscription…" (não tem conta Auth) | ⏳ |
| 2.5 | Se o produto da Click não tiver metadata nem `STRIPE_PRICE_CLICK` definido | Logs: aviso "origem desconhecida… registado como click"; o resultado é o mesmo (sem acesso) | ⏳ |

## 3. E-mail diário

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 3.0 | Erro do Resend (ex.: destinatário recusado em modo de teste) | `502 {"erro": "…", "feed_dia": …}` legível, sem a chave; `envios_diarios` sem linha nova | ⏳ (antes: "Internal Server Error" sem corpo; corrigido 2026-11-02) |
| 3.1 | Com 1 subscritor `direto` `ativo` (do teste 1, antes de cancelar) e feed publicado, forçar: `curl -X POST "https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/email-diario?forcar=1" -H "x-cron-secret: <CRON_SECRET>"` | JSON `{ok:true, feed_dia:"…", colecoes:N, destinatarios:1, enviados:1}` | ✅ 2026-11-02 (site local, modo de teste) |
| 3.2 | Caixa de correio | Assunto "ProvenDrop · dd/mm: N collections today"; uma linha por coleção com **estado, nome da coleção, nicho, mercado, "N Meta + N Google ads", days, people, kit ready (também nas 🟡 com kit)**; botão **Open today's collections** → `app.html` | ✅ 2026-11-02 (site local, modo de teste) |
| 3.3 | Inspeccionar o e-mail | **Sem** nomes de lojas, **sem** links de coleções, **sem** links de zips (o único link é `app.html`) | ✅ 2026-11-02 (site local, modo de teste) |
| 3.4 | Sem `x-cron-secret` ou com valor errado | 401 `{"erro":"não autorizado"}` | ⏳ |
| 3.5 | Chamada sem `forcar` fora das 09:00 | `{ok:true, saltado:"fora da hora"}` | ⏳ |
| 3.6 | SQL `select * from public.envios_diarios` | 1 linha por dia de envio, com `feed_dia` | ⏳ |
| 3.7 | No dia seguinte às 09:00 (Lisboa), sem forçar | E-mail chega sozinho (pg_cron → função); `cron.job_run_details` mostra a chamada | ⏳ |

## 4. Páginas públicas sem dados privados

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 4.1 | Ver código-fonte de `index.html`, `bem-vindo.html`, `bem-vindo-click.html`, `app.html` (sem sessão) e `config.js` publicados | Nenhuma loja, link de coleção, zip, `data.json`, chave `sk_`/`whsec_`/`re_`, nem o ID da folha Google privada (a que não é a "dados públicos do site") | ✅ local (2026-11-02) · ✅ site publicado 2026-11-03 (após merge do PR #1: `config.js` com links vazios, `config.local.js` e `data.json` → 404) |
| 4.2 | `app.html` sem sessão, com o DevTools → Network | Só pedidos a `config.js`, `app.js`, fontes e `supabase.min.js` (com SRI); nenhum dado de `feed_dia`/`verdes` (RLS) | ✅ 2026-11-02 (revisão de segurança, ao vivo) |
| 4.3 | Com a anon key, `curl "https://maljrfgnnhtrjunnwlre.supabase.co/rest/v1/feed_dia?select=*" -H "apikey: <anon>"` | `[]` ou erro de permissão; nunca linhas | ✅ 2026-11-02: 401 permission denied em `feed_dia`, `verdes`, `subscritores`, `config`, `stripe_eventos`, `envios_diarios` |
| 4.4 | Com a anon key, `curl "https://maljrfgnnhtrjunnwlre.supabase.co/storage/v1/object/kits/<caminho>" -H "apikey: <anon>"` | 400/403; o bucket é privado | ✅ 2026-11-02: listagem do bucket devolve `[]` |
| 4.5 | Site **publicado** (GitHub Pages ou domínio): `index.html`, `bem-vindo-click.html`, `app.html` com DevTools → Network | S1: Subscribe desativado ("Subscriptions are not open on this page yet"); "Manage subscription" abre o WhatsApp / está escondido; **nenhum pedido** a `config.local.js` | ✅ 2026-11-03 no site publicado (Playwright em `afonsolopes22.github.io`: `aria-disabled`, "Subscriptions are not open on this page yet", 0 pedidos a `config.local.js`, WhatsApp, `app.html` em login, 0 erros de consola) |

## 6. Cenários de pagamento (PAGAMENTOS.md), depois das correções de 2026-11-02

Pré-requisito: `scripts\stripe-teste.ps1` corrido (link de regresso criado e eventos `charge.dispute.created`/`charge.refunded` no endpoint), `setup-supabase.ps1` corrido de novo (função com `STRIPE_ACCEPT_TEST=1`, `ALERT_EMAIL`), migração 0004 aplicada (feita em 2026-11-02). Em cada cenário, confirmar em SQL: `select * from public.subscricoes order by atualizado_em desc;` e `select email, origem, estado, em_atraso_desde, acesso_fim, bloqueado_em, boas_vindas_em, regresso_em from public.subscritores;`.

Cartões de teste do Stripe (qualquer validade futura e CVC):

| Cartão | Efeito |
|---|---|
| `4242 4242 4242 4242` | paga sempre |
| `4000 0000 0000 0002` | recusado (`card_declined`) |
| `4000 0027 6000 3184` | pede 3D Secure: completar ou abandonar (cenário 6.4) |
| `4000 0000 0000 0341` | o checkout passa, a fatura seguinte falha (`past_due`) |
| `4000 0000 0000 0259` | paga e abre uma disputa logo a seguir (cenário 6.23) |

| # | Cenário | Como provocar | Esperado | Resultado |
|---|---|---|---|---|
| 6.3 | checkout e created em paralelo | Pagamento novo com `4242…` (os dois eventos chegam juntos) | **1** e-mail de boas-vindas (reserva atómica); `boas_vindas_tentativas = 1`; o link do e-mail entra (token_hash) | ⏳ |
| 6.4 | created(incomplete) → updated(active) | Pagar com `4000 0027 6000 3184`, fechar o 3DS sem concluir; depois concluir o pagamento | Enquanto `incomplete`: `subscricoes.estado = incompleto`, `subscritores.estado = incompleto`, **sem** utilizador Auth nem e-mail; `app.html` diz "Payment not completed". Depois de pagar: `ativo` + boas-vindas | ⏳ |
| 6.5 / 6.9 / 6.11 | Evento atrasado/reenviado com fotografia antiga | Depois de cancelar (6.13), **Reenviar** no Stripe um `customer.subscription.updated (active)` antigo | Estado continua `cancelado`: o webhook relê o Stripe (resposta `estado:"cancelado"`); `stripe_eventos` fica com `processado_em` e `tentativas` | ⏳ |
| 6.8 | Evento repetido já concluído | Reenviar qualquer evento já processado | 200 `{"ok":true,"repetido":true}`; nada muda | ⏳ |
| 6.12 | Falha de pagamento e depois pago | Pagar com `4000 0000 0000 0341`; no Stripe, criar e cobrar a fatura seguinte (ou usar um relógio de teste) | `invoice.payment_failed` → `em_atraso` com `em_atraso_desde`; a área continua a abrir com "You keep access for N more days"; `invoice.paid` → `ativo`, `em_atraso_desde` null | ⏳ |
| 6.12b | Tolerância esgotada | SQL (só em teste): `update public.subscritores set em_atraso_desde = now() - interval '8 days' where email = '…'` | `app.html` → "Payment overdue … grace period is over"; `select count(*) from feed_dia` com a sessão → 0 (RLS); e-mail diário já não inclui o e-mail | ⏳ |
| 6.13 | Cancelar no portal | **Manage subscription → Cancel** | `estado` continua `ativo`, `acesso_fim` = fim do período; a área mostra "Active until <data> (cancelled)" (B4); no fim do período → `cancelado` | ⏳ |
| 6.14 | Direct → Click, mesmo e-mail | Com o Direct ativo, pagar o link da Click com o **mesmo** e-mail | `subscricoes`: 2 linhas (direto ativo, click ativo); `subscritores.origem` continua `direto`, acesso mantido; **alerta** "Mesmo e-mail com duas subscrições" em `ALERT_EMAIL` | ⏳ |
| 6.15 | Click → Direct, mesmo e-mail | Pagar primeiro o link Click, depois o Direct | `subscricoes`: click + direto; `subscritores.origem = direto` com acesso; a linha click continua (comissão) | ⏳ |
| 6.16 | Direct duas vezes | Pagar o link Direct duas vezes com o mesmo e-mail | 2 linhas direto em `subscricoes`; alerta de duplicados; cancelar uma no Stripe → acesso mantém-se pela outra | ⏳ |
| 6.19 | Link Click para tentar obter acesso Direct | Pagar só o link Click | `subscritores.origem = click`, sem login, sem acesso (RLS) | ⏳ |
| 6.22 | Regresso após cancelar | Com uma linha `cancelado` e `boas_vindas_em` preenchido, abrir `app.html` → "Subscribe again (monthly fee only)" e pagar | Checkout **sem** adesão (15 €); `subscricoes` nova linha direto ativo; `subscritores.estado = ativo`; e-mail **"Welcome back to ProvenDrop"** (`regresso_em` preenchido); nichos/países mantidos | ⏳ |
| 6.23 | Disputa | Pagar com `4000 0000 0000 0259` | `charge.dispute.created` → `subscritores.bloqueado_em` preenchido (motivo `disputa dp_…`); `app.html` → "Access suspended"; RLS devolve 0 linhas; **alerta** com o prazo (`evidence_details.due_by`) | ⏳ |
| 6.24 | Reembolso total | Stripe → Pagamentos → o pagamento → **Reembolsar** | `charge.refunded` → **alerta** "Reembolso total"; acesso **não** é cortado automaticamente (procedimento: cancelar a subscrição no Stripe → `deleted` → `cancelado`) | ⏳ |
| 6.25 | Modo errado (S1/M11) | Com `STRIPE_ACCEPT_TEST=1`, um evento **real** (ou vice-versa) | 200 `{"ok":true,"ignorado":"…"}` e aviso no log; nada escrito | ⏳ (só verificável quando existir o endpoint real) |
| 6.26 | Varrimento das boas-vindas | SQL: `update public.subscritores set boas_vindas_em = null where email = '…'`; esperar ≤ 15 min (ou `POST …/stripe-webhook?varrer_boas_vindas=1` com `x-cron-secret`) | Resposta `{candidatos:1, enviadas:1}`; e-mail novo; `boas_vindas_em` preenchido | ⏳ |
| 6.27 | Reconciliação | `POST …/reconciliar` com `x-cron-secret` | JSON `{ok:true, stripe:N, base:N, divergencias:0}`; com uma divergência forçada (ex.: `update subscricoes set estado='cancelado' …`) → alerta por e-mail; nada é alterado | ⏳ |
| 6.28 | Sem segredo | `POST …/reconciliar`, `…?varrer_boas_vindas=1`, `…?reenviar_boas_vindas=x` sem `x-cron-secret`; webhook sem assinatura | 401 `{"erro":"não autorizado"}`; 400 `{"erro":"assinatura inválida"}` | ✅ 2026-11-02 (curl, funções publicadas) |

## 7. Teste real (modo real, desde 2026-11-06) — feito pelo Afonso, com pagamentos reais

Pré-requisitos: PR fundido em `main`; `scripts\setup-supabase.ps1` corrido com `sk_live_` e o `whsec_` do endpoint real (os `price_` reais são os valores por omissão); eventos `charge.dispute.created`/`charge.refunded` acrescentados ao endpoint real; dados de teste apagados (§5). Usar um e-mail que **não** seja o da conta Resend e um cartão real (os valores voltam no passo 7.6).

| # | Passo | Esperado | Resultado |
|---|---|---|---|
| 7.1 | Site publicado → **Subscribe** → pagar o Direct (**40 €**: 15 € + 25 € de adesão) | Checkout real "ProvenDrop" (nome público); redireciona para `bem-vindo.html` | ⏳ |
| 7.2 | SQL: `select email, origem, estado, user_id is not null as login, boas_vindas_em from public.subscritores` | 1 linha: o e-mail, `direto`, `ativo`, `login = true`, `boas_vindas_em` preenchido; logs do webhook com `checkout.session.completed` / `customer.subscription.created` / `invoice.paid` a 200 (eventos na API 2026-10-28.endive lidos sem aviso de "sem subscrição") | ⏳ |
| 7.3 | E-mail "Welcome to ProvenDrop: your access" → **Sign in to ProvenDrop** | Abre `app.html` com sessão; Today mostra as coleções do dia; **Download Launch Kit** descarrega o zip | ⏳ |
| 7.4 | Subscription → **Manage subscription** → portal real → **Cancel subscription** | `customer.subscription.updated` com `cancel_at_period_end`; a área mostra "ends on <data>"; para cortar já: Stripe → cliente → subscrição → Cancelar **imediatamente** → `deleted` → `cancelado` → `app.html` "Subscription cancelled", sem acesso (RLS devolve 0 linhas) | ⏳ |
| 7.5 | Stripe → Pagamentos → o pagamento de 40 € → **Reembolsar** (total) | `charge.refunded` → alerta "Reembolso total" em `ALERT_EMAIL` (se o evento estiver no endpoint); nada muda no acesso (já cancelado) | ⏳ |
| 7.6 | Abrir o **link da Click** (o que a Click envia; não está no site) e pagar com **outro** e-mail | Checkout só com "ProvenDrop via Click · 15,00 €/mês", **sem adesão**; redireciona para `bem-vindo-click.html` ("No joining fee"); SQL: linha `origem = click`, `estado = ativo`, `user_id` null; **nenhum** e-mail de boas-vindas; `app.html` com esse e-mail → "This e-mail has no subscription…". Depois: cancelar imediatamente e reembolsar no Stripe | ⏳ |
| 7.7 | Depois dos dois reembolsos | `select * from public.subscricoes` mostra as duas linhas `cancelado`; `reconciliar` (06:30 UTC ou `POST …/reconciliar` com `x-cron-secret`) sem divergências | ⏳ |

## 5. Depois do teste

- **Apagar sempre** os dados de teste antes de passar a modo real (A7: a base é a mesma em teste e em real; uma linha de teste `ativo` manteria acesso e e-mail diário sem pagar): `delete from public.subscricoes where email in (...)`, `delete from public.subscritores where email in (...)`, `delete from public.stripe_eventos`, `delete from public.envios_diarios`, e os utilizadores em **Authentication → Users**. Só depois é que o teste real prova as boas-vindas.
- Só então: commit, PR, revisão, merge em `main` com aprovação, e a passagem a modo real (STRIPE.md, última secção).
