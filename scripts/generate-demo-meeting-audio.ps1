# The spoken sentences match the immutable example transcript in DemoReviewSimulator.
Add-Type -AssemblyName System.Speech
$speech = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $speech.SelectVoice('Microsoft Heami Desktop')
  $format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono
  )
  $output = Join-Path $PSScriptRoot '../public/demo-files/onsaemiro-sales-weekly-meeting.wav'
  $speech.SetOutputToWaveFile($output, $format)
  @(
    '외주사 B가 기존 계약보다 12% 오른 견적을 보냈습니다.',
    '영업 원칙에는 연 10% 이상 인상 시 자동 연장하지 않고 재입찰을 검토한다고 적혀 있습니다.',
    '오늘 17시까지 대체 업체 두 곳의 일정과 비용을 비교해 결정 카드에 올리겠습니다.',
    '이 파일의 인물과 회사는 모두 사수 데모를 위한 합성 정보입니다.'
  ) | ForEach-Object { $speech.Speak($_) }
} finally {
  $speech.Dispose()
}
