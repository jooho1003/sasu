# Plays WAV files sequentially on the default output device and logs epoch-ms start/end per file.
param([Parameter(Mandatory)][string]$Log, [Parameter(Mandatory)][string]$Files)
$enc = [Text.UTF8Encoding]::new($false)
foreach ($f in ($Files -split ',')) {
  $p = New-Object System.Media.SoundPlayer $f
  $p.Load()
  $start = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $p.PlaySync()
  $end = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $name = [IO.Path]::GetFileName($f)
  [IO.File]::AppendAllText($Log, ('{"file":"' + $name + '","start":' + $start + ',"end":' + $end + '}' + "`n"), $enc)
  $p.Dispose()
}
