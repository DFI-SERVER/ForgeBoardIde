import { Modal } from "@/shared/components/Modal";
import {
  availableUpdate,
  updateDialogOpen,
  updateProgress,
  updateInstalling,
  installAvailableUpdate,
  skipUpdateForNow,
} from "@/app/update-check";
import "./UpdateDialog.css";

function mb(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * "Update available" — version, date, release notes, and the two choices the
 * requirement asks for: Update now (download, verify, install, restart) or
 * Later. While downloading, a real progress bar from the byte counts.
 */
export function UpdateDialog() {
  const update = availableUpdate.value;
  if (!updateDialogOpen.value || !update) return null;
  const installing = updateInstalling.value;
  const progress = updateProgress.value;
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <Modal title="Update available" onClose={() => { if (!installing) skipUpdateForNow(); }}>
      <div class="ud-version">
        Flow State <b>{update.version}</b> is available. You have {update.currentVersion}.
        {update.date && <span class="ud-date"> · {update.date.slice(0, 10)}</span>}
      </div>
      {update.notes && <pre class="ud-notes">{update.notes}</pre>}
      <div class="ud-note">
        The download is checked against Flow State's signing key before anything is installed. The app restarts when it is done.
      </div>
      {installing && (
        <div class="ud-progress" role="progressbar" aria-valuenow={pct ?? undefined}>
          <div class="ud-progress-fill" style={{ width: `${pct ?? 100}%` }} />
          <div class="ud-progress-label">
            {pct !== null
              ? `Downloading · ${pct}% (${mb(progress!.downloaded)} of ${mb(progress!.total!)})`
              : progress && progress.downloaded > 0
                ? `Downloading · ${mb(progress.downloaded)}`
                : "Starting download…"}
          </div>
        </div>
      )}
      <div class="ud-footer">
        <button type="button" class="ud-btn" disabled={installing} onClick={skipUpdateForNow}>
          Later
        </button>
        <button type="button" class="ud-btn ud-btn-primary" disabled={installing} onClick={() => void installAvailableUpdate()}>
          {installing ? "Installing…" : "Update now"}
        </button>
      </div>
    </Modal>
  );
}
