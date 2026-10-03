# =============================================================================
# Recover an ESP32-S3 stuck on "invalid header: 0xffffffff" after the
# multi-file esptool v5.2 + native USB-CDC bug. Writes each missing chunk as
# a SEPARATE single-file esptool invocation so the chip's USB endpoint never
# has to survive an inter-file gap.
#
# Usage:
#   .\recover-esp32s3.ps1 -Port COM9
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Port,
    [string]$Sketch = "WiFi Scan 5",
    [string]$Esp = "C:\Users\DFTUF01\AppData\Local\Arduino15\packages\esp32\tools\esptool_py\5.2.0\esptool.exe",
    [string]$BootApp0 = "C:\Users\DFTUF01\AppData\Local\Arduino15\packages\esp32\hardware\esp32\3.3.8\tools\partitions\boot_app0.bin"
)

# Find the build directory for the named sketch — arduino-cli hashes the path
# into the cache, so we just locate by the bin filename.
$base = "C:\Users\DFTUF01\AppData\Local\arduino\sketches"
$buildDir = (Get-ChildItem $base -Directory | Where-Object {
    Test-Path "$($_.FullName)\$Sketch.ino.bin"
} | Select-Object -First 1).FullName

if (-not $buildDir) {
    Write-Error "Couldn't find a build dir under $base with $Sketch.ino.bin"
    exit 1
}

Write-Host "Build dir: $buildDir"
Write-Host "Port:      $Port"
Write-Host ""

# Each step is a fresh esptool call. --before usb-reset enters download mode
# via the USB CDC control sequence (the only reliable way for native USB
# chips). --after no-reset leaves the chip in download mode so the next call
# can connect without another reset dance. The final call uses --after
# hard-reset to actually run the new firmware.
$steps = @(
    @{ Name = "bootloader"; Addr = "0x0";    File = "$buildDir\$Sketch.ino.bootloader.bin"; After = "no-reset" },
    @{ Name = "partitions"; Addr = "0x8000"; File = "$buildDir\$Sketch.ino.partitions.bin"; After = "no-reset" },
    @{ Name = "boot_app0";  Addr = "0xe000"; File = $BootApp0;                              After = "no-reset" },
    @{ Name = "app";        Addr = "0x10000";File = "$buildDir\$Sketch.ino.bin";            After = "hard-reset" }
)

foreach ($s in $steps) {
    Write-Host "==== Step: $($s.Name) @ $($s.Addr) ===="
    Write-Host "     File: $($s.File)"
    Write-Host ""
    # 460800 baud — 921600 was reliably killing the USB-CDC at ~16 KB into
    # any sustained write. 460800 cuts the byte rate in half and keeps the
    # chip's on-chip USB stack from starving.
    & $Esp --chip esp32s3 --port $Port --baud 460800 `
        --before usb-reset --after $s.After `
        write-flash --flash-mode keep --flash-freq keep --flash-size keep `
        $s.Addr $s.File
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Step '$($s.Name)' failed with exit code $LASTEXITCODE"
        Write-Host ""
        Write-Host "If the failure was 'Cannot configure port', hold the BOOT"
        Write-Host "button on the board and re-run this script."
        exit $LASTEXITCODE
    }
    Write-Host ""
}

Write-Host "==== All four chunks landed. Chip should boot the app on reset. ===="
