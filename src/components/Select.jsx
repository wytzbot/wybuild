import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export default function Select({ value, onChange, options = [], label, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => String(o.value) === String(value)) || options[0];

  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter" && document.activeElement === ref.current?.querySelector("button")) setOpen((v) => !v);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const choose = (option) => {
    onChange?.(option.value);
    setOpen(false);
  };

  return (
    <div className={`wySelect ${open ? "open" : ""} ${className}`} ref={ref}>
      {label && <span className="wySelectLabel">{label}</span>}
      <button
        type="button"
        className="wySelectTrigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? "Select…"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="wySelectMenu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              className="wySelectOption"
              key={String(option.value)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
