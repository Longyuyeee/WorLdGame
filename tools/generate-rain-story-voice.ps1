$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$rainVoiceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/rain-story'))
$rainVoiceLines = Get-Content -LiteralPath (Join-Path $rainVoiceRoot 'voice-lines.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rainVoiceSynth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $rainVoiceSynth.Rate = -1
  $rainVoiceFormat = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  foreach ($rainVoiceLine in $rainVoiceLines) {
    $rainVoiceSynth.SelectVoice($rainVoiceLine.voice)
    $rainVoiceSynth.SetOutputToWaveFile((Join-Path $rainVoiceRoot $rainVoiceLine.file), $rainVoiceFormat)
    $rainVoiceSynth.Speak($rainVoiceLine.text)
    $rainVoiceSynth.SetOutputToNull()
    Write-Output ('Generated synthetic voice: ' + $rainVoiceLine.speaker + ' / ' + $rainVoiceLine.file)
  }
} finally { $rainVoiceSynth.Dispose() }
