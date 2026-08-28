import { useState } from "react";
import { Plus, Lock, BookMarked } from "lucide-react";
import { promptDialog } from "../dialog";
import { toastError } from "../toast";

export default function Repositories({ repos, repoLimit, onOpen, onCreate }) {
  const [busy, setBusy] = useState(false);

  const createRepository = async () => {
    const result = await promptDialog({
      title: "New repository",
      confirmLabel: "Create repository",
      fields: [
        { key: "name", label: "Repository name", placeholder: "my-project" },
        { key: "description", label: "Description (optional)", placeholder: "What is this project?", required: false },
        { key: "private", label: "Private repository", type: "checkbox", required: false },
      ],
    });
    if (!result) return;
    setBusy(true);
    try {
      const repo = await onCreate({ name: result.name.trim(), description: result.description?.trim(), private: !!result.private });
      onOpen(repo);
    } catch (e) {
      toastError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header>
        <div>
          <span className="eyebrow">GITHUB</span>
          <h1>Repositories</h1>
        </div>
        <button className="primary" disabled={busy} onClick={createRepository}>
          <Plus size={16} />
          New
        </button>
      </header>
      {repoLimit?.limit != null && repoLimit.total > repoLimit.limit && (
        <p className="muted" style={{ padding: "0 16px" }}>
          Showing {repoLimit.limit} of {repoLimit.total} repositories on the Free plan. Upgrade to WyDev Pro to see and manage all of them.
        </p>
      )}
      <section className="panel">
        {repos.map((r) => (
          <button className="repoRow" key={r.id} onClick={() => onOpen(r)}>
            <span className="repoRowIcon">{r.private ? <Lock size={15} /> : <BookMarked size={15} />}</span>
            <span className="repoRowBody">
              <b>{r.full_name}</b>
              {r.description && <small className="repoDesc">{r.description}</small>}
              <small className="repoMeta">
                <span className={`pill ${r.private ? "pillPrivate" : "pillPublic"}`}>{r.private ? "Private" : "Public"}</span>
                {r.language && <span className="langDot" style={{ "--lang-color": languageColor(r.language) }}>{r.language}</span>}
                {typeof r.stargazers_count === "number" && r.stargazers_count > 0 && <span>★ {r.stargazers_count}</span>}
                <span>{r.default_branch}</span>
              </small>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
        {!repos.length && <p className="muted">No repositories loaded.</p>}
      </section>
    </div>
  );
}

const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  "C++": "#f34b7d",
  C: "#555555",
  Shell: "#89e051",
};
function languageColor(lang) {
  return LANG_COLORS[lang] || "#8d99a6";
}
