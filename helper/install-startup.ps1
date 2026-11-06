# PC にサインインしたとき係が動くよう、スタートアップにショートカットを置く。-Remove で外す。
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'hitotsume-helper.lnk'

if ($Remove) {
  if (Test-Path $link) { Remove-Item $link }
  'removed'
  exit 0
}

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
# conhost --headless で、PowerShell の窓を一瞬も出さない
$s.TargetPath = Join-Path $env:WINDIR 'System32\conhost.exe'
$s.Arguments = '--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $here 'start.ps1') + '"'
$s.WorkingDirectory = $here
$s.Description = 'ひとつめの係'
$s.Save()
$link
