<#
.SYNOPSIS
  Ajustes no Stripe em MODO DE TESTE pela API (o Claude Code não tem a chave):
    1. cria o Payment Link Direct "regresso" (só a mensalidade, sem adesão; metadata
       origem=direto; redireciona para bem-vindo.html) e imprime o URL para
       config.local.js → STRIPE_LINK_RETURN (S1: em config.js só os links reais);
    2. acrescenta ao endpoint de webhook os eventos charge.dispute.created e
       charge.refunded (A4), mantendo os seis já existentes.
  Pede a chave sk_test_ sem eco; recusa sk_live_. Não cria produtos nem preços.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\stripe-teste.ps1
#>
[CmdletBinding()]
param(
  [string]$PriceDireto = "price_1UX9ThJMAlqVy4dKYnrmwGb3",   # ProvenDrop Direct, 15 €/mês (teste)
  [string]$Webhook     = "we_1UX9VNJMAlqVy4dKeelqzvJL",       # endpoint de teste
  [string]$Redirect    = "https://provendrop.com/bem-vindo.html"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$s = Read-Host "STRIPE_SECRET_KEY de TESTE (sk_test_…, sem eco)" -AsSecureString
$b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
try { $chave = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
if ($chave -notlike "sk_test_*") { Write-Host "ERRO: este script só trabalha com chaves de teste (sk_test_)." -ForegroundColor Red; exit 1 }
$auth = @{ Authorization = "Bearer $chave" }

function Stripe($metodo, $caminho, $corpo) {
  $r = Invoke-RestMethod -Method $metodo -Uri "https://api.stripe.com/v1/$caminho" -Headers $auth -Body $corpo -ContentType "application/x-www-form-urlencoded"
  return $r
}

Write-Host "`n== 1. Payment Link de regresso (só mensalidade)" -ForegroundColor Cyan
$existentes = Stripe GET "payment_links?active=true&limit=100" $null
$ja = $existentes.data | Where-Object { $_.metadata.origem -eq "direto" -and $_.metadata.tipo -eq "regresso" } | Select-Object -First 1
if ($ja) {
  Write-Host "Já existe: $($ja.id)"
  $link = $ja
} else {
  $corpo = @{
    "line_items[0][price]"               = $PriceDireto
    "line_items[0][quantity]"            = "1"
    "metadata[origem]"                   = "direto"
    "metadata[tipo]"                     = "regresso"
    "subscription_data[metadata][origem]" = "direto"
    "subscription_data[metadata][tipo]"  = "regresso"
    "after_completion[type]"             = "redirect"
    "after_completion[redirect][url]"    = $Redirect
    "allow_promotion_codes"              = "false"
  }
  $link = Stripe POST "payment_links" $corpo
  Write-Host "Criado: $($link.id)"
}
Write-Host "URL (colar em config.local.js → STRIPE_LINK_RETURN; nunca em config.js, S1):" -ForegroundColor Green
Write-Host "  $($link.url)"

Write-Host "`n== 2. Eventos do webhook $Webhook" -ForegroundColor Cyan
$we = Stripe GET "webhook_endpoints/$Webhook" $null
$atuais = @($we.enabled_events)
$precisos = @("checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed","charge.dispute.created","charge.refunded")
$faltam = $precisos | Where-Object { $atuais -notcontains $_ }
if (-not $faltam) { Write-Host "Já tem os 8 eventos." }
else {
  $todos = ($atuais + $faltam) | Select-Object -Unique
  $corpo = @{}
  for ($i = 0; $i -lt $todos.Count; $i++) { $corpo["enabled_events[$i]"] = $todos[$i] }
  $we = Stripe POST "webhook_endpoints/$Webhook" $corpo
  Write-Host "Acrescentados: $($faltam -join ', ')"
}
Write-Host "Eventos agora: $($we.enabled_events -join ', ')"
Write-Host "URL: $($we.url)   API: $($we.api_version)"
$chave = $null; $auth = $null
Write-Host "`nFeito. Próximo passo: colar o URL em config.local.js e registar o plink_ na nota do vault." -ForegroundColor Green
