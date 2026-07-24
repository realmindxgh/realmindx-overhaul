$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$siteRoot = Join-Path $repoRoot "realmindx-site"
$python = Join-Path $siteRoot ".venv\Scripts\python.exe"
$logs = Join-Path $repoRoot "logs"

if (-not (Test-Path $python)) {
  throw "Python virtualenv not found at $python"
}

New-Item -ItemType Directory -Path $logs -Force | Out-Null

$env:DATABASE_URL = "sqlite:///$siteRoot/realmindx_local.db"

$arguments = @(
  "-m", "flask",
  "--app", "backend:create_app",
  "run",
  "--host", "127.0.0.1",
  "--port", "5000"
)

Start-Process `
  -FilePath $python `
  -ArgumentList $arguments `
  -WorkingDirectory $siteRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logs "api.stdout.log") `
  -RedirectStandardError (Join-Path $logs "api.stderr.log")

Write-Host "Flask API starting hidden on http://127.0.0.1:5000"
