# ProvenDrop

Site estático (GitHub Pages): `index.html` (página principal, lê `data.json`), `bem-vindo.html` (página depois do pagamento) e `data.json` (lista do dia, gerada pela rotina de research).

## Pagamentos (Stripe Payment Link)
1. Stripe → **Catálogo de produtos** → novo produto "ProvenDrop": preço **recorrente 15 €/mês**.
2. Novo produto "Adesão ProvenDrop": preço **único 25 €**.
3. Stripe → **Payment Links** → novo link com os dois produtos (a subscrição + a adesão única no 1.º pagamento).
   - Recolher: e-mail e **número de telefone** (para juntar ao grupo do WhatsApp); opcional: campo personalizado "Nicho".
   - **Após o pagamento** → "Não mostrar página de confirmação" → redirecionar para `https://<domínio>/bem-vindo.html`.
4. Cola o link em `index.html`, na linha `window.PROVENDROP_STRIPE_LINK = "";`.
5. Stripe → Definições → **Portal de cliente**: ativa "cancelar subscrição" e copia o link para `bem-vindo.html` (`window.PROVENDROP_PORTAL_LINK`).
6. Stripe → Definições → Notificações: e-mail a cada pagamento novo (para dar acesso ao grupo à mão, no início).

Enquanto os links estiverem vazios, os botões abrem o WhatsApp da Click.

## Publicar
Settings → Pages → Deploy from branch → `main` / root. Domínio próprio: Settings → Pages → Custom domain.
