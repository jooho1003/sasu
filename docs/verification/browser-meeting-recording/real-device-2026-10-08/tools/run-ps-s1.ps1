# Runs a PowerShell script in the interactive session (session 1) via a one-shot scheduled task and waits for <Done>.
param([Parameter(Mandatory)][string]$TaskName, [Parameter(Mandatory)][string]$Script, [Parameter(Mandatory)][string]$Done, [Parameter(Mandatory)][int]$Minutes, [string]$ScriptArgs = '')
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$Script`" $ScriptArgs"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes ($Minutes + 2)) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
if (Test-Path -LiteralPath $Done) { Remove-Item -LiteralPath $Done -Force }
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
try {
  Start-ScheduledTask -TaskName $TaskName
  $deadline = (Get-Date).AddMinutes($Minutes + 1)
  while (-not (Test-Path -LiteralPath $Done) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
  if (Test-Path -LiteralPath $Done) { Get-Content -LiteralPath $Done } else { 'timeout_waiting_for_done' }
} finally { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
