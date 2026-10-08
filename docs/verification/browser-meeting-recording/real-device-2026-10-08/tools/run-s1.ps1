# One-shot interactive (session 1) scheduled task runner for real-device checks.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File run-s1.ps1 <taskName> <logPath> <minutes> <node args...>
param(
  [Parameter(Mandatory)][string]$TaskName,
  [Parameter(Mandatory)][string]$LogPath,
  [Parameter(Mandatory)][int]$Minutes,
  [Parameter(ValueFromRemainingArguments)][string[]]$NodeArgs
)
$runner = 'D:\바이브코딩\sasu\.vercel\real-device-20261005\run-node.ps1'
$quoted = ($NodeArgs | ForEach-Object { '"' + $_ + '"' }) -join ' '
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" `"$LogPath`" $quoted"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes ($Minutes + 2)) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if (Test-Path -LiteralPath "$LogPath.done") { Remove-Item -LiteralPath "$LogPath.done" -Force }
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
try {
  Start-ScheduledTask -TaskName $TaskName
  $deadline = (Get-Date).AddMinutes($Minutes + 1)
  while (-not (Test-Path -LiteralPath "$LogPath.done") -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3 }
  if (Test-Path -LiteralPath "$LogPath.done") { Get-Content -LiteralPath "$LogPath.done" } else { 'timeout_waiting_for_done' }
} finally {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
