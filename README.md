# ProvenDrop

Site estático (GitHub Pages): `index.html` (página principal) e `bem-vindo.html` (página depois do pagamento **Direct**).

**Este repo e o site são públicos: não colocar aqui `data.json`, coleções, lojas nem links de ZIP.** As coleções só são entregues a quem subscreve, pelo canal de cada adesão.

## Posicionamento

"Discover. Validate. Create. Launch." — três componentes: (1) Product Research & Market Validation, (2) AI-Powered Creative Production, (3) Advertising Campaign Preparation. Cada coleção aprovada é apresentada como um **Launch Kit** (20 prompts de imagem, 4 prompts de vídeo UGC, referências visuais, keywords, negativas, Shopping titles, landing copy, análise).

## Duas adesões, dois produtos Stripe

| | ProvenDrop via Click | ProvenDrop Direct |
|---|---|---|
| Para quem | Clientes que aderem através da Click Dynamics | Clientes que aderem de forma independente |
| Produto Stripe | Produto da parceria Click | Produto Direct (Payment Link) |
| Entrega | Canal WhatsApp gerido pela Click (bot + comunidade) | Diretamente pelo ProvenDrop; plataforma privada quando existir |
| Página pós-pagamento | A que a Click/produto da parceria definir | `bem-vindo.html` |
| Variável em `index.html` | `window.PROVENDROP_CLICK_STRIPE_LINK` | `window.PROVENDROP_DIRECT_STRIPE_LINK` |

Ambas usam o mesmo research; nenhuma coleção é exclusiva de um canal. **Enquanto uma variável estiver vazia, o botão dessa opção fica desativado** com a nota "not open on this page yet". Nunca colar URLs inventados ou de teste.

### Configurar o produto Direct
1. Stripe → **Catálogo de produtos** → produto "ProvenDrop Direct": preço recorrente (mensal) + adesão única, se aplicável.
2. Stripe → **Payment Links** → novo link com esse produto. Recolher e-mail (e, opcionalmente, campo "Nicho").
3. **Após o pagamento** → "Não mostrar página de confirmação" → redirecionar para `https://<domínio>/bem-vindo.html`.
4. Colar o link em `index.html` em `window.PROVENDROP_DIRECT_STRIPE_LINK = "";`.
5. Stripe → Definições → **Portal de cliente**: ativar "cancelar subscrição" e copiar o link para `bem-vindo.html` (`window.PROVENDROP_PORTAL_LINK`).
6. Opcional: e-mail público de contacto para membros Direct em `window.PROVENDROP_CONTACT_EMAIL` (em `index.html` e `bem-vindo.html`). Vazio = botão/linha de contacto escondidos.
7. Stripe → Definições → Notificações: e-mail a cada pagamento novo (o onboarding Direct é feito à mão por e-mail, no início).

### Configurar o produto Click
Colar o link do produto Stripe da parceria em `window.PROVENDROP_CLICK_STRIPE_LINK = "";`. O pós-pagamento desse produto é o que estiver acordado com a Click (não é `bem-vindo.html`).

### Preço
O único preço publicado até agora é **15 €/mês + 25 € de adesão única**, repetido nos dois cartões de adesão. Se os produtos Click e Direct tiverem preços diferentes, editar o cartão correspondente em `index.html` (comentários `<!-- Price: ... -->`).

## Indicador de CTR observado

A secção Launch Kit tem um bloco `#ctrBox` escondido. Só aparece quando **os quatro campos** de `window.PROVENDROP_CTR` estiverem preenchidos a partir de dados de campanhas documentados:

```js
window.PROVENDROP_CTR = { value: "14", campaigns: "N", period: "Mmm–Mmm AAAA", format: "Search" };
```

À data de 2026-11-01 **não existe** no repo nem no vault nenhum registo de campanhas (número, período, formato, cálculo) que sustente o valor ~14 %; o indicador fica desligado até existir. O texto legal "Observed campaign results. Performance is not guaranteed and depends on multiple campaign factors." já está no bloco.

## Publicar
Settings → Pages → Deploy from branch → `main` / root. Domínio próprio: Settings → Pages → Custom domain.
