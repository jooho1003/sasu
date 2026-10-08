# Acoustic loop probe: raw dshow capture of the real mic while the TTS probe plays on the default speakers.
param([Parameter(Mandatory)][string]$Dir)
$ff = 'C:\Users\이주호\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin\ffmpeg.exe'
$W = 'D:\바이브코딩\sasu\.vercel\real-device-20261005'
"session=$((Get-Process -Id $PID).SessionId)" | Set-Content -LiteralPath (Join-Path $Dir 'diag.txt') -Encoding utf8
$p = Start-Process -FilePath $ff -ArgumentList @('-y','-hide_banner','-f','dshow','-i','audio="마이크(fifine Microphone)"','-t','13','-ac','1','-ar','16000','-c:a','pcm_s16le',"`"$(Join-Path $Dir 'mic.wav')`"") -PassThru -NoNewWindow -RedirectStandardError (Join-Path $Dir 'ffmpeg.err')
Start-Sleep -Milliseconds 2500
$sp = New-Object System.Media.SoundPlayer (Join-Path $W 'tts-probe.wav'); $sp.Load()
$start = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); $sp.PlaySync(); $end = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
"play_start=$start play_end=$end" | Add-Content -LiteralPath (Join-Path $Dir 'diag.txt') -Encoding utf8
$p.WaitForExit(20000) | Out-Null
"ffmpeg_exit=$($p.ExitCode)" | Add-Content -LiteralPath (Join-Path $Dir 'diag.txt') -Encoding utf8
Set-Content -LiteralPath (Join-Path $Dir 'done.txt') -Value 'ok' -Encoding utf8
