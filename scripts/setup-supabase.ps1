<#
.SYNOPSIS
  Deploy da plataforma ProvenDrop Direto num comando (Windows PowerShell 5.1+).

.DESCRIPTION
  Depois de instalares o Supabase CLI e fazeres `supabase login`, este script:
    1. liga o repositório ao projecto (supabase link --project-ref maljrfgnnhtrjunnwlre);
    2. pede os segredos e os identificadores (sem eco nos segredos). Enter em
       qualquer campo = NÃO ALTERAR esse valor (A6): não há valores de teste por
       omissão. Gera um CRON_SECRET aleatório, lê HORA_ENVIO de config.js
       (DAILY_TIME) e define STRIPE_ACCEPT_TEST a partir do prefixo da chave.
       Os segredos vão num .env temporário só legível por ti (ACL), para
       `supabase secrets set --env-file`, e o ficheiro é apagado no fim (S8);
    3. recusa misturas de teste e real: chave sk_live_ com links/ids de teste em
       config.js ou nos valores escritos, e vice-versa (A6);
    4. faz deploy das funções stripe-webhook, email-diario e reconciliar (--no-verify-jwt);
    5. aplica as migrações 0002–0004 e actualiza public.config (email_diario_url,
       stripe_webhook_url, reconciliar_url, cron_secret) com `supabase db query --linked`.

  Nada é escrito em ficheiros do repositório.

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
# Executável nativo com stderr capturado e filtrado (em PowerShell 5.1 o stderr
# redirecionado vira ErrorRecord e, com Stop, abortaria o script).
function Supa([string[]]$argumentos, [string[]]$ignorar = @("Initialising login role")) {
  $eap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $saida = & supabase @argumentos 2>&1 | ForEach-Object { "$_" } | Where-Object { $l = $_; -not ($ignorar | Where-Object { $l -match $_ }) }
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $eap
  if ($saida) { $saida | ForEach-Object { Write-Host $_ } }
  return $codigo
}

# ── 0. pré-requisitos ────────────────────────────────────────────────────
Passo "Pré-requisitos"
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Falhar "Supabase CLI não encontrado. Instala com:  scoop install supabase   (ou winget install Supabase.CLI) e corre  supabase login"
}
Write-Host "Supabase CLI $((& supabase --version) 2>$null)"
if (-not (Test-Path "supabase\functions\stripe-webhook\index.ts")) { Falhar "corre este script a partir do repositório ProvenDrop (não encontro supabase\functions)" }

$cfg = Get-Content "config.js" -Raw
$horaEnvio = ""
if ($cfg -match 'DAILY_TIME:\s*"(\d{1,2})(?::(\d{2}))?"') { $horaEnvio = [int]$Matches[1] }
if ($horaEnvio -eq "") { Write-Host "AVISO: DAILY_TIME vazio em config.js; HORA_ENVIO não será definido (o e-mail diário não sai)." -ForegroundColor Yellow }
else { Write-Host "HORA_ENVIO = $horaEnvio (de config.js DAILY_TIME)" }
$configTeste = ($cfg -match 'buy\.stripe\.com/test_') -or ($cfg -match 'billing\.stripe\.com/p/login/test_')
$configLive  = ($cfg -match 'buy\.stripe\.com/(?!test_)[A-Za-z0-9]') -or ($cfg -match 'billing\.stripe\.com/p/login/(?!test_)[A-Za-z0-9]')
Write-Host ("config.js: links Stripe " + $(if ($configTeste -and -not $configLive) { "de TESTE" } elseif ($configLive -and -not $configTeste) { "REAIS" } elseif ($configTeste -and $configLive) { "MISTURADOS (teste e real)" } else { "vazios" }))
if ($configTeste -and $configLive) { Falhar "config.js mistura links de teste e reais: corrige antes de continuar" }

# ── 1. link ──────────────────────────────────────────────────────────────
Passo "supabase link --project-ref $ProjectRef"
if ((Supa @("link","--project-ref",$ProjectRef)) -ne 0) { Falhar "supabase link falhou. Fizeste 'supabase login'? Se pedir a palavra-passe da base de dados, está em Supabase → Project Settings → Database." }

# ── 2. segredos ──────────────────────────────────────────────────────────
function LerSegredo($nome, $ajuda) {
  Write-Host "  $nome  ($ajuda)" -ForegroundColor Gray
  $s = Read-Host "  $nome (Enter = não alterar)" -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function LerValor($nome, $ajuda) {
  Write-Host "  $nome  ($ajuda)" -ForegroundColor Gray
  $v = Read-Host "  $nome (Enter = não alterar)"
  if ([string]::IsNullOrWhiteSpace($v)) { return "" }
  return $v.Trim()
}

# Ids de TESTE conhecidos (vault: "Stripe — modo de teste"): servem só para detetar misturas.
$idsTeste = @("price_1UX9ThJMAlqVy4dKYnrmwGb3", "price_1UX9UYJMAlqVy4dK2FZi3k9w", "plink_1UX9UkJMAlqVy4dKAXTumtyZ", "plink_1UX9UxJMAlqVy4dKAbyhkQk7")

$cronSecret = ""
if (-not $SemSegredos) {
  Passo "Segredos (sem eco; Enter = não alterar; nunca gravados no repositório)"
  $valores = [ordered]@{}
  $valores["STRIPE_SECRET_KEY"]     = LerSegredo "STRIPE_SECRET_KEY"     "sk_test_… ou sk_live_… (Programadores → Chaves de API → Chave secreta)"
  $valores["STRIPE_WEBHOOK_SECRET"] = LerSegredo "STRIPE_WEBHOOK_SECRET" "whsec_… do endpoint deste modo (Programadores → Webhooks → Segredo de assinatura → Revelar)"
  $valores["RESEND_API_KEY"]        = LerSegredo "RESEND_API_KEY"        "re_… (Resend → API Keys)"
  Passo "Identificadores e remetente (Enter = não alterar)"
  $valores["STRIPE_PRICE_DIRETO"]        = LerValor "STRIPE_PRICE_DIRETO"        "price_… mensal ProvenDrop Direct deste modo"
  $valores["STRIPE_PRICE_CLICK"]         = LerValor "STRIPE_PRICE_CLICK"         "price_… mensal ProvenDrop via Click deste modo"
  $valores["STRIPE_PAYMENT_LINK_DIRETO"] = LerValor "STRIPE_PAYMENT_LINK_DIRETO" "plink_… do link Direct deste modo (opcional)"
  $valores["EMAIL_FROM"]                 = LerValor "EMAIL_FROM"                 'sem domínio verificado: ProvenDrop <onboarding@resend.dev>; com domínio: ProvenDrop <noreply@provendrop.com>'
  $valores["EMAIL_REPLY_TO"]             = LerValor "EMAIL_REPLY_TO"             "onde recebes as respostas dos clientes (opcional)"
  $valores["ALERT_EMAIL"]                = LerValor "ALERT_EMAIL"                "onde recebes os alertas (duplicados, disputas, reconciliação); vazio = EMAIL_REPLY_TO"

  # validações de formato
  if ($valores["STRIPE_SECRET_KEY"] -and $valores["STRIPE_SECRET_KEY"] -notmatch '^(sk|rk)_(test|live)_') { Falhar "STRIPE_SECRET_KEY não parece uma chave do Stripe (sk_test_/sk_live_)" }
  if ($valores["STRIPE_WEBHOOK_SECRET"] -and $valores["STRIPE_WEBHOOK_SECRET"] -notlike "whsec_*") { Falhar "STRIPE_WEBHOOK_SECRET tem de começar por whsec_" }
  foreach ($k in @("STRIPE_PRICE_DIRETO","STRIPE_PRICE_CLICK")) { if ($valores[$k] -and $valores[$k] -notlike "price_*") { Falhar "$k tem de começar por price_" } }
  if ($valores["STRIPE_PAYMENT_LINK_DIRETO"] -and $valores["STRIPE_PAYMENT_LINK_DIRETO"] -notlike "plink_*") { Falhar "STRIPE_PAYMENT_LINK_DIRETO tem de começar por plink_" }
  if ($valores["RESEND_API_KEY"] -and $valores["RESEND_API_KEY"] -notlike "re_*") { Falhar "RESEND_API_KEY tem de começar por re_" }
  foreach ($k in @("EMAIL_FROM","EMAIL_REPLY_TO","ALERT_EMAIL")) { if ($valores[$k] -and $valores[$k] -notmatch '@') { Falhar "$k não parece um endereço de e-mail" } }

  # A6: recusar misturas de teste e real
  $chave = $valores["STRIPE_SECRET_KEY"]
  if ($chave) {
    $live = $chave -match '_live_'
    $idsEscritos = @($valores["STRIPE_PRICE_DIRETO"], $valores["STRIPE_PRICE_CLICK"], $valores["STRIPE_PAYMENT_LINK_DIRETO"]) | Where-Object { $_ }
    $algumTeste = $idsEscritos | Where-Object { $idsTeste -contains $_ }
    if ($live) {
      if ($algumTeste) { Falhar "chave LIVE com identificadores de TESTE ($($algumTeste -join ', ')): no modo real os ids são outros (docs/STRIPE.md, Modo real)" }
      if ($configTeste) { Falhar "chave LIVE mas config.js tem links de TESTE: substitui STRIPE_LINK_DIRECT/STRIPE_PORTAL_LINK pelos reais primeiro" }
      if ($valores["EMAIL_FROM"] -match 'resend\.dev') { Falhar "chave LIVE com EMAIL_FROM de teste (resend.dev): os clientes não receberiam nada" }
      $ok = Read-Host "  ATENÇÃO: chave LIVE. Tens aprovação explícita para modo real? (escreve SIM)"
      if ($ok -ne "SIM") { Falhar "cancelado: usa sk_test_ até haver aprovação" }
      $valores["STRIPE_ACCEPT_TEST"] = "0"
    } else {
      if ($configLive) { Falhar "chave de TESTE mas config.js tem links REAIS: incoerente" }
      $valores["STRIPE_ACCEPT_TEST"] = "1"
    }
  }

  # CRON_SECRET aleatório (32 bytes → hex), partilhado com public.config.cron_secret
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $cronSecret = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  $valores["CRON_SECRET"] = $cronSecret
  $valores["APP_URL"] = "https://afonsolopes22.github.io/ProvenDrop/app.html"
  $valores["MAGIC_LINK_MINUTOS"] = "60"
  if ($horaEnvio -ne "") { $valores["HORA_ENVIO"] = "$horaEnvio" }

  $definir = $valores.Keys | Where-Object { $valores[$_] }
  Passo "supabase secrets set --env-file ($($definir -join ', '))"
  # S8: nunca na linha de comandos. Ficheiro temporário só legível por este utilizador, apagado no finally.
  $envTmp = Join-Path $env:TEMP ("provendrop-secrets-" + [guid]::NewGuid().ToString("N") + ".env")
  try {
    [IO.File]::WriteAllText($envTmp, "", (New-Object Text.UTF8Encoding $false))
    & icacls $envTmp /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    $linhas = foreach ($k in $definir) { "$k=$($valores[$k])" }
    [IO.File]::WriteAllText($envTmp, ($linhas -join "`n") + "`n", (New-Object Text.UTF8Encoding $false))
    if ((Supa @("secrets","set","--project-ref",$ProjectRef,"--env-file",$envTmp)) -ne 0) { Falhar "supabase secrets set falhou" }
  } finally {
    if (Test-Path $envTmp) { [IO.File]::WriteAllText($envTmp, ("0" * 4096)); Remove-Item $envTmp -Force }
    $valores = $null; $linhas = $null
  }
}

# ── 3. deploy das funções ───────────────────────────────────────────────
if (-not $SemDeploy) {
  Passo "Deploy das Edge Functions"
  foreach ($fn in @("stripe-webhook","email-diario","reconciliar")) {
    if ((Supa @("functions","deploy",$fn,"--project-ref",$ProjectRef,"--no-verify-jwt") @("Docker is not running")) -ne 0) { Falhar "deploy de $fn falhou" }
  }
}

# ── 4. SQL: migrações 0002–0004 + public.config ─────────────────────────
Passo "Migrações 0002, 0003, 0004 e public.config"
$base = "https://$ProjectRef.supabase.co/functions/v1"
$sql = ""
foreach ($m in @("0002_kits_datas.sql","0003_boas_vindas.sql","0004_subscricoes.sql")) { $sql += (Get-Content "supabase\migrations\$m" -Raw) + "`n" }
$sql += "update public.config set valor = '$base/email-diario'   where chave = 'email_diario_url';`n"
$sql += "update public.config set valor = '$base/stripe-webhook' where chave = 'stripe_webhook_url';`n"
$sql += "update public.config set valor = '$base/reconciliar'    where chave = 'reconciliar_url';`n"
if ($cronSecret) { $sql += "update public.config set valor = '$cronSecret' where chave = 'cron_secret';`n" }
$sql += "select chave, case when chave = 'cron_secret' then '(definido)' else valor end as valor from public.config order by chave;`n"

$tmp = Join-Path $env:TEMP ("provendrop-setup-" + [guid]::NewGuid().ToString("N") + ".sql")
try {
  [IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))
  & icacls $tmp /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  if ((Supa @("db","query","--linked","--file",$tmp)) -ne 0) {
    Write-Host "O CLI instalado não conseguiu correr 'supabase db query'. Cola o conteúdo deste ficheiro no SQL Editor do projecto e corre-o:" -ForegroundColor Yellow
    Write-Host "  $tmp"
    Write-Host "  (contém o cron_secret: não o partilhes; o ficheiro é apagado quando carregares Enter)"
    Read-Host "Enter depois de correr o SQL" | Out-Null
  }
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}

Passo "Concluído"
Write-Host "Falta (à mão): SMTP do Resend em Authentication → Emails (docs/EMAIL.md §5); 'Allow new users to sign up' desligado; confirmar config.js; depois o teste de docs/TESTE.md."
