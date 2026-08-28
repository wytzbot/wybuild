import { useEffect, useRef, useState } from "react";
import { setDialogHandler } from "../dialog";

export default function DialogHost() {
  const [cfg, setCfg] = useState(null);
  const [values, setValues] = useState({});
  const firstFieldRef = useRef(null);

  useEffect(() => {
    setDialogHandler((next) => {
      setCfg(next);
      const initial = {};
      (next.fields || []).forEach((f) => {
        initial[f.key] =
          f.type === "checkbox" ? !!f.defaultValue : f.type === "multiselect" ? f.defaultValue || [] : f.defaultValue || "";
      });
      setValues(initial);
    });
    return () => setDialogHandler(null);
  }, []);

  useEffect(() => {
    if (cfg) requestAnimationFrame(() => firstFieldRef.current?.focus());
  }, [cfg]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", !!cfg);
    return () => document.body.classList.remove("modal-open");
  }, [!!cfg]);

  if (!cfg) return null;

  const isPrompt = cfg.type === "prompt";
  const requiredMissing = isPrompt && (cfg.fields || []).some(
    (f) => f.required !== false && f.type !== "checkbox" && f.type !== "multiselect" && !String(values[f.key] || "").trim()
  );

  const close = (result) => {
    const resolve = cfg.resolve;
    setCfg(null);
    resolve(result);
  };
  const submit = () => {
    if (requiredMissing) return;
    close(isPrompt ? values : true);
  };

  return (
    <div className="modalOverlay" role="presentation" onClick={() => close(null)}>
      <div
        className={`modalSheet${cfg.danger ? " danger" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={cfg.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalGrip" />
        <h3>{cfg.title}</h3>
        {cfg.message && <p className="modalMessage">{cfg.message}</p>}
        {(cfg.fields || []).map((f, i) =>
          f.type === "checkbox" ? (
            <label className="modalCheckbox" key={f.key}>
              <input
                type="checkbox"
                ref={i === 0 ? firstFieldRef : undefined}
                checked={!!values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              />
              <span>{f.label}</span>
            </label>
          ) : f.type === "multiselect" ? (
            <details className="modalField modalDropdown" key={f.key}>
              <summary>
                {f.label}
                {values[f.key]?.length ? ` (${values[f.key].length} selected)` : ""}
              </summary>
              <div className="modalDropdownList">
                {(f.options || []).length ? (
                  f.options.map((o) => (
                    <label className="modalCheckbox" key={o.value}>
                      <input
                        type="checkbox"
                        checked={(values[f.key] || []).includes(o.value)}
                        onChange={(e) =>
                          setValues((v) => {
                            const cur = v[f.key] || [];
                            return {
                              ...v,
                              [f.key]: e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value),
                            };
                          })
                        }
                      />
                      <span>{o.label}</span>
                    </label>
                  ))
                ) : (
                  <p className="muted">Nothing available to pick.</p>
                )}
              </div>
            </details>
          ) : f.type === "textarea" ? (
            <label className="modalField" key={f.key}>
              {f.label}
              <textarea
                ref={i === 0 ? firstFieldRef : undefined}
                value={values[f.key] || ""}
                placeholder={f.placeholder || ""}
                rows={3}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </label>
          ) : (
            <label className="modalField" key={f.key}>
              {f.label}
              <input
                ref={i === 0 ? firstFieldRef : undefined}
                value={values[f.key] || ""}
                placeholder={f.placeholder || ""}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") close(null);
                }}
              />
            </label>
          )
        )}
        {cfg.refs && cfg.refs.length > 0 && (
          <div className="modalRefs">
            {cfg.refs.slice(0, 12).map((x) => (
              <div className="ref" key={`${x.path}:${x.line}`}>
                {x.path}:{x.line} — {x.text}
              </div>
            ))}
          </div>
        )}
        <div className="modalActions">
          <button className="modalCancel" onClick={() => close(null)}>
            {cfg.cancelLabel || "Cancel"}
          </button>
          <button
            className={`modalConfirm${cfg.danger ? " danger" : " primary"}`}
            disabled={requiredMissing}
            onClick={submit}
          >
            {cfg.confirmLabel || (cfg.type === "confirm" ? "Confirm" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
