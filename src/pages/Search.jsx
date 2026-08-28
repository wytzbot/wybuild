import {useEffect,useMemo,useState} from "react";
import {github} from "../github";
import {searchFiles} from "../search";

const actions=[
 {label:"Open Repository",page:"repos"},{label:"Rename folder",page:"project"},{label:"Font size",page:"settings"},{label:"AI diagnostics",page:"project"},{label:"Branches",page:"project"},{label:"Changes",page:"changes"}
];
export default function SearchPage({repos,onOpen,onNavigate,query="",repoFiles={},onOpenFile}){
 const [q,setQ]=useState(query),[repoHits,setRepoHits]=useState([]),[remote,setRemote]=useState([]);
 useEffect(()=>setQ(query),[query]);
 useEffect(()=>{let alive=true;const run=async()=>{if(!q.trim()){setRepoHits([]);setRemote([]);return}const n=q.toLowerCase();setRepoHits(repos.filter(r=>`${r.full_name} ${r.description||""}`.toLowerCase().includes(n)));if(repoFiles&&Object.keys(repoFiles).length)setRemote(searchFiles(repoFiles,q).slice(0,50));else {setRemote([])}};run();return()=>{alive=false}},[q,repos,repoFiles]);
 const actionHits=useMemo(()=>actions.filter(a=>a.label.toLowerCase().includes(q.toLowerCase())),[q]);
 return <div className="page"><header><div><span className="eyebrow">GLOBAL SEARCH</span><h1>Search</h1></div></header><section className="panel"><input autoFocus className="searchInput" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search repositories, files, code or actions…"/>{q&&<>
 <h3>REPOSITORIES</h3>{repoHits.map(r=><button className="repoRow" key={r.id} onClick={()=>onOpen(r)}><span><b>{r.full_name}</b><small>{r.private?"Private":"Public"}</small></span><span>›</span></button>)}
 <h3>CODE</h3>{remote.map(x=><button className="change" key={`${x.path}:${x.line}`} onClick={()=>onOpenFile?.(x.path,x.line)}><b>{x.path}</b><span>line {x.line} — {x.text}</span></button>)}
 <h3>ACTIONS</h3>{actionHits.map(a=><button className="change" key={a.label} onClick={()=>a.page&&onNavigate?.(a.page)}><span>{a.label}</span></button>)}
 {!repoHits.length&&!remote.length&&!actionHits.length&&<p className="muted">No matching repositories, code or actions.</p>}</>}</section></div>
}
