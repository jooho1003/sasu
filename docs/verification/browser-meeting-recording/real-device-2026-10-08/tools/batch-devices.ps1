# Sequential real-device batch (session 0 caller): each scenario runs in the interactive session via run-s1.ps1.
param([string[]]$Only = @())
$W = 'D:\바이브코딩\sasu\.vercel\real-device-20261005'
$runs = @(
  @{ name = 'v03-unplug';         args = @("$W\v03.mjs", 'unplug', 'chrome');         minutes = 12; pnp = $true },
  @{ name = 'v05-refresh';        args = @("$W\v05.mjs", 'refresh', 'chrome');        minutes = 20 },
  @{ name = 'v05-kill';           args = @("$W\v05.mjs", 'kill', 'chrome');           minutes = 20 },
  @{ name = 'v06-quota-precheck'; args = @("$W\v06.mjs", 'quota-precheck', 'chrome'); minutes = 10 },
  @{ name = 'v06-quota-mid';      args = @("$W\v06.mjs", 'quota-mid', 'chrome');      minutes = 15 },
  @{ name = 'v06-idb-clear';      args = @("$W\v06.mjs", 'idb-clear', 'chrome');      minutes = 15 },
  @{ name = 'v06-two-tabs';       args = @("$W\v06.mjs", 'two-tabs', 'chrome');       minutes = 15 },
  @{ name = 'v06-freeze';         args = @("$W\v06.mjs", 'freeze', 'chrome');         minutes = 15 }
)
foreach ($r in $runs) {
  if ($Only.Count -and -not ($Only -contains $r.name)) { continue }
  $log = "$W\batch-$($r.name).log"
  $watcher = $null
  if ($r.pnp) {
    Get-ChildItem "$W\pnp-control" -File | Where-Object { $_.Name -ne 'pnp.jsonl' } | Remove-Item -Force
    $watcher = Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',"$W\pnp-watcher.ps1",'-Dir',"$W\pnp-control",'-MaxMinutes','12') -PassThru -WindowStyle Hidden
  }
  $started = Get-Date -Format o
  $result = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$W\run-s1.ps1" -TaskName "sasu-$($r.name)" -LogPath $log -Minutes $r.minutes @($r.args)
  if ($watcher) { Set-Content "$W\pnp-control\done.txt" '1'; $watcher.WaitForExit(15000) | Out-Null }
  "{0} {1} started={2} result={3}" -f (Get-Date -Format o), $r.name, $started, ($result -join ' ') | Add-Content "$W\batch-summary.log" -Encoding utf8
}
