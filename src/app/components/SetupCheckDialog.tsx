import { useEffect, useState } from "preact/hooks";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "@/shared/components/Modal";
import { activeRail, toast } from "@/app/state";
import { setupApi, type SetupCheck, type SetupFix } from "@/ipc/setup";
import {
  setupChecks,
  setupCheckOpen,
  setupCheckRunning,
  runSetupCheck,
  warnIds,
  writeDismissed,
} from "@/app/setup-check";
import "./SetupCheckDialog.css";

const STATUS_LABEL: Record<SetupCheck["status"], string> = {
  ok: "OK",
  warn: "Action needed",
  fail: "Blocked",
  info: "Note",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      class="sc-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.value = { text: "Couldn't copy — select the command and copy it by hand.", kind: "warn" };
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FixAction({ check, onDone }: { check: SetupCheck; onDone: () => void }) {
  const fix = check.fix as SetupFix;
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  if (fix.kind === "auto") {
    return (
      <div class="sc-fix">
        <button
          type="button"
          class="sc-btn sc-btn-primary"
          disabled={running}
          onClick={async () => {
            setRunning(true);
            setLog([]);
            const unlisten = await setupApi.onFixOutput((line) => setLog((l) => [...l.slice(-40), line]));
            try {
              const code = await setupApi.fix(check.id);
              if (code === 0) {
                toast.value = { text: `✓ ${check.title} installed`, kind: "success" };
                onDone();
              } else {
                toast.value = {
                  text: `${fix.label} did not finish (exit ${code}). Run the command below in Terminal instead.`,
                  kind: "warn",
                };
              }
            } catch (e) {
              toast.value = { text: `${fix.label} failed: ${String(e)}`, kind: "warn" };
            } finally {
              unlisten();
              setRunning(false);
            }
          }}
        >
          {running ? "Installing…" : fix.label}
        </button>
        {fix.command && (
          <div class="sc-cmd-row">
            <code class="sc-cmd">{fix.command}</code>
            <CopyButton text={fix.command} />
          </div>
        )}
        {log.length > 0 && <pre class="sc-log">{log.join("\n")}</pre>}
      </div>
    );
  }

  if (fix.kind === "command" && fix.command) {
    return (
      <div class="sc-fix">
        <div class="sc-fix-label">{fix.label} — run in a terminal:</div>
        <div class="sc-cmd-row">
          <code class="sc-cmd">{fix.command}</code>
          <CopyButton text={fix.command} />
        </div>
      </div>
    );
  }

  if (fix.kind === "install-core") {
    return (
      <div class="sc-fix">
        <button
          type="button"
          class="sc-btn sc-btn-primary"
          onClick={() => {
            activeRail.value = "boards";
            setupCheckOpen.value = false;
          }}
        >
          {fix.label}
        </button>
      </div>
    );
  }

  if (fix.kind === "url" && fix.url) {
    const url = fix.url;
    return (
      <div class="sc-fix">
        <button
          type="button"
          class="sc-btn"
          onClick={() =>
            openUrl(url).catch(() => {
              toast.value = { text: `Couldn't open the link. The address is ${url}`, kind: "warn" };
            })
          }
        >
          {fix.label}
        </button>
        <div class="sc-cmd-row">
          <code class="sc-cmd">{url}</code>
          <CopyButton text={url} />
        </div>
      </div>
    );
  }
  return null;
}

/**
 * The Setup check dialog: every platform prerequisite with its status and,
 * where something is wrong, the fix — a button when the app can do it, the
 * exact command for this OS when it cannot. Opens on its own at startup when
 * there is something to fix; always available from Help → Setup check.
 */
export function SetupCheckDialog() {
  const open = setupCheckOpen.value;
  const checks = setupChecks.value;
  const running = setupCheckRunning.value;

  useEffect(() => {
    if (open && checks.length === 0 && !running) void runSetupCheck();
  }, [open]);

  if (!open) return null;

  const close = () => {
    writeDismissed(warnIds(checks));
    setupCheckOpen.value = false;
  };
  const blocked = checks.filter((c) => c.status === "fail").length;
  const actions = checks.filter((c) => c.status === "warn").length;

  return (
    <Modal title="Setup check" onClose={close}>
      <div class="sc-intro">
        {blocked > 0
          ? `${blocked === 1 ? "1 item blocks" : `${blocked} items block`} building or flashing on this computer.`
          : actions > 0
            ? "ForgeBoard can run, but a few things need attention before the first build."
            : "Everything this computer needs is in place."}
      </div>
      <ul class="sc-list" aria-busy={running}>
        {checks.map((c) => (
          <li key={c.id} class={`sc-item sc-${c.status}`}>
            <span class="sc-dot" aria-hidden="true" />
            <div class="sc-body">
              <div class="sc-head">
                <span class="sc-title">{c.title}</span>
                <span class="sc-status">{STATUS_LABEL[c.status]}</span>
              </div>
              <div class="sc-detail">{c.detail}</div>
              {c.fix && c.status !== "ok" && (
                <FixAction check={c} onDone={() => void runSetupCheck()} />
              )}
            </div>
          </li>
        ))}
        {checks.length === 0 && running && <li class="sc-empty">Checking…</li>}
      </ul>
      <div class="sc-footer">
        <button type="button" class="sc-btn" disabled={running} onClick={() => void runSetupCheck()}>
          {running ? "Checking…" : "Check again"}
        </button>
        <button type="button" class="sc-btn sc-btn-primary" onClick={close}>
          {blocked > 0 ? "Close anyway" : "Done"}
        </button>
      </div>
    </Modal>
  );
}
