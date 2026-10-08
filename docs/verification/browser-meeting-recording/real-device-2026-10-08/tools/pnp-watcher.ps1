# Session-0 (elevated) helper: disables/enables the fifine USB mic on request files written by the session-1 harness.
# Always re-enables the device on exit or after a safety timeout.
param([Parameter(Mandatory)][string]$Dir, [int]$MaxMinutes = 12, [int]$AutoEnableSeconds = 180)
# 2026-10-08: the USB interface (USB\VID_3142&PID_0673&MI_00\...) refused Disable-PnpDevice ("일반 오류"); the capture endpoint can be disabled.
$id = 'SWD\MMDEVAPI\{0.0.1.00000000}.{C724D7B2-3F83-44A7-81A2-197C5024F8E0}'
$log = Join-Path $Dir 'pnp.jsonl'
function Note($event, $extra) {
  $o = [ordered]@{ t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); event = $event; status = (Get-PnpDevice -InstanceId $id).Status }
  if ($extra) { $o.detail = $extra }
  Add-Content -LiteralPath $log -Value ($o | ConvertTo-Json -Compress) -Encoding utf8
}
$deadline = (Get-Date).AddMinutes($MaxMinutes)
$disabledAt = $null
Note 'watcher_start' $null
try {
  while ((Get-Date) -lt $deadline -and -not (Test-Path (Join-Path $Dir 'done.txt'))) {
    if ((Test-Path (Join-Path $Dir 'request-disable')) -and -not (Test-Path (Join-Path $Dir 'disabled'))) {
      try { Disable-PnpDevice -InstanceId $id -Confirm:$false -ErrorAction Stop; Note 'disabled' $null } catch { Note 'disable_failed' $_.Exception.Message }
      Set-Content -LiteralPath (Join-Path $Dir 'disabled') -Value ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      $disabledAt = Get-Date
    }
    if ((Test-Path (Join-Path $Dir 'request-enable')) -and -not (Test-Path (Join-Path $Dir 'enabled'))) {
      try { Enable-PnpDevice -InstanceId $id -Confirm:$false -ErrorAction Stop; Note 'enabled' $null } catch { Note 'enable_failed' $_.Exception.Message }
      Set-Content -LiteralPath (Join-Path $Dir 'enabled') -Value ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
      $disabledAt = $null
    }
    if ($disabledAt -and ((Get-Date) - $disabledAt).TotalSeconds -gt $AutoEnableSeconds) {
      Enable-PnpDevice -InstanceId $id -Confirm:$false; Note 'auto_enabled_timeout' $null; $disabledAt = $null
      Set-Content -LiteralPath (Join-Path $Dir 'enabled') -Value ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    }
    Start-Sleep -Milliseconds 300
  }
} finally {
  if ((Get-PnpDevice -InstanceId $id).Status -ne 'OK') { Enable-PnpDevice -InstanceId $id -Confirm:$false; Note 'final_enable' $null }
  Note 'watcher_exit' $null
}
