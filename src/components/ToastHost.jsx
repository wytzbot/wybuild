import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { setToastHandler } from "../toast";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setToastHandler((t) => {
      setItems((list) => [...list, t].slice(-8));
      window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.duration);
    });
    return () => setToastHandler(null);
  }, []);

  if (!items.length) return null;

  const dismiss = (id) => setItems((list) => list.filter((x) => x.id !== id));

  return (
    <aside className="notificationBar" aria-label="WyDev notifications" aria-live="polite">
      <div className="notificationHead">
        <strong>Notifications</strong>
        <button type="button" className="notificationClear" onClick={() => setItems([])}>Clear all</button>
      </div>
      <div className="notificationList">
        {items.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div className={`notificationItem notification-${t.type}`} key={t.id}>
              <Icon size={17} />
              <div className="notificationBody">
                <b>{t.type === "error" ? "Action failed" : t.type === "success" ? "Action successful" : "WyDev"}</b>
                <span>{t.message}</span>
                {t.type === "error" && t.details && (
                  <details>
                    <summary>Technical cause</summary>
                    <pre>{t.details.slice(0, 1600)}</pre>
                  </details>
                )}
              </div>
              <button type="button" className="notificationClose" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
