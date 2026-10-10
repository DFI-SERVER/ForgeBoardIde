# Releasing Flow State

## Every release (3 commands)

1. Set the new version in `src-tauri/tauri.conf.json`, `package.json` and `src-tauri/Cargo.toml` (and `APP_VERSION` in `src/app/components/HelpDialogs.tsx`). Commit.
2. Push, then tag:

   ```
   git push
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. Watch the `release` workflow under Actions (10–15 min). When it is green,
   https://github.com/DFI-SERVER/flowstate-releases/releases has the
   installers and `latest.json`. Installed apps offer the update on their
   next launch; the student decides.

## One-time setup

- The updater key pair was generated on 2026-10-10 (`~/.tauri/flowstate.key`,
  `.key.pub`). The public key is in `tauri.conf.json`. **Back up the private
  key offline.** Without it, shipped apps can never update again.
- Repository secrets (Settings → Secrets → Actions) in the private repo:
  `RELEASE_REPO_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty string if the key has none).
- Optional OS code signing: the `APPLE_*` secrets (Developer ID) and, for
  Windows, a signing step once a certificate or Azure Trusted Signing exists.
- The first build with the updater must be installed by hand on every
  machine once; from then on updates are automatic.

## Hosting

Installers and `latest.json` are published to the PUBLIC repo
`DFI-SERVER/flowstate-releases`, because the update check is anonymous.
Source stays in the private repo.
