$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Runtime = Join-Path $Root "resources\runtime\win"
$Source = Join-Path $env:TEMP "meeting-notes-whisper.cpp"

Remove-Item $Runtime -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $Source -Recurse -Force -ErrorAction SilentlyContinue
New-Item (Join-Path $Runtime "bin") -ItemType Directory -Force | Out-Null
New-Item (Join-Path $Runtime "models") -ItemType Directory -Force | Out-Null

git clone --depth 1 --branch v1.9.2 https://github.com/ggml-org/whisper.cpp.git $Source
cmake -S $Source -B (Join-Path $Source "build") -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DGGML_NATIVE=OFF -DBUILD_SHARED_LIBS=OFF
cmake --build (Join-Path $Source "build") --config Release --target whisper-cli

$BuildBin = Join-Path $Source "build\bin\Release"
Copy-Item (Join-Path $BuildBin "whisper-cli.exe") (Join-Path $Runtime "bin")
Get-ChildItem $BuildBin -Filter "*.dll" | Copy-Item -Destination (Join-Path $Runtime "bin")

$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
Invoke-WebRequest $ModelUrl -OutFile (Join-Path $Runtime "models\ggml-base.en.bin")
$DiarizationModelUrl = "https://huggingface.co/akashmjn/tinydiarize-whisper.cpp/resolve/main/ggml-small.en-tdrz.bin"
Invoke-WebRequest $DiarizationModelUrl -OutFile (Join-Path $Runtime "models\ggml-small.en-tdrz.bin")
Write-Host "Prepared Windows runtime: $Runtime"
