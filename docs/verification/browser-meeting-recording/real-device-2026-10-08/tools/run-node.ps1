param(
  [Parameter(Mandatory)][string]$LogPath,
  [Parameter(ValueFromRemainingArguments)][string[]]$NodeArgs
)
Set-Location 'D:\바이브코딩\sasu'
"session=$((Get-Process -Id $PID).SessionId) start=$(Get-Date -Format o)" | Set-Content -LiteralPath "$LogPath.diag" -Encoding utf8
& 'C:\Program Files\nodejs\node.exe' @NodeArgs *> $LogPath
Set-Content -LiteralPath "$LogPath.done" -Value "exit=$LASTEXITCODE end=$(Get-Date -Format o)" -Encoding utf8
