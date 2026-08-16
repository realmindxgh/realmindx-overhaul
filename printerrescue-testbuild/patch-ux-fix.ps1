$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot 'TestApp.cs'
$src = Get-Content $path -Raw
$old = 'Panel.SetZIndex(emptyState,2)'
$new = 'System.Windows.Controls.Panel.SetZIndex(emptyState,2)'
if (!$src.Contains($old)) { throw 'Could not find empty-state z-index call.' }
$src = $src.Replace($old,$new)
Set-Content $path $src -Encoding UTF8
Write-Host 'UX compile fix applied.'
