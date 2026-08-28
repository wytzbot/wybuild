import { useEffect, useState } from "react";

export default function Offline() {
  const [checking, setChecking] = useState(false);

  const retry = () => {
    setChecking(true);
    // Let the browser perform a fresh connectivity check before reloading.
    if (navigator.onLine) {
      window.location.reload();
      return;
    }
    setTimeout(() => setChecking(false), 500);
  };

  useEffect(() => {
    const onOnline = () => window.location.reload();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <main className="offlinePage" role="main" aria-labelledby="offline-title">
      <div className="offlineCard">
        <div className="offlineMark" aria-hidden="true">↯</div>
        <span className="eyebrow">CONNECTION LOST</span>
        <h1 id="offline-title">You're offline</h1>
        <p>
          WyDev needs an internet connection for GitHub, syncing, billing and other
          cloud actions. Check your connection and try again.
        </p>
        <button className="primaryButton offlineRetry" type="button" onClick={retry} disabled={checking}>
          {checking ? "Checking…" : "Try again"}
        </button>
        <p className="offlineHint">Your local WyDev data is kept on this device.</p>
      </div>
    </main>
  );
}
