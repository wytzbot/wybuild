import { useEffect, useState } from "react";
import Menu from "./components/Menu";
import TopBar from "./components/TopBar";
import TabBar from "./components/TabBar";
import DialogHost from "./components/DialogHost";
import ToastHost from "./components/ToastHost";
import { toastSuccess, toastError } from "./toast";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Repositories from "./pages/Repositories";
import Changes from "./pages/Changes";
import Settings from "./pages/Settings";
import Billing from "./pages/Billing";
import Project from "./pages/Project";
import SearchPage from "./pages/Search";
import LegalPage from "./pages/Legal";
import Offline from "./pages/Offline";
import { github } from "./github";
import { loadState, saveState } from "./storage";

export default function App() {
  const initialBillingReturn = new URLSearchParams(window.location.search).get("billing") === "return";
  const [user, setUser] = useState(null),
    [offline, setOffline] = useState(() => !navigator.onLine),
    [page, setPage] = useState(() => initialBillingReturn ? "billing" : (window.history.state?.wydevPage || (window.location.hash.replace("#","") || "home"))),
    [repos, setRepos] = useState([]),
    [repoLimit, setRepoLimit] = useState(null),
    [repo, setRepo] = useState(null),
    [working, setWorking] = useState(null),
    [searchQuery, setSearchQuery] = useState(""),
    [openPath, setOpenPath] = useState(""),
    [loading, setLoading] = useState(true);

  const loadRepos = () =>
    github
      .repos()
      .then((d) => {
        setRepos(d.repos || []);
        setRepoLimit({ total: d.total, limit: d.limit, plan: d.plan });
      })
      .catch((e) => toastError(e));

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Keep app navigation inside browser history so Android/iOS back returns to the
  // previous WyDev screen instead of closing the PWA/web app.
  useEffect(() => {
    if (!window.history.state?.wydevPage) {
      window.history.replaceState({ wydevPage: initialBillingReturn ? "billing" : page }, "", window.location.href);
    }
    const onPopState = (event) => {
      const next = event.state?.wydevPage;
      if (next) setPage(next);
      else {
        // Never let the browser back action leave WyDev from its root screen.
        window.history.pushState({ wydevPage: "home" }, "", window.location.href);
        setPage("home");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (next) => {
    if (!next || next === page) return;
    window.history.pushState({ wydevPage: next }, "", `#${next}`);
    setPage(next);
    closeMenu();
  };
  const goBack = () => {
    if (page === "home") return;
    window.history.back();
  };

  useEffect(() => {
    document.documentElement.style.setProperty("--ui-font", loadState("fontSize", 16) + "px");
    github
      .session()
      .then((x) => {
        if (x?.user) {
          setUser(x.user);
          loadRepos();
        }
      })
      .catch((e) => toastError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (repo) {
      const saved = loadState(`project:${repo.id}`, null);
      if (saved) setWorking({ repo, branch: saved.branch, files: saved.files || {}, base: saved.base || {}, changes: [] });
    }
  }, [repo]);

  if (offline) return <Offline />;
  if (loading) return <div className="loading">Loading WyDev…</div>;
  if (!user) return <Login />;

  const open = (r) => {
    if (r) {
      setRepo(r);
      navigate("project");
      saveState("recentProjects", [{ id: r.id, full_name: r.full_name, repo: r }, ...loadState("recentProjects", []).filter((x) => x.id !== r.id)].slice(0, 10));
    } else navigate("repos");
  };
  const createRepo = async (payload) => {
    const r = await github.createRepo(payload);
    setRepos((rs) => [r, ...rs]);
    toastSuccess(`Repository ${r.full_name || r.name || payload.name} created successfully`);
    return r;
  };
  const workingChanges = working?.changes || [];
  const openFile = (path) => {
    if (repo) {
      setOpenPath(path);
      navigate("project");
      setWorking((w) => (w ? { ...w, selected: path } : w));
    }
  };
  const openMenu = () => document.body.classList.add("menu-open");
  const closeMenu = () => document.body.classList.remove("menu-open");

  return (
    <div className="app">
      <TopBar user={user} onMenu={openMenu} onSearch={() => navigate("search")} onAvatar={() => navigate("settings")} />
      <Menu page={page} setPage={navigate} onSearch={(q) => setSearchQuery(q)} onLogout={async () => { await github.logout(); location.reload(); }} />
      <div className="menuScrim" onClick={closeMenu} />
      <section className="content">
        {page !== "home" && page !== "project" && (
          <button className="pageBack" type="button" onClick={goBack} aria-label="Go back">
            <span aria-hidden="true">‹</span> Back
          </button>
        )}
        {page === "home" && <Home repos={repos} onOpen={open} onCreate={createRepo} />}
        {page === "repos" && <Repositories repos={repos} repoLimit={repoLimit} onOpen={open} onCreate={createRepo} />}
        {page === "changes" && <Changes changes={workingChanges} onSelect={openFile} onDiscard={working?.discard} />}
        {page === "settings" && <Settings />}
        {page === "billing" && <Billing />}
        {page === "project" && repo && <Project repo={repo} openPath={openPath} onBack={() => navigate("repos")} onWorkingState={setWorking} />}
        {page === "search" && <SearchPage repos={repos} onOpen={open} onNavigate={navigate} query={searchQuery} repoFiles={working?.files || {}} onOpenFile={openFile} />}
        {page === "recent" && <Recent onOpen={open} />}
        {page === "help" && <Help />}
        {page === "privacy" && <LegalPage type="privacy" />}
        {page === "terms" && <LegalPage type="terms" />}
        {page === "about" && <LegalPage type="about" />}
      </section>
      <TabBar page={page} setPage={navigate} onMore={openMenu} />
      <DialogHost />
      <ToastHost />
    </div>
  );
}

function Recent({ onOpen }) {
  const items = loadState("recentProjects", []);
  return (
    <div className="page">
      <header>
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>Recent Projects</h1>
        </div>
      </header>
      <section className="panel">
        {items.length ? (
          items.map((x) => (
            <button className="repoRow" key={x.id} onClick={() => onOpen(x.repo || x)}>
              <span>
                <b>{x.full_name}</b>
                <small>Recently opened</small>
              </span>
              <span>›</span>
            </button>
          ))
        ) : (
          <p className="muted">No recently opened repositories yet.</p>
        )}
      </section>
    </div>
  );
}

function Help() {
  return (
    <div className="page">
      <header>
        <div>
          <span className="eyebrow">SUPPORT</span>
          <h1>Help</h1>
        </div>
      </header>
      <section className="panel">
        <h3>GETTING STARTED</h3>
        <p>Sign in with GitHub, open a repository, edit files locally, review Changes, then Commit & Push.</p>
        <p className="muted">GitHub remains the source of truth. WyDev never deploys or hosts your repository.</p>
        <h3>WHEN A PUSH FAILS</h3>
        <p>Pull the latest GitHub state and review the changes before retrying. WyDev refuses to overwrite a newer remote branch.</p>
        <a href="https://github.com" target="_blank" rel="noreferrer">Open GitHub</a>
      </section>
    </div>
  );
}
