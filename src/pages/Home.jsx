import { Lock, BookMarked } from "lucide-react";

export default function Home({ repos, onOpen }) {
  return (
    <div className="page">
      <header>
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>Home</h1>
        </div>
        <button onClick={() => onOpen()}>Open Repository</button>
      </header>
      <section className="panel">
        <h3>RECENT REPOSITORIES</h3>
        {repos.slice(0, 8).map((r) => (
          <button className="repoRow" key={r.id} onClick={() => onOpen(r)}>
            <span className="repoRowIcon">{r.private ? <Lock size={15} /> : <BookMarked size={15} />}</span>
            <span className="repoRowBody">
              <b>{r.full_name}</b>
              <small className="repoMeta">
                <span className={`pill ${r.private ? "pillPrivate" : "pillPublic"}`}>{r.private ? "Private" : "Public"}</span>
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
