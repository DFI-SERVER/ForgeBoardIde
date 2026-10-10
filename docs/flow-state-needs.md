# Flow State — inputs needed from Defence Forge (kept current by the dev team)

Status against "Flow State — Requirement Document" (9 Oct 2026), and what is
still needed from the company to finish each item.

| # | Requirement | Built | Needs from you |
|---|---|---|---|
| 1 | Simplified UI, red Check Code / Upload, no Search in the sidebar | Yes | — |
| 2 | Automatic board + port detection, board name in toolbar | Yes (Spark / Flint / Indus by chip) | — |
| 3 | Pin diagram of the detected board | Scaffolded (Get Board Info shows it when the file exists) | `public/boards/spark-pinout.svg`, `flint-pinout.svg`, `indus-pinout.svg` |
| 4 | Datasheet link per board | Yes, placeholder URLs | Confirm the real URLs: forgeboard.in/spark, /flint, /indus |
| 5 | Check → Debug → Solution (code / connection / system, numbered steps per OS) | Yes, 17 cases | Send any raw error students still see; each becomes a rule |
| 6 | System requirement check with per-OS fix steps | Yes (Setup check) | First live run on Windows and Linux |
| 7 | Real progress (stage + %) for Check and Upload | Yes (upload % is real; compile % estimated from the previous build) | — |
| 8 | Speed: check, upload, reconnect after RST | Partly: native port scan every 1 s, no re-probe of a known board | Time targets to measure against; decision on keeping `--no-stub` uploads on macOS/Linux |
| 9 | Reliable create / remove of files | Not reproduced; code reviewed, tests pass | Exact steps + OS where it misbehaves |
| 10 | Terminal as is | — | — |
| 11 | Automatic updates with consent | Designed, not built | Updater signing key (generate on the Windows laptop), release hosting choice (repo is private), Apple Developer ID + Windows certificate |
| — | Indus (STM32G484) flashing without ST CubeProgrammer | Not started | An Indus board for validation; decision whether Indus is in the first delivery |
