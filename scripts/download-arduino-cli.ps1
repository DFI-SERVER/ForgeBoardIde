# Downloads the arduino-cli binary into src-tauri/binaries/ at build time,
# plus the upstream LICENSE.txt next to it — GPL-3.0 §6 requires shipping the
# license alongside any redistributed binary. The license file is bundled by
# the installer (see src-tauri/tauri.conf.json `bundle.resources`).
# Run automatically via the package.json postinstall hook, or manually.
#
# Version pin: we ship 1.4.1, NOT "latest". arduino-cli 1.5.0 has an upload
# regression that kills the COM port mid-flash on at least one ESP32-S3
# revision via native USB-CDC on Windows (same chip uploads cleanly with
# 1.4.1 — verified 2026-05-25 against an S3 rev v0.2). The Arduino IDE 2.x
# also ships 1.4.1 at the time of writing; matching that buys us their
# field-tested behavior. Revisit this when an arduino-cli release notes that
# the regression is fixed.
$ErrorActionPreference = "Stop"

$ArduinoCliVersion = "1.4.1"
$url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ArduinoCliVersion}_Windows_64bit.zip"
$licenseUrl = "https://raw.githubusercontent.com/arduino/arduino-cli/master/LICENSE.txt"
$outDir = "src-tauri/binaries"
$outZip = Join-Path $outDir "arduino-cli.zip"
$outExe = Join-Path $outDir "arduino-cli-x86_64-pc-windows-msvc.exe"
$outLicense = Join-Path $outDir "arduino-cli-LICENSE.txt"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Version-aware skip: if a binary is present and reports the pinned version,
# don't re-download. If it reports something else (e.g. a stale 1.5.0 from a
# prior unpinned install), force a refresh so the pin actually takes effect.
if ((Test-Path $outExe) -and (Test-Path $outLicense)) {
    $installed = (& $outExe version 2>$null) -join " "
    if ($installed -match [Regex]::Escape($ArduinoCliVersion)) {
        Write-Host "arduino-cli ${ArduinoCliVersion} + LICENSE already present, skipping download."
        exit 0
    } else {
        Write-Host "arduino-cli at ${outExe} is not ${ArduinoCliVersion} (`"$installed`") — refreshing."
        Remove-Item $outExe -Force
    }
}

if (-not (Test-Path $outExe)) {
    Write-Host "Downloading arduino-cli ${ArduinoCliVersion} (Windows 64-bit)..."
    Invoke-WebRequest -Uri $url -OutFile $outZip
    Expand-Archive -Path $outZip -DestinationPath $outDir -Force
    Rename-Item (Join-Path $outDir "arduino-cli.exe") "arduino-cli-x86_64-pc-windows-msvc.exe" -Force
    Remove-Item $outZip
    Write-Host "arduino-cli ${ArduinoCliVersion} ready at $outExe"
}

if (-not (Test-Path $outLicense)) {
    Write-Host "Downloading arduino-cli LICENSE..."
    Invoke-WebRequest -Uri $licenseUrl -OutFile $outLicense
    Write-Host "arduino-cli LICENSE ready at $outLicense"
}
