import React,{useState} from "react";
import {Home,GitBranch,Clock3,GitCompare,Search,Settings,HelpCircle,LogOut,CreditCard,Shield,FileText,Info} from "lucide-react";
export default function Menu({page,setPage,onLogout,onSearch}){
 const [q,setQ]=useState("");
 const go=p=>{document.body.classList.remove("menu-open");setPage(p)};
 const items=[["home","Home",Home],["repos","Repositories",GitBranch],["recent","Recent Projects",Clock3],["changes","Changes",GitCompare],["search","Search",Search],["billing","Billing",CreditCard],["settings","Settings",Settings],["help","Help",HelpCircle],["privacy","Privacy",Shield],["terms","Terms",FileText],["about","About",Info]];
 return <aside className="menu"><div className="brand">WYDEV</div><input className="globalSearch" value={q} placeholder="Search actions, files, repos…" onChange={e=>{setQ(e.target.value);if(e.target.value) {go("search");onSearch?.(e.target.value)}}}/>{items.map(([id,label,I])=><button className={page===id?"active":""} key={id} onClick={()=>go(id)}><I size={18}/>{label}</button>)}<button className="logout" onClick={onLogout}><LogOut size={18}/>Sign out</button></aside>
}
