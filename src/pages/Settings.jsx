import { useEffect, useRef, useState } from "react";
import { getLocalPreferences, loadState, saveState, syncPreferences, loadSyncedPreferences } from "../storage";
import { confirmDialog } from "../dialog";
import Select from "../components/Select";

export default function Settings() {
  const [font, setFont] = useState(loadState("fontSize", 16));
  const [wrap, setWrap] = useState(loadState("wordWrap", true));
  const [motion, setMotion] = useState(loadState("reducedMotion", false));
  const [density, setDensity] = useState(loadState("density", "comfortable"));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const syncTimer = useRef(null);

  const apply = (prefs) => {
    if (prefs.fontSize !== undefined) { setFont(prefs.fontSize); document.documentElement.style.setProperty("--ui-font", prefs.fontSize + "px"); }
    if (prefs.wordWrap !== undefined) setWrap(prefs.wordWrap);
    if (prefs.reducedMotion !== undefined) setMotion(prefs.reducedMotion);
    if (prefs.density !== undefined) setDensity(prefs.density);
  };

  useEffect(() => {
    let alive = true;
    loadSyncedPreferences().then((remote) => { if (alive && Object.keys(remote).length) apply(remote); }).catch(() => {});
    return () => { alive = false; if (syncTimer.current) clearTimeout(syncTimer.current); };
  }, []);

  const queueSync = () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      setSyncing(true); setSyncError("");
      try { await syncPreferences(getLocalPreferences()); }
      catch (e) { setSyncError("Saved on this device. Cloud sync will retry next time you change a setting."); }
      finally { setSyncing(false); }
    }, 350);
  };

  const update = (k, v) => {
    saveState(k, v);
    apply({[k]:v});
    queueSync();
  };

  const clearWorkingData = async () => {
    const ok = await confirmDialog({
      title: "Clear local working data",
      message: "Delete WyDev local working states? Unsaved changes will be lost.",
      confirmLabel: "Clear data",
      danger: true,
    });
    if (!ok) return;
    Object.keys(localStorage).filter((k) => k.startsWith("wydev:project:")).forEach((k) => localStorage.removeItem(k));
    location.reload();
  };

  return (
    <div className="page">
      <header><div><span className="eyebrow">PREFERENCES</span><h1>Settings</h1></div></header>
      <section className="panel">
        <h3>ACCESSIBILITY</h3>
        <label>Interface font size<Select value={font} onChange={(v) => update("fontSize", +v)} options={[{value:14,label:"Small"},{value:16,label:"Medium"},{value:18,label:"Large"},{value:20,label:"Extra Large"}]} /></label>
        <label>Density<Select value={density} onChange={(v) => update("density", v)} options={[{value:"compact",label:"Compact"},{value:"comfortable",label:"Comfortable"}]} /></label>
        <label>Word wrap<input type="checkbox" checked={wrap} onChange={(e) => update("wordWrap", e.target.checked)} /></label>
        <label>Reduced motion<input type="checkbox" checked={motion} onChange={(e) => update("reducedMotion", e.target.checked)} /></label>
        <p className="muted">{syncing ? "Syncing preferences…" : syncError || "Preferences sync to your WyDev account."}</p>
      </section>
      <section className="panel">
        <h3>LOCAL DATA</h3>
        <button onClick={() => { localStorage.removeItem("wydev:recentProjects"); location.reload(); }}>Clear recent projects</button>
        <button onClick={clearWorkingData}>Clear local working data</button>
      </section>
    </div>
  );
}
