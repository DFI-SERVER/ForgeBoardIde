#!/usr/bin/env node
// Downloads the pinned arduino-cli for the platform this machine builds for,
// into src-tauri/binaries/, named the way Tauri's `bundle.externalBin`
// expects: arduino-cli-<rust target triple>[.exe]. Also fetches the upstream
// LICENSE.txt — GPL-3.0 §6 requires shipping it next to the binary (it is
// listed in tauri.conf.json `bundle.resources`).
//
// Runs automatically from the package.json postinstall hook, or by hand:
//   node scripts/download-arduino-cli.mjs              # host platform only
//   node scripts/download-arduino-cli.mjs --universal  # macOS: also produce the
//                                                      # arm64+x86_64 universal
//                                                      # sidecar for
//                                                      # `tauri build --target universal-apple-darwin`
//   ARDUINO_CLI_SKIP=1 pnpm install                    # skip (CI / tests only)
//
// Version pin: 1.4.1, NOT "latest". arduino-cli 1.5.0 has an upload regression
// that kills the COM port mid-flash on at least one ESP32-S3 revision via
// native USB-CDC on Windows (1.4.1 uploads cleanly — verified 2026-05-25).
// Arduino IDE 2.x ships 1.4.1 too; matching it buys their field-tested
// behaviour. Revisit when a release notes the regression is fixed.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.4.1";
const LICENSE_URL = "https://raw.githubusercontent.com/arduino/arduino-cli/master/LICENSE.txt";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "src-tauri", "binaries");

// Rust target triple -> arduino-cli release asset suffix.
const TARGETS = {
  "x86_64-pc-windows-msvc": "Windows_64bit.zip",
  "aarch64-apple-darwin": "macOS_ARM64.tar.gz",
  "x86_64-apple-darwin": "macOS_64bit.tar.gz",
  "x86_64-unknown-linux-gnu": "Linux_64bit.tar.gz",
  "aarch64-unknown-linux-gnu": "Linux_ARM64.tar.gz",
};

function hostTriple() {
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const os_ = { win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu" }[process.platform];
  if (!arch || !os_) throw new Error(`unsupported host ${process.platform}/${process.arch}`);
  return `${arch}-${os_}`;
}

const exeSuffix = (triple) => (triple.includes("windows") ? ".exe" : "");
const binaryPath = (triple) => path.join(OUT_DIR, `arduino-cli-${triple}${exeSuffix(triple)}`);

function reportsPinnedVersion(file) {
  try {
    const out = execFileSync(file, ["version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out.includes(VERSION);
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function ensureBinary(triple) {
  const dest = binaryPath(triple);
  const asset = TARGETS[triple];
  if (!asset) throw new Error(`no arduino-cli build known for ${triple}`);

  // Only the host's own binary can be version-checked by running it.
  if (fs.existsSync(dest)) {
    if (triple !== hostTriple() || reportsPinnedVersion(dest)) {
      console.log(`arduino-cli ${VERSION} for ${triple} already present, skipping.`);
      return dest;
    }
    console.log(`${dest} is not ${VERSION} — refreshing.`);
    fs.rmSync(dest, { force: true });
  }

  const url = `https://downloads.arduino.cc/arduino-cli/arduino-cli_${VERSION}_${asset}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arduino-cli-"));
  const archive = path.join(tmp, asset);
  console.log(`Downloading arduino-cli ${VERSION} (${triple})...`);
  await download(url, archive);
  // `tar` handles .tar.gz everywhere and .zip on Windows 10+ (bsdtar).
  execFileSync("tar", ["-xf", archive, "-C", tmp], { stdio: "inherit" });
  const extracted = path.join(tmp, `arduino-cli${exeSuffix(triple)}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync(extracted, dest);
  if (!triple.includes("windows")) fs.chmodSync(dest, 0o755);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`arduino-cli ${VERSION} ready at ${dest}`);
  return dest;
}

async function ensureLicense() {
  const dest = path.join(OUT_DIR, "arduino-cli-LICENSE.txt");
  if (fs.existsSync(dest)) return;
  console.log("Downloading arduino-cli LICENSE...");
  await download(LICENSE_URL, dest);
  console.log(`arduino-cli LICENSE ready at ${dest}`);
}

async function main() {
  if (process.env.ARDUINO_CLI_SKIP) {
    console.log("ARDUINO_CLI_SKIP set — not downloading arduino-cli.");
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await ensureLicense();
  await ensureBinary(hostTriple());

  if (process.argv.includes("--universal")) {
    if (process.platform !== "darwin") throw new Error("--universal is macOS only");
    const arm = await ensureBinary("aarch64-apple-darwin");
    const x64 = await ensureBinary("x86_64-apple-darwin");
    const uni = binaryPath("universal-apple-darwin");
    execFileSync("lipo", ["-create", "-output", uni, arm, x64], { stdio: "inherit" });
    fs.chmodSync(uni, 0o755);
    console.log(`universal arduino-cli ready at ${uni}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
