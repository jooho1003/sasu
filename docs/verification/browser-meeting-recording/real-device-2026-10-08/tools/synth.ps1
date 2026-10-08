# Synthesizes [{id,text}] (UTF-8 JSON) with Microsoft Heami Desktop into one 16 kHz mono PCM16 WAV.
# Bookmarks give each sentence's audio start/end in the output (timeline JSON).
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out, [Parameter(Mandatory)][string]$Timeline,
  [int]$GapMs = 600, [int]$LeadMs = 300, [int]$Rate = 0)
Add-Type -AssemblyName System.Speech
$items = [IO.File]::ReadAllText($In, [Text.Encoding]::UTF8) | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft Heami Desktop')
$s.Rate = $Rate
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($Out, $fmt)
$marks = New-Object System.Collections.ArrayList
Register-ObjectEvent -InputObject $s -EventName BookmarkReached -SourceIdentifier rdmark | Out-Null
$pb = New-Object System.Speech.Synthesis.PromptBuilder ([Globalization.CultureInfo]::GetCultureInfo('ko-KR'))
$pb.AppendBreak([TimeSpan]::FromMilliseconds($LeadMs))
foreach ($item in $items) {
  $pb.AppendBookmark("$($item.id)|start")
  $pb.AppendText($item.text)
  $pb.AppendBookmark("$($item.id)|end")
  $pb.AppendBreak([TimeSpan]::FromMilliseconds($GapMs))
}
$s.Speak($pb)
Start-Sleep -Milliseconds 200
foreach ($e in (Get-Event -SourceIdentifier rdmark)) {
  [void]$marks.Add([pscustomobject]@{ mark = $e.SourceEventArgs.Bookmark; ms = $e.SourceEventArgs.AudioPosition.TotalMilliseconds })
}
Unregister-Event -SourceIdentifier rdmark
$s.Dispose()
$json = $marks | ConvertTo-Json -Compress
[IO.File]::WriteAllText($Timeline, $json, [Text.UTF8Encoding]::new($false))
"marks=$($marks.Count) bytes=$((Get-Item $Out).Length)"

