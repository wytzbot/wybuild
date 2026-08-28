import {Folder,FileCode,ChevronRight,ChevronDown} from "lucide-react";
import {useState,useEffect} from "react";
import {relativeTime} from "../utils";

function buildTree(files,times){
  const root={children:new Map(),files:[],time:0};
  for(const path of Object.keys(files)){
    const parts=path.split("/").filter(Boolean); let node=root;
    const t=times[path]||0;
    if(t>root.time) root.time=t;
    parts.forEach((part,i)=>{
      const isFile=i===parts.length-1;
      if(isFile) node.files.push({name:part,path,time:t});
      else {
        if(!node.children.has(part)) node.children.set(part,{children:new Map(),files:[],time:0});
        node=node.children.get(part);
        if(t>node.time) node.time=t;
      }
    });
  }
  return root;
}

// Re-renders every 30s so "now" ages into "1 min ago", "2 mins ago", etc.
// without needing any state change from file activity itself.
function Time({ts}){
  const [,tick]=useState(0);
  useEffect(()=>{
    const id=setInterval(()=>tick(x=>x+1),30000);
    return ()=>clearInterval(id);
  },[]);
  if(!ts) return null;
  return <span className="treeTime">{relativeTime(ts)}</span>;
}

function Node({node,onOpen,prefix="",depth=0}){
  const [open,setOpen]=useState(depth<1);
  return <div>
    {[...node.children.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,child])=>{
      const path=prefix+name;
      return <div key={path}>
        <button className="treeItem folder" style={{paddingLeft:12+depth*14}} onClick={()=>setOpen(v=>!v)}>
          {open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}<Folder size={16}/><span>{name}</span><Time ts={child.time}/>
        </button>
        {open&&<Node node={child} onOpen={onOpen} prefix={path+"/"} depth={depth+1}/>} 
      </div>;
    })}
    {node.files.sort((a,b)=>a.name.localeCompare(b.name)).map(f=><button className="treeItem" style={{paddingLeft:26+depth*14}} key={f.path} onClick={()=>onOpen(f.path)}><FileCode size={16}/><span>{f.name}</span><Time ts={f.time}/></button>)}
  </div>;
}
export default function FileExplorer({files,times={},onOpen}){return <div className="tree"><Node node={buildTree(files,times)} onOpen={onOpen}/></div>}
