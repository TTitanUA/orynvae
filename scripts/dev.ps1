$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$toolEnv = Join-Path $scriptRoot "tool-env.ps1"

Push-Location $repoRoot
try {
  . $toolEnv
  & $env:ORYNVAE_NODE scripts/dev.mjs
}
finally {
  Pop-Location
}
