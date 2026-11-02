# Stripe: o que já existe em modo de teste, como confirmar, e como repetir no modo real

Conta Stripe do ProvenDrop, **modo de teste**. Tudo o que está nesta página já foi criado (2026-11-02) e **não deve ser criado outra vez**: produtos, links e webhook novos só no modo real, com aprovação explícita. Os identificadores abaixo são públicos; as chaves `sk_` e `whsec_` nunca entram em ficheiros, commits ou mensagens.

**Modo da função (S1/M11):** o webhook só aceita eventos do modo para que foi configurado. Com o segredo `STRIPE_ACCEPT_TEST=1` (o `setup-supabase.ps1` define-o quando a chave é `sk_test_`) só entram eventos `livemode=false`; eventos reais recebem 200 vazio e um aviso no log. Com `sk_live_` o script põe `STRIPE_ACCEPT_TEST=0` e passa-se o contrário. Assim um endpoint de teste esquecido nunca escreve na base em produção.

Rótulos dos menus: o Dashboard do Stripe em português (Europa). Entre parênteses, o rótulo em inglês quando ajuda.

## O que existe

| O quê | Identificador | Onde se usa |
|---|---|---|
| Produto **ProvenDrop Direct**, 15 €/mês | `prod_VYFz5Sh2acJSKc` · `price_1UX9ThJMAlqVy4dKYnrmwGb3` | segredo `STRIPE_PRICE_DIRETO` |
| Produto **ProvenDrop via Click**, 15 €/mês | `prod_VYG0mJkH0A457H` · `price_1UX9UYJMAlqVy4dK2FZi3k9w` | segredo `STRIPE_PRICE_CLICK` |
| Produto **Adesão ProvenDrop**, 25 € uma vez (nos dois links) | `prod_VYG0gDziJ4fFAJ` · `price_1UX9UOJMAlqVy4dKxdL2r2wj` | só no Stripe |
| Payment Link **Direct** | `plink_1UX9UkJMAlqVy4dKAXTumtyZ` · `https://buy.stripe.com/test_cNidRaaV4gWv1Cy7mhfbq00` | `config.local.js` → `STRIPE_LINK_DIRECT` (S1: em `config.js` fica vazio até ao modo real); segredo `STRIPE_PAYMENT_LINK_DIRETO` |
| Payment Link **via Click** (o que a Click envia aos clientes dela) | `plink_1UX9UxJMAlqVy4dKAbyhkQk7` · `https://buy.stripe.com/test_9B64gA2oygWv0yu7mhfbq01` | só a Click o usa |
| Portal de cliente | configuração `bpc_1UX9V9JMAlqVy4dKReL66kNG` · `https://billing.stripe.com/p/login/test_cNidRaaV4gWv1Cy7mhfbq00` | `config.local.js` → `STRIPE_PORTAL_LINK` (vazio em `config.js` até ao modo real) |
| Webhook | `we_1UX9VNJMAlqVy4dKeelqzvJL` → `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook` | segredo `STRIPE_WEBHOOK_SECRET` (o `whsec_` deste endpoint) |
| Payment Link **Direct de regresso** (só mensalidade, sem adesão; metadata `origem=direto`, `tipo=regresso`) | criado por `scripts\stripe-teste.ps1` (ver abaixo) | `config.local.js` → `STRIPE_LINK_RETURN` (vazio em `config.js` até ao modo real) |

**Decisão S1 (2026-11-02):** `config.js` em `main` tem os três links do Stripe **vazios** (Subscribe desativado no site publicado). Os links de teste ficam em `config.local.js` (no `.gitignore`; modelo em `config.local.example.js`), que `config.js` só carrega quando o site é servido em `localhost`. O `setup-supabase.ps1` pede os ids e os segredos (Enter = não alterar; sem valores de teste por omissão, A6). Os ids de teste estão no vault ("Stripe — modo de teste").

### `scripts\stripe-teste.ps1` (uma vez, em modo de teste)

Pede a chave `sk_test_` sem eco (recusa `sk_live_`) e, pela API: (1) cria o Payment Link de regresso com o preço mensal Direct, `metadata[origem]=direto`, `metadata[tipo]=regresso`, redirecionamento para `bem-vindo.html` e sem códigos promocionais; se já existir um link com essa metadata, reutiliza-o; imprime o URL para `config.local.js → STRIPE_LINK_RETURN`; (2) acrescenta ao endpoint `we_1UX9VN…` os eventos `charge.dispute.created` e `charge.refunded` (A4), ficando com **8** eventos. Não cria produtos nem preços. Registar o `plink_` novo na nota do vault.

## a) Produto "ProvenDrop Direct" e o seu Payment Link: confirmar

**Catálogo de produtos** (Product catalog) → **ProvenDrop Direct**:
- Preço **15,00 € / mês**, recorrente (Recurring, Monthly). O **ID da API** (`price_1UX9Th…`) aparece ao lado do preço, com o ícone de copiar.
- Produto **Adesão ProvenDrop**: preço único **25,00 €** (`price_1UX9UO…`).

**Links de pagamento** (Payment Links) → abre o link `test_cNidRa…`:
- **Produtos**: ProvenDrop Direct 15,00 €/mês **+** Adesão ProvenDrop 25,00 € (o Stripe junta um preço único a uma subscrição: no 1.º pagamento cobra 40 €, depois 15 €/mês).
- **Opções**: recolhe o e-mail (sempre); códigos promocionais permitidos; sem telefone.
- **Metadados** (Metadata): `origem` = `direto`. (Se um dia o campo não aparecer no editor, o webhook reconhece na mesma pelo `price_` de `STRIPE_PRICE_DIRETO`.)
- **Depois do pagamento** (After the payment) → **Não mostrar a página de confirmação** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo.html`.
- O URL do link está em `config.local.js` → `STRIPE_LINK_DIRECT` (só para testes em `localhost`; em `config.js` fica vazio até ao modo real); o id `plink_…` fica em `STRIPE_PAYMENT_LINK_DIRETO`.

## b) Payment Link da Click: confirmar

**Links de pagamento** → link `test_9B64gA…`:
- **Produtos**: ProvenDrop via Click 15,00 €/mês + Adesão 25,00 €.
- **Opções**: e-mail e **telefone** (para a Click juntar ao grupo).
- **Metadados**: `origem` = `click`.
- **Depois do pagamento** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo-click.html` (a página só existe online depois do merge do PR #1; até lá o redirecionamento dá 404 — é esperado).

Quem paga por este link fica em `subscritores` com `origem = click` e o estado da subscrição (para a comissão), **sem login e sem acesso** à área (RLS).

## c) Portal de cliente: confirmar

**Definições** (engrenagem) → **Faturação** (Billing) → **Portal do cliente** (Customer portal):
- Link de entrada activo: `https://billing.stripe.com/p/login/test_cNidRa…` → `config.local.js` → `STRIPE_PORTAL_LINK` (vazio em `config.js` até ao modo real).
- Funcionalidades: **cancelar subscrição** (no fim do período), **actualizar método de pagamento**, **histórico de faturas**, actualizar e-mail e morada. Sem mudança de plano. Regressa a `app.html`.

O cliente entra no portal com o e-mail com que pagou; o Stripe envia-lhe um link de acesso. Cancelar no portal → `customer.subscription.updated` com `cancel_at_period_end = true` (continua `ativo` até ao fim do mês pago) e, no fim, `customer.subscription.deleted` → `cancelado`.

## d) Webhook: confirmar

**Programadores** (Developers) → **Webhooks** → endpoint `we_1UX9VN…`:
- **URL**: `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook`
- **Eventos** (8, depois do `stripe-teste.ps1`): `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.dispute.created`, `charge.refunded`.
- Formato: **Snapshot** (objectos completos; a função não lê eventos *thin*).
- Até a função ter deploy (`scripts/setup-supabase.ps1`), as entregas aparecem como falhadas em **Tentativas de entrega**; o Stripe volta a tentar durante 3 dias em modo real e algumas horas em teste. Depois do deploy, **Reenviar** (Resend) os eventos falhados, ou simplesmente fazer um pagamento de teste novo.

## e) Os dois segredos: copiar para o setup-supabase.ps1

1. **STRIPE_SECRET_KEY**: **Programadores** → **Chaves de API** (API keys) → **Chave secreta** (Secret key) → **Revelar chave de teste** → `sk_test_…`.
2. **STRIPE_WEBHOOK_SECRET**: **Programadores** → **Webhooks** → endpoint `we_1UX9VN…` → **Segredo de assinatura** (Signing secret) → **Revelar** → `whsec_…`.

Cola-os só quando o `scripts\setup-supabase.ps1` os pedir (sem eco). Se um deles for exposto: **Chaves de API → Reverter** (Roll key) e **Webhooks → ⋯ → Reverter segredo** (Roll secret), e correr o script outra vez.

## Onde fica cada valor

| Valor | `config.js` (público) | `supabase secrets` |
|---|---|---|
| URL do Payment Link Direct | `STRIPE_LINK_DIRECT` | — |
| URL do portal | `STRIPE_PORTAL_LINK` | — |
| `price_` Direct / Click | — | `STRIPE_PRICE_DIRETO` / `STRIPE_PRICE_CLICK` |
| `plink_` Direct | — | `STRIPE_PAYMENT_LINK_DIRETO` |
| `sk_test_` | **nunca** | `STRIPE_SECRET_KEY` |
| `whsec_` | **nunca** | `STRIPE_WEBHOOK_SECRET` |

## O que o webhook faz com cada evento (desde 2026-11-02, migração 0004)

O estado **nunca** é copiado do evento: em todos os casos a função relê a subscrição com `stripe.subscriptions.retrieve` e escreve o estado atual (C1/M2/M3/B1). Cada subscrição é uma linha em `public.subscricoes`; `public.subscritores.origem/estado` são derivados (a melhor subscrição direto manda; um evento click nunca retira acesso a uma direto — C2/S3).

| Evento | Efeito |
|---|---|
| `checkout.session.completed` (pago) | Sincroniza a subscrição da sessão. Origem: metadata do link → price_id → payment link. Alerta se o e-mail ficar com duas subscrições a cobrar. |
| `customer.subscription.created` / `updated` / `deleted` | Sincroniza: `ativo` (active/trialing), `em_atraso` (past_due/unpaid; guarda `em_atraso_desde`), `incompleto` (incomplete: sem login nem e-mail), `cancelado` (canceled/paused/incomplete_expired). `cancel_at_period_end` → `acesso_fim` (B4). |
| `invoice.paid` / `invoice.payment_failed` | Sincroniza a subscrição da fatura (relida no Stripe). |
| `charge.dispute.created` | Bloqueia o acesso de todos os subscritores desse cliente (`bloqueado_em`) e envia alerta com o prazo de resposta (A4). |
| `charge.refunded` | Só alerta (pode ser parcial ou de boa vontade); cancelar à mão no Stripe se for caso disso. |

Acesso (`public.tem_acesso`): origem direto, não bloqueado, `ativo` **ou** `em_atraso` há menos de **7 dias** (M1). Depois disso a área mostra "Payment overdue" e o e-mail diário deixa de sair; `invoice.paid` repõe tudo.

Boas-vindas (A3): só a quem tem acesso, com reserva atómica (`reservar_boas_vindas`), link por `token_hash` (não é consumido por scanners de e-mail), marcadas só depois de o Resend aceitar; um varrimento pg_cron de 15 em 15 min repete as que faltam até 5 tentativas e depois alerta. Quem regressa (cancelado → ativo) recebe "Welcome back".

Idempotência (A1/A2): `stripe_eventos` nunca é apagada; repetido já concluído → 200; repetido em curso há < 5 min → 503 (o Stripe volta a tentar); em curso há mais tempo → reprocessa. Sem `STRIPE_WEBHOOK_SECRET` a função devolve 500 a tudo; com assinatura inválida, 400. Logs e respostas não contêm e-mails nem erros internos (B5/S13).

Comissão da Click: `select * from public.subscricoes where origem = 'click'` (uma linha por subscrição, com estado e datas).

## Nome que aparece no Checkout

No teste de 2026-11-02 o Checkout mostrou **"Área restrita de ProvenDrop"** como nome da loja. É o nome do *Sandbox* (a área restrita de teste), não o da conta: o Checkout em modo de teste usa o nome da área restrita. Em modo real o Checkout, o portal de cliente, os recibos e as faturas mostram o **Nome público da empresa** de **Definições → Dados públicos** (Settings → Public details → *Public business name*). Antes de passar a modo real, confirmar aí que está `ProvenDrop` (e que o e-mail de apoio e o site estão preenchidos: aparecem no rodapé do Checkout e nos recibos). Na área restrita, se incomodar, o nome muda-se no selector de conta → ⋯ → *Mudar o nome*; não tem efeito no modo real.

## Modo real (só com aprovação explícita)

Com o interruptor **Modo de teste** desligado, repetir exactamente a estrutura de teste:

Pré-requisitos: `docs/TESTE.md` todo verde (§1, §2, §6), dados de teste apagados (§5), domínio verificado no Resend, "Allow new users to sign up" desligado, dados públicos preenchidos (nome `ProvenDrop`, e-mail de apoio, site), termos/reembolso/privacidade publicados.

1. **Catálogo de produtos → + Adicionar produto**: `ProvenDrop Direct` (15,00 € / mês, recorrente), `ProvenDrop via Click` (15,00 € / mês) e `Adesão ProvenDrop` (25,00 €, único). Anotar os três `price_…` reais.
2. **Links de pagamento → + Novo**: (a) Direct (Direct + Adesão; e-mail; metadados `origem=direto`; sem códigos promocionais ou só com cupões `once` limitados; depois do pagamento → `https://provendrop.com/bem-vindo.html`); (b) Direct **regresso** (só Direct mensal; `origem=direto`, `tipo=regresso`; → `bem-vindo.html`); (c) via Click (via Click + Adesão; e-mail + telefone; `origem=click`; sem códigos promocionais; → `bem-vindo-click.html`). Entregar o link via Click à Click. Em **Opções**, ponderar **Limitar a uma subscrição por cliente**.
3. **Definições → Faturação → Portal do cliente**: cancelar no fim do período, mudar cartão, faturas; **sem** edição de e-mail (M4); **Activar link**; copiar o link real.
4. **Programadores → Webhooks → + Adicionar destino/endpoint**: mesmo URL da função, os **8** eventos, formato Snapshot, versão da API **2024-12-18.acacia** (a que o código fixa — B6); revelar o novo `whsec_`. **Desativar** o endpoint de teste.
5. **Programadores → Chaves de API**: `sk_live_…`.
6. **Definições → Faturação → Subscrições e e-mails**: retentativas de cobrança e estado final (recomendado: cancelar após esgotarem); e-mails de pagamento falhado, cartão a expirar e recibos ligados.
7. `config.js`: `STRIPE_LINK_DIRECT`, `STRIPE_LINK_RETURN`, `STRIPE_PORTAL_LINK` reais; `CONTACT_EMAIL` preenchido; commit.
8. Correr `scripts\setup-supabase.ps1` com os valores reais: a chave `sk_live_` põe `STRIPE_ACCEPT_TEST=0`; o script recusa `sk_live_` com ids/links de teste ou `EMAIL_FROM` de teste e pede "SIM". `APP_URL` para o domínio final (DOMINIO.md).
9. Supabase Auth: SMTP, template e Redirect URLs com o domínio final (EMAIL.md §5, DOMINIO.md).
10. Guardar os ids reais numa nota do vault igual à de teste (sem chaves). Um pagamento real em cada link, com e-mail que não seja o da conta Resend; confirmar boas-vindas, acesso, portal, cancelamento e entrega dos eventos sem falhas.

Os clientes e subscrições de teste não passam para o modo real.
