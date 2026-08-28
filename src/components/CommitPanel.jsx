import { useEffect, useState } from "react";

export default function CommitPanel({ count, onCommit, busy }) {
  const [msg, setMsg] = useState("");
  const [touched, setTouched] = useState(false);

  // Keep the button usable the moment there are changes: pre-fill a sensible
  // default message, but stop overwriting it once the person edits it. Once
  // a push clears out all local changes, reset so the next batch gets a fresh default.
  useEffect(() => {
    if (count === 0) {
      setTouched(false);
      setMsg("");
      return;
    }
    if (!touched) setMsg(`Update ${count} file${count === 1 ? "" : "s"}`);
  }, [count]);

  const disabled = !msg.trim() || !count || busy;
  return (
    <div className="commitBar">
      <span>{count} changed</span>
      <input
        value={msg}
        onChange={(e) => {
          setMsg(e.target.value);
          setTouched(true);
        }}
        placeholder="Commit message"
      />
      <button disabled={disabled} onClick={() => onCommit(msg)}>
        {busy ? "Pushing…" : "Commit & Push"}
      </button>
    </div>
  );
}
