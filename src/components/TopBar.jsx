import { Menu as MenuIcon, Search } from "lucide-react";

export default function TopBar({ user, onMenu, onSearch, onAvatar }) {
  return (
    <header className="topbar">
      <button className="topbarIcon" aria-label="Open menu" onClick={onMenu}>
        <MenuIcon size={20} />
      </button>
      <span className="topbarBrand">WYDEV</span>
      <button className="topbarIcon" aria-label="Search" onClick={onSearch}>
        <Search size={19} />
      </button>
      <button className="topbarAvatar" aria-label="Account" onClick={onAvatar}>
        {user?.avatar ? (
          <img src={user.avatar} alt="" />
        ) : (
          <span className="avatarFallback">{(user?.login || "?")[0].toUpperCase()}</span>
        )}
      </button>
    </header>
  );
}
