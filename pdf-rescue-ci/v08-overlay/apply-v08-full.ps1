param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$projectRootPath = (Resolve-Path $ProjectRoot).Path
$workspaceRoot = Split-Path -Parent $projectRootPath
$partsRoot = Join-Path $workspaceRoot 'pdf-rescue-ci\v08-full-b64'
$parts = @(Get-ChildItem $partsRoot -File -Filter 'part-*' | Sort-Object Name)
if ($parts.Count -ne 7) {
    throw "Expected 7 sealed PDF Rescue 0.8 parts, found $($parts.Count)."
}

$base64 = ($parts | ForEach-Object { Get-Content $_.FullName -Raw }) -join ''
$zipPath = Join-Path $projectRootPath '.pdf-rescue-v08-full.zip'
[IO.File]::WriteAllBytes($zipPath, [Convert]::FromBase64String($base64))

$expected = '88dd586dddd0f2029dd278626721641aadc5c5f43cbbf12718104bdc4a4b7b1c'
$actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "PDF Rescue 0.8 sealed overlay SHA-256 mismatch: $actual"
}

Expand-Archive -Path $zipPath -DestinationPath $projectRootPath -Force
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

$v06Hotfix = Join-Path $workspaceRoot 'pdf-rescue-ci\v06-hotfix\LocalOcrService.cs'
if (Test-Path $v06Hotfix) {
    Copy-Item $v06Hotfix (Join-Path $projectRootPath 'src\PdfRescue.App\Services\LocalOcrService.cs') -Force
}

$v07Hotfix = Join-Path $workspaceRoot 'pdf-rescue-ci\v07-hotfix\PdfFinishingService.cs'
if (Test-Path $v07Hotfix) {
    Copy-Item $v07Hotfix (Join-Path $projectRootPath 'src\PdfRescue.App\Services\PdfFinishingService.cs') -Force
}

Write-Host "PASS: verified PDF Rescue 0.8 full overlay applied ($actual)."
