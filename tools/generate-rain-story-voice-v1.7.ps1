$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$rain17Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/rain-story'))
$rain17Line = Get-Content -LiteralPath (Join-Path $rain17Root 'voice-revision-v1.7.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rain17Synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $rain17Synth.SelectVoice($rain17Line.voice)
  $rain17Synth.Rate = -1
  $rain17Format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $rain17Synth.SetOutputToWaveFile((Join-Path $rain17Root $rain17Line.file), $rain17Format)
  $rain17Synth.Speak($rain17Line.text)
  $rain17Synth.SetOutputToNull()
  Write-Output 'Generated revised synthetic voice: voice-04-v1.7.wav (old file preserved)'
} finally { $rain17Synth.Dispose() }
