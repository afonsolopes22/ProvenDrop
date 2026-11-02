<#
.SYNOPSIS
  Deploy da plataforma ProvenDrop Direto num comando (Windows PowerShell 5.1+).

.DESCRIPTION
  Depois de instalares o Supabase CLI e fazeres `supabase login`, este script:
    1. liga o repositório ao projecto (supabase link --project-ref maljrfgnnhtrjunnwlre);
    2. pede os segredos (sem eco), gera um CRON_SECRET aleatório, lê HORA_ENVIO de
       config.js (DAILY_TIME) e corre `supabase secrets set` sem gravar nada em disco;
    3. faz deploy das funções stripe-webhook (--no-verify-jwt) e email-diario;
    4. aplica as migrações 0002 e 0003 e actualiza public.config (email_diario_url, cron_secret)
       com `supabase db query`; se o CLI instalado não tiver esse comando, deixa um
       ficheiro SQL temporário para colares no SQL Editor e apaga-o no fim.

  Nada é escrito em ficheiros do repositório. Os valores que deixares em branco não
  são alterados (podes voltar a correr só para mudar um segredo).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-supabase.ps1
#>
[CmdletBinding()]
param(
  [string]$ProjectRef = "maljrfgnnhtrjunnwlre",
  [switch]$SemDeploy,      # só segredos e SQL
  [switch]$SemSegredos     # só deploy e SQL
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Falhar($m) { Write-Host "ERRO: $m" -ForegroundColor Red; exit 1 }
function Passo($m) { Write-Host "`n== $m" -ForegroundColor Cyan }

# ── 0. pré-requisitos ────────────────────────────────────────────────────
Passo "Pré-requisitos"
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Falhar "Supabase CLI não encontrado. Instala com:  scoop install supabase   (ou winget install Supabase.CLI) e corre  supabase login"
}
$versao = (& supabase --version) 2>$null
Write-Host "Supabase CLI $versao"
if (-not (Test-Path "supabase\functions\stripe-webhook\index.ts")) { Falhar "corre este script a partir do repositório ProvenDrop (não encontro supabase\functions)" }

# HORA_ENVIO vem de config.js (DAILY_TIME "HH:MM") para ficar sempre igual ao site.
$cfg = Get-Content "config.js" -Raw
$horaEnvio = ""
if ($cfg -match 'DAILY_TIME:\s*"(\d{1,2})(?::(\d{2}))?"') { $horaEnvio = [int]$Matches[1] }
if ($horaEnvio -eq "") { Write-Host "AVISO: DAILY_TIME vazio em config.js; HORA_ENVIO não será definido (o e-mail diário não sai)." -ForegroundColor Yellow }
else { Write-Host "HORA_ENVIO = $horaEnvio (de config.js DAILY_TIME)" }

# ── 1. link ──────────────────────────────────────────────────────────────
Passo "supabase link --project-ref $ProjectRef"
& supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Falhar "supabase link falhou. Fizeste 'supabase login'? Se pedir a palavra-passe da base de dados, está em Supabase → Project Settings → Database." }

# ── 2. segredos ──────────────────────────────────────────────────────────
function LerSegredo($nome, $ajuda) {
  Write-Host "  $nome  ($ajuda)" -ForegroundColor Gray
  $s = Read-Host "  $nome (Enter = não alterar)" -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
# Identificadores públicos (não secretos): mostram-se, e Enter aceita o valor proposto.
function LerValor($nome, $proposto, $ajuda) {
  Write-Host "  $nome  ($ajuda)" -ForegroundColor Gray
  $v = Read-Host "  $nome [$proposto]"
  if ([string]::IsNullOrWhiteSpace($v)) { return $proposto }
  return $v.Trim()
}

# Valores de TESTE já criados no Stripe (vault: "Stripe — modo de teste (IDs e links).md").
# No modo real substituem-se pelos ids reais (docs/STRIPE.md, "Modo real").
$STRIPE_PRICE_DIRETO_TESTE       = "price_1UX9ThJMAlqVy4dKYnrmwGb3"
$STRIPE_PRICE_CLICK_TESTE        = "price_1UX9UYJMAlqVy4dK2FZi3k9w"
$STRIPE_PAYMENT_LINK_DIRETO_TESTE = "plink_1UX9UkJMAlqVy4dKAXTumtyZ"
$EMAIL_FROM_PROPOSTO             = "ProvenDrop <noreply@provendrop.com>"

$cronSecret = ""
if (-not $SemSegredos) {
  Passo "Segredos (escritos sem eco; nunca gravados em disco)"
  $valores = [ordered]@{}
  $valores["STRIPE_SECRET_KEY"]      = LerSegredo "STRIPE_SECRET_KEY"      "sk_test_… (Programadores → Chaves de API → Chave secreta)"
  $valores["STRIPE_WEBHOOK_SECRET"]  = LerSegredo "STRIPE_WEBHOOK_SECRET"  "whsec_… (Programadores → Webhooks → we_1UX9VN… → Segredo de assinatura → Revelar)"
  $valores["RESEND_API_KEY"]         = LerSegredo "RESEND_API_KEY"         "re_… (Resend → API Keys)"
  Passo "Identificadores públicos (Enter = aceitar o valor de teste proposto)"
  $valores["STRIPE_PRICE_DIRETO"]        = LerValor "STRIPE_PRICE_DIRETO"        $STRIPE_PRICE_DIRETO_TESTE        "price_… mensal ProvenDrop Direct"
  $valores["STRIPE_PRICE_CLICK"]         = LerValor "STRIPE_PRICE_CLICK"         $STRIPE_PRICE_CLICK_TESTE         "price_… mensal ProvenDrop via Click"
  $valores["STRIPE_PAYMENT_LINK_DIRETO"] = LerValor "STRIPE_PAYMENT_LINK_DIRETO" $STRIPE_PAYMENT_LINK_DIRETO_TESTE "plink_… do link Direct"
  $valores["EMAIL_FROM"]                 = LerValor "EMAIL_FROM"                 $EMAIL_FROM_PROPOSTO              "remetente do domínio verificado no Resend; sem domínio: onboarding@resend.dev"
  $valores["EMAIL_REPLY_TO"]             = LerValor "EMAIL_REPLY_TO"             ""                                "opcional: onde recebes as respostas"

  foreach ($k in @("STRIPE_SECRET_KEY")) { if ($valores[$k] -and $valores[$k] -notlike "sk_*") { Falhar "$k não parece uma secret key do Stripe (sk_…)" } }
  if ($valores["STRIPE_SECRET_KEY"] -like "sk_live_*") {
    $ok = Read-Host "  ATENÇÃO: chave LIVE. Tens aprovação explícita para modo real? (escreve SIM)"
    if ($ok -ne "SIM") { Falhar "cancelado: usa sk_test_ até haver aprovação" }
  }
  if ($valores["STRIPE_WEBHOOK_SECRET"] -and $valores["STRIPE_WEBHOOK_SECRET"] -notlike "whsec_*") { Falhar "STRIPE_WEBHOOK_SECRET tem de começar por whsec_" }
  foreach ($k in @("STRIPE_PRICE_DIRETO","STRIPE_PRICE_CLICK")) { if ($valores[$k] -and $valores[$k] -notlike "price_*") { Falhar "$k tem de começar por price_" } }
  if ($valores["STRIPE_PAYMENT_LINK_DIRETO"] -and $valores["STRIPE_PAYMENT_LINK_DIRETO"] -notlike "plink_*") { Falhar "STRIPE_PAYMENT_LINK_DIRETO tem de começar por plink_" }
  if ($valores["STRIPE_SECRET_KEY"] -like "sk_live_*" -and $valores["STRIPE_PRICE_DIRETO"] -eq $STRIPE_PRICE_DIRETO_TESTE) { Falhar "chave live com price_ de teste: no modo real os ids são outros (docs/STRIPE.md)" }
  if ($valores["RESEND_API_KEY"] -and $valores["RESEND_API_KEY"] -notlike "re_*") { Falhar "RESEND_API_KEY tem de começar por re_" }

  # CRON_SECRET aleatório (32 bytes → hex), partilhado com public.config.cron_secret
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $cronSecret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  $valores["CRON_SECRET"] = $cronSecret
  $valores["APP_URL"] = "https://afonsolopes22.github.io/ProvenDrop/app.html"
  $valores["MAGIC_LINK_MINUTOS"] = "60"
  if ($horaEnvio -ne "") { $valores["HORA_ENVIO"] = "$horaEnvio" }

  $args = @("secrets","set","--project-ref",$ProjectRef)
  foreach ($k in $valores.Keys) { if ($valores[$k]) { $args += "$k=$($valores[$k])" } }
  Passo "supabase secrets set ($(($valores.Keys | Where-Object { $valores[$_] }) -join ', '))"
  & supabase @args
  if ($LASTEXITCODE -ne 0) { Falhar "supabase secrets set falhou" }
  $valores = $null
}

# ── 3. deploy das funções ───────────────────────────────────────────────
if (-not $SemDeploy) {
  Passo "Deploy das Edge Functions"
  & supabase functions deploy stripe-webhook --project-ref $ProjectRef --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { Falhar "deploy de stripe-webhook falhou" }
  & supabase functions deploy email-diario --project-ref $ProjectRef --no-verify-jwt
  if ($LASTEXITCODE -ne 0) { Falhar "deploy de email-diario falhou" }
}

# ── 4. SQL: migrações 0002 e 0003 + public.config ──────────────────────
Passo "Migrações 0002 e 0003 e public.config"
$urlFn = "https://$ProjectRef.supabase.co/functions/v1/email-diario"
$sql = (Get-Content "supabase\migrations\0002_kits_datas.sql" -Raw) + "`n"
$sql += (Get-Content "supabase\migrations\0003_boas_vindas.sql" -Raw) + "`n"
$sql += "update public.config set valor = '$urlFn' where chave = 'email_diario_url';`n"
if ($cronSecret) { $sql += "update public.config set valor = '$cronSecret' where chave = 'cron_secret';`n" }
$sql += "select chave, case when chave = 'cron_secret' then '(definido)' else valor end as valor from public.config;`n"

$tmp = Join-Path $env:TEMP ("provendrop-setup-" + [guid]::NewGuid().ToString("N") + ".sql")
[IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))
try {
  $ok = $false
  & supabase db query --linked --file $tmp 2>$null
  if ($LASTEXITCODE -eq 0) { $ok = $true }
  if (-not $ok) {
    Write-Host "O CLI instalado não tem 'supabase db query'. Cola o conteúdo deste ficheiro no SQL Editor do projecto e corre-o:" -ForegroundColor Yellow
    Write-Host "  $tmp"
    Write-Host "  (contém o cron_secret: não o partilhes; o ficheiro é apagado quando carregares Enter)"
    Read-Host "Enter depois de correr o SQL" | Out-Null
  }
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}

Passo "Concluído"
Write-Host "Falta (à mão): SMTP do Resend em Authentication → Emails (docs/EMAIL.md §5); confirmar config.js; depois o teste de docs/TESTE.md."
