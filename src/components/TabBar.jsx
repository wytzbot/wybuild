import { Home, GitBranch, Search, GitCompare, Menu as MenuIcon } from "lucide-react";

const TABS = [
  ["home", "Home", Home],
  ["repos", "Repos", GitBranch],
  ["search", "Search", Search],
  ["changes", "Changes", GitCompare],
];

export default function TabBar({ page, setPage, onMore }) {
  return (
    <nav className="tabbar">
      {TABS.map(([id, label, Icon]) => (
        <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
      <button onClick={onMore}>
        <MenuIcon size={20} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
