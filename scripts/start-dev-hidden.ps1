$ErrorActionPreference = "Stop"

$scriptRoot = $PSScriptRoot

& (Join-Path $scriptRoot "start-api-hidden.ps1")
& (Join-Path $scriptRoot "start-frontend-hidden.ps1")

Write-Host "API and frontend were launched with hidden windows."
