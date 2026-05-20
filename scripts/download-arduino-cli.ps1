# Downloads the arduino-cli binary into src-tauri/binaries/ at build time.
# Run automatically via the package.json postinstall hook, or manually.
$ErrorActionPreference = "Stop"

$url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
$outDir = "src-tauri/binaries"
$outZip = Join-Path $outDir "arduino-cli.zip"
$outExe = Join-Path $outDir "arduino-cli-x86_64-pc-windows-msvc.exe"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (Test-Path $outExe) {
    Write-Host "arduino-cli already present, skipping download."
    exit 0
}

Write-Host "Downloading arduino-cli (latest, Windows 64-bit)..."
Invoke-WebRequest -Uri $url -OutFile $outZip
Expand-Archive -Path $outZip -DestinationPath $outDir -Force
Rename-Item (Join-Path $outDir "arduino-cli.exe") "arduino-cli-x86_64-pc-windows-msvc.exe" -Force
Remove-Item $outZip
Write-Host "arduino-cli ready at $outExe"
