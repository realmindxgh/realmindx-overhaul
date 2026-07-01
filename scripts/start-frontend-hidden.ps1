$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$npm = "C:\Program Files\nodejs\npm.cmd"
$logs = Join-Path $repoRoot "logs"

if (-not (Test-Path $npm)) {
  $npm = "npm.cmd"
}

New-Item -ItemType Directory -Path $logs -Force | Out-Null

Start-Process `
  -FilePath $npm `
  -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "vite.stdout.log") `
  -RedirectStandardError (Join-Path $logs "vite.stderr.log")

Write-Host "Vite dev server starting hidden. Check logs/vite.stdout.log for the URL."
