$ErrorActionPreference = "Stop"

function Add-PathEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string] $PathEntry
  )

  if (-not [string]::IsNullOrWhiteSpace($PathEntry) -and (Test-Path -LiteralPath $PathEntry)) {
    $pathParts = $env:PATH -split [IO.Path]::PathSeparator
    if ($pathParts -notcontains $PathEntry) {
      $env:PATH = "$PathEntry$([IO.Path]::PathSeparator)$env:PATH"
    }
  }
}

function Resolve-ToolPath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,

    [Parameter(Mandatory = $true)]
    [string[]] $Candidates
  )

  foreach ($candidate in $Candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $existingCommand = Get-Command $Name -ErrorAction SilentlyContinue
  if ($existingCommand) {
    return $existingCommand.Source
  }

  return $null
}

$uvPath = Resolve-ToolPath "uv" @(
  (Join-Path $env:USERPROFILE "AppData\Local\Programs\Python\Python312\Scripts\uv.exe"),
  (Join-Path $env:USERPROFILE ".local\bin\uv.exe")
)

$nodePath = Resolve-ToolPath "node" @(
  (Join-Path $env:ProgramFiles "nodejs\node.exe")
)

$pnpmPath = Resolve-ToolPath "pnpm" @(
  (Join-Path $env:ProgramFiles "nodejs\pnpm.cmd"),
  (Join-Path $env:ProgramFiles "nodejs\pnpm")
)

if (-not $uvPath) {
  throw "uv was not found. Set ORYNVAE_UV or install uv."
}

if (-not $nodePath) {
  throw "node was not found. Set ORYNVAE_NODE or install Node.js."
}

if (-not $pnpmPath) {
  throw "pnpm was not found. Set ORYNVAE_PNPM or install pnpm."
}

$env:ORYNVAE_UV = if ($env:ORYNVAE_UV) { $env:ORYNVAE_UV } else { $uvPath }
$env:ORYNVAE_NODE = if ($env:ORYNVAE_NODE) { $env:ORYNVAE_NODE } else { $nodePath }
$env:ORYNVAE_PNPM = if ($env:ORYNVAE_PNPM) { $env:ORYNVAE_PNPM } else { $pnpmPath }

Add-PathEntry (Split-Path -Parent $env:ORYNVAE_UV)
Add-PathEntry (Split-Path -Parent $env:ORYNVAE_NODE)
Add-PathEntry (Split-Path -Parent $env:ORYNVAE_PNPM)
