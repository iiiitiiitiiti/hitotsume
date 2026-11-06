# ひとつめの係を、窓を出さずに起動する。-Restart を付けると動いている係を止めてから起動し直す。
param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$port = 47615
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$running = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($running) {
  if (-not $Restart) { exit 0 }
  $running | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node が見つかりません' }
Start-Process -FilePath $node -ArgumentList 'server.ts' -WorkingDirectory $here -WindowStyle Hidden
