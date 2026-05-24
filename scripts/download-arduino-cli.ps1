# Downloads the arduino-cli binary into src-tauri/binaries/ at build time,
# plus the upstream LICENSE.txt next to it — GPL-3.0 §6 requires shipping the
# license alongside any redistributed binary. The license file is bundled by
# the installer (see src-tauri/tauri.conf.json `bundle.resources`).
# Run automatically via the package.json postinstall hook, or manually.
$ErrorActionPreference = "Stop"

$url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
$licenseUrl = "https://raw.githubusercontent.com/arduino/arduino-cli/master/LICENSE.txt"
$outDir = "src-tauri/binaries"
$outZip = Join-Path $outDir "arduino-cli.zip"
$outExe = Join-Path $outDir "arduino-cli-x86_64-pc-windows-msvc.exe"
$outLicense = Join-Path $outDir "arduino-cli-LICENSE.txt"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if ((Test-Path $outExe) -and (Test-Path $outLicense)) {
    Write-Host "arduino-cli + LICENSE already present, skipping download."
    exit 0
}

if (-not (Test-Path $outExe)) {
    Write-Host "Downloading arduino-cli (latest, Windows 64-bit)..."
    Invoke-WebRequest -Uri $url -OutFile $outZip
    Expand-Archive -Path $outZip -DestinationPath $outDir -Force
    Rename-Item (Join-Path $outDir "arduino-cli.exe") "arduino-cli-x86_64-pc-windows-msvc.exe" -Force
    Remove-Item $outZip
    Write-Host "arduino-cli ready at $outExe"
}

if (-not (Test-Path $outLicense)) {
    Write-Host "Downloading arduino-cli LICENSE..."
    Invoke-WebRequest -Uri $licenseUrl -OutFile $outLicense
    Write-Host "arduino-cli LICENSE ready at $outLicense"
}
