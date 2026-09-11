param(
  [Parameter(Mandatory = $true)][string]$Manifest,
  [Parameter(Mandatory = $true)][string]$Output
)

Add-Type -AssemblyName System.Speech

$segments = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$tempDirectory = Join-Path $env:SystemDrive ("sasu-audio-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDirectory -Force | Out-Null
$paddedFiles = @()

try {
  for ($index = 0; $index -lt $segments.Count; $index += 1) {
    $segment = $segments[$index]
    $rawPath = Join-Path $tempDirectory ("raw-{0:D3}.wav" -f $index)
    $paddedPath = Join-Path $tempDirectory ("padded-{0:D3}.wav" -f $index)
    $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synthesizer.SelectVoice([string]$segment.voice)
    $synthesizer.Rate = [int]$segment.rate
    $synthesizer.Volume = [int]$segment.volume
    $synthesizer.SetOutputToWaveFile($rawPath)
    $synthesizer.Speak([string]$segment.text)
    $synthesizer.Dispose()

    & ffmpeg -y -v error -i $rawPath -af "apad,atrim=duration=12" -ar 16000 -ac 1 -c:a pcm_s16le $paddedPath
    if ($LASTEXITCODE -ne 0) {
      throw "ffmpeg segment padding failed at index $index"
    }
    $paddedFiles += $paddedPath
  }

  $concatPath = Join-Path $tempDirectory "concat.txt"
  $concatLines = $paddedFiles | ForEach-Object { "file '$($_)'" }
  [System.IO.File]::WriteAllLines($concatPath, $concatLines, [System.Text.Encoding]::ASCII)

  & ffmpeg -y -v error -f concat -safe 0 -i $concatPath -c:a libmp3lame -b:a 64k -ar 16000 -ac 1 $Output
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg final audio encoding failed"
  }
}
finally {
  Remove-Item -LiteralPath $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
