import { useEffect } from "preact/hooks";
import { toast } from "../state/appState";
import "./Toast.css";

/** A single transient notification, bottom-right. Auto-dismisses; click to close. */
export function Toast() {
  useEffect(() => {
    if (toast.value === null) return;
    const timer = setTimeout(() => (toast.value = null), 4500);
    return () => clearTimeout(timer);
  }, [toast.value]);

  const message = toast.value;
  if (message === null) return null;
  return (
    <div
      class={`toast toast-${message.kind}`}
      onClick={() => (toast.value = null)}
    >
      {message.text}
    </div>
  );
}
