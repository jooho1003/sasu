param([string]$Output = '.vercel/review-qa/tts-review.wav')
# All speech is invented, using the installed Korean Windows voice.
Add-Type -AssemblyName System.Speech
$target = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Output))
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Heami Desktop')
$synth.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile($target, $format)
$text = Get-Content -LiteralPath 'tests/fixtures/review-tts.txt' -Raw -Encoding UTF8
try { $synth.Speak($text) } finally { $synth.Dispose() }
Write-Output 'Synthetic Korean review WAV generated.'
