# Stripe: produtos, Payment Links, portal e webhook (modo de teste)

Tudo o que está aqui faz-se **em modo de teste** até haver aprovação explícita para passar a real. Os nomes dos menus são os do Dashboard do Stripe em novembro de 2026 (idioma inglês); se o teu Dashboard estiver em português, os rótulos são a tradução directa. Onde o rótulo pode variar com a versão do Dashboard está assinalado.

Resultado final (o que fica onde):

| Valor | Onde se cola | Secreto? |
|---|---|---|
| URL do Payment Link Direct (`https://buy.stripe.com/…`) | `config.js` → `STRIPE_LINK_DIRECT` | não |
| Link de login do portal de cliente (`https://billing.stripe.com/p/login/…`) | `config.js` → `STRIPE_PORTAL_LINK` | não |
| `price_…` do preço mensal Direct | segredo `STRIPE_PRICE_DIRETO` (setup-supabase.ps1) | não é secreto, mas vive nos segredos |
| `price_…` do preço mensal do produto da Click | segredo `STRIPE_PRICE_CLICK` | idem |
| `plink_…` do Payment Link Direct (opcional) | segredo `STRIPE_PAYMENT_LINK_DIRETO` | idem |
| Secret key `sk_test_…` | segredo `STRIPE_SECRET_KEY` | **sim** |
| Signing secret `whsec_…` do webhook | segredo `STRIPE_WEBHOOK_SECRET` | **sim** |

Nunca colar chaves `sk_` nem `whsec_` em `config.js`, no README, em commits ou em mensagens.

## 0. Entrar em modo de teste

No canto superior direito do Dashboard, activa **Test mode** (interruptor laranja). Em contas mais recentes o modo de teste chama-se **Sandbox**: escolhe-o no selector de conta, em cima à esquerda. Confirma que a faixa "Test mode"/"Sandbox" está visível antes de criar seja o que for. As chaves de teste começam por `sk_test_` e `pk_test_`; os links de teste contêm `/test_`.

## a) Produto "ProvenDrop Direct" e o seu Payment Link

### Produto e preços

1. Menu lateral → **Product catalog** → botão **+ Add product** (nalgumas versões **Create product**).
2. **Name**: `ProvenDrop Direct`. Descrição (opcional): `Daily validated collections and Launch Kits`.
3. Secção de preço (**Pricing**):
   - **Recurring**, montante `15,00`, moeda **EUR**, **Billing period: Monthly**. Guarda.
4. No produto criado, **+ Add another price**: **One-off**, `25,00` EUR. Descrição do preço: `Joining fee`. Guarda.
   (Se preferires, a adesão pode ser um segundo produto "ProvenDrop joining fee" com preço único de 25 €; o resultado no link é o mesmo.)
5. Abre o preço mensal e copia o **API ID** que começa por `price_…` → é o valor de `STRIPE_PRICE_DIRETO`. Fica à vista na página do produto, ao lado de cada preço (ícone de copiar).

### Payment Link

1. Menu lateral → **Payment Links** → **+ New** (ou **Create payment link**).
2. **Select product**: escolhe `ProvenDrop Direct`, preço **15,00 €/month**. Clica em **Add another product** e junta o preço único **25,00 €** (Joining fee). O Stripe permite juntar um preço único a uma subscrição: no primeiro pagamento cobra 40 €, depois 15 €/mês.
3. Painel de opções (**Options**, à direita):
   - **Collect customer addresses**: *Billing addresses only* (opcional). O e-mail é sempre recolhido pelo Checkout, não precisa de opção.
   - **Require customers to provide a phone number**: desligado.
   - Opcional: **Add custom fields** → **Dropdown** com rótulo `Niche` e as opções `Women's jewellery`, `Home decoration`, `Women's fashion`, `Men's fashion`. (Aparece no pagamento no Dashboard; não é lido pelo webhook.)
   - Se o editor mostrar **Metadata** (normalmente em **Advanced options**): chave `origem`, valor `direto`. **Se o campo não existir no editor, não faz mal**: o webhook reconhece a origem pelo `price_…` (`STRIPE_PRICE_DIRETO`).
4. Separador **After the payment**:
   - Em **Confirmation page**, escolhe a opção de **redirecionar para o teu site** em vez da página de confirmação do Stripe (o rótulo é "Don't show confirmation page" / "Redirect customers to your website", conforme a versão).
   - URL: `https://afonsolopes22.github.io/ProvenDrop/bem-vindo.html`
5. **Create link**. Copia o URL `https://buy.stripe.com/test_…` → `config.js` → `STRIPE_LINK_DIRECT`.
6. Na página do link, o **ID** `plink_…` aparece nos detalhes (ou no URL do Dashboard). Opcional: guarda-o para `STRIPE_PAYMENT_LINK_DIRETO`.

Enquanto o link estiver em modo de teste, o botão **Subscribe** do site abre o Checkout de teste: só serve para o teste da secção 6 de `docs/TESTE.md`. Antes de publicar para clientes reais, substitui-se pelo link real (aprovação explícita).

## b) O Payment Link actual da Click

O link que a Click envia aos clientes dela **não muda de produto nem de preço**. Só precisa de dois ajustes para o webhook o reconhecer e para o cliente não cair na página errada:

1. **Payment Links** → abre o link da Click → menu **⋯** → **Edit**.
2. Se existir **Metadata**: `origem` = `click`. Se não existir, copia o `price_…` do preço mensal do produto desse link (Product catalog → produto → API ID) → `STRIPE_PRICE_CLICK`. Um dos dois chega; os dois é melhor.
3. **After the payment** → redirecionar para `https://afonsolopes22.github.io/ProvenDrop/bem-vindo-click.html` (e **não** para `bem-vindo.html`).
4. Guarda.

Os clientes da Click ficam registados em `subscritores` com `origem = click` e `estado`, para efeitos de comissão, mas **sem login e sem acesso** à área pessoal (RLS). Se o produto da Click vive noutra conta Stripe, o webhook desta conta nunca o vê: nesse caso a Click fica fora do registo e não há nada a configurar aqui.

## c) Portal de cliente (cancelar, mudar de cartão)

1. **Settings** (engrenagem) → **Billing** → **Customer portal** (URL directo: `dashboard.stripe.com/settings/billing/portal`).
2. Em **Ways to get started**, clica em **Activate link**. Aparece o link `https://billing.stripe.com/p/login/test_…` → copia para `config.js` → `STRIPE_PORTAL_LINK`.
3. Nas opções do portal, confirma:
   - **Cancel subscriptions**: ligado (cancelar no fim do período é o mais simples).
   - **Update payment methods**: ligado.
   - **Invoice history**: ligado.
   - **Update subscriptions** (mudar de plano): desligado.
4. Guarda. O cliente entra no portal com o e-mail com que pagou; o Stripe envia-lhe um link de acesso.

## d) Webhook (endpoint, eventos, signing secret)

1. Menu lateral → **Developers** → **Webhooks** (abre o separador Webhooks do **Workbench**; URL directo `dashboard.stripe.com/test/webhooks` em modo de teste).
2. **Create an event destination** (nalgumas contas ainda **+ Add endpoint**).
3. **Your account** → formato de payload **Snapshot** (a função usa os objectos completos; **não** escolher *Thin*). Versão da API: a predefinida da conta.
4. Em **Select events**, marca exactamente estes seis:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. **Continue** → tipo de destino **Webhook endpoint** → **Continue**.
6. **Endpoint URL**: `https://maljrfgnnhtrjunnwlre.supabase.co/functions/v1/stripe-webhook`. Descrição: `ProvenDrop Supabase`. **Create destination**.
7. Na página do endpoint, em **Signing secret**, clica em **Reveal** (ou **Click to reveal**) e copia o valor `whsec_…` → é `STRIPE_WEBHOOK_SECRET`, pedido pelo `scripts/setup-supabase.ps1`. Não o guardes em mais lado nenhum.

O endpoint só responde a POST com assinatura válida; sem `STRIPE_WEBHOOK_SECRET` configurado devolve 500 a tudo. Cada `evt_…` é processado uma vez (tabela `stripe_eventos`); se a função falhar, liberta o id e o Stripe volta a tentar.

## e) Secret key

**Developers** → **API keys** → em **Standard keys**, **Secret key** → **Reveal test key** → `sk_test_…` → é `STRIPE_SECRET_KEY` (pedido pelo setup-supabase.ps1). A **Publishable key** não é usada.

## O que o webhook faz com cada evento

| Evento | Efeito em `public.subscritores` |
|---|---|
| `checkout.session.completed` (pago) | Cria/actualiza a linha pelo e-mail. Origem: metadata → price_id → payment link. **Direto**: cria o utilizador de Auth, gera o magic link e envia o e-mail de boas-vindas (uma única vez). **Click**: só regista. |
| `customer.subscription.created` | Se a linha ainda não existe (evento chegou primeiro), cria-a com o e-mail do cliente Stripe; senão só alinha o estado. |
| `customer.subscription.updated` | `estado` = ativo / em_atraso / cancelado conforme `status`. |
| `customer.subscription.deleted` | `estado = cancelado` → a área mostra "Subscription cancelled" e as consultas devolvem 0 linhas (RLS). |
| `invoice.paid` | Quem estava `em_atraso` volta a `ativo`. |
| `invoice.payment_failed` | `ativo` → `em_atraso` (a área pede para actualizar o cartão). |

## Passar a modo real (só com aprovação)

Repetir a), c), d) e e) com **Test mode desligado**: produtos e preços reais, novo Payment Link real, novo link do portal, novo endpoint de webhook com novo `whsec_`, chave `sk_live_`. Voltar a correr `scripts/setup-supabase.ps1` com os valores reais e substituir `STRIPE_LINK_DIRECT` e `STRIPE_PORTAL_LINK` em `config.js`. Os dados de teste (clientes `cus_…` de teste) não passam para o modo real.
