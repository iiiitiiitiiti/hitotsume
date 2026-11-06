# 起動中の Outlook（クラシック版）から1日分の予定を読み、JSON で出す。
# -Date yyyy-MM-dd でその日を読む（省略すると今日）。
# Outlook が閉じていれば起動させずに {"error":"not_running"} を出す。
param([string]$Date = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
} catch {
  '{"error":"not_running"}'
  exit 0
}

try {
  $ns = $ol.GetNamespace('MAPI')
  $items = $ns.GetDefaultFolder(9).Items   # 9 = 予定表
  $items.IncludeRecurrences = $true
  $items.Sort('[Start]')
  if ($Date) {
    $today = [datetime]::ParseExact($Date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  } else {
    $today = (Get-Date).Date
  }
  $fmt = 'yyyy/MM/dd HH:mm'
  # その日にかかる予定（前日から続くものも含む）
  $filter = "[Start] < '" + $today.AddDays(1).ToString($fmt) + "' AND [End] > '" + $today.ToString($fmt) + "'"
  $found = $items.Restrict($filter)
  $list = @()
  foreach ($a in $found) {
    $list += [pscustomobject]@{
      subject  = [string]$a.Subject
      start    = $a.Start.ToString('o')
      end      = $a.End.ToString('o')
      allDay   = [bool]$a.AllDayEvent
      location = [string]$a.Location
    }
    if ($list.Count -ge 50) { break }
  }
  ConvertTo-Json -InputObject @($list) -Compress -Depth 3
} catch {
  '{"error":"read_failed"}'
}
