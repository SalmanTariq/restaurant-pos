import { useEffect, useState } from "react";

export function SyncStatus() {
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

  return (
    <p className={online ? "status-pill is-online" : "status-pill is-offline"}>
      <span className="status-dot" />
      <span className="status-full">
        {online
          ? "Online — saved on this device"
          : "Offline — saved on this device"}
      </span>
      <span className="status-short">{online ? "Online" : "Offline"}</span>
    </p>
  );
}
