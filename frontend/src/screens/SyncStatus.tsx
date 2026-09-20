import { useEffect, useState } from "react";
import { useOptionalPos } from "../pos-store";

export function SyncStatus() {
  const pos = useOptionalPos();
  const [online, setOnline] = useState(
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
  );

  useEffect(() => {
    function goOn() {
      setOnline(true);
    }
    function goOff() {
      setOnline(false);
    }
    window.addEventListener("online", goOn);
    window.addEventListener("offline", goOff);
    return () => {
      window.removeEventListener("online", goOn);
      window.removeEventListener("offline", goOff);
    };
  }, []);

  const sync = pos?.sync;
  const tone = sync
    ? sync.status === "error"
      ? "is-error"
      : sync.status === "queued"
        ? "is-offline"
        : sync.status === "saving"
          ? "is-saving"
          : "is-online"
    : online
      ? "is-online"
      : "is-offline";
  const full = sync
    ? sync.status === "error"
      ? `Not saved — ${sync.error ?? "server error"}`
      : sync.status === "queued"
        ? "Offline — waiting to sync"
        : sync.status === "saving"
          ? "Saving to server…"
          : "Online — saved to server"
    : online
      ? "Online"
      : "Offline";
  const short = sync
    ? sync.status === "error"
      ? "Save failed"
      : sync.status === "queued"
        ? "Offline"
        : sync.status === "saving"
          ? "Saving"
          : "Saved"
    : online
      ? "Online"
      : "Offline";

  return (
    <p className={`status-pill ${tone}`}>
      <span className="status-dot" />
      <span className="status-full">{full}</span>
      <span className="status-short">{short}</span>
    </p>
  );
}
