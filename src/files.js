export const readFileText=async(file)=>file.text();
export const folderEntries=async(handle,prefix="")=>{const out=[];for await(const [name,h] of handle.entries()){const path=prefix+name;if(h.kind==="file")out.push({path,file:h});else out.push(...await folderEntries(h,path+"/"))}return out};
export const shouldSkip=p=>/(^|\/)(node_modules|\.git|dist|build)(\/|$)/.test(String(p))||/\.map$/.test(String(p));
export function safeRepoPath(input=""){
  const p=String(input).replaceAll("\\","/").replace(/^\/+/,"");
  const parts=p.split("/").filter(Boolean);
  if(parts.some(x=>x===".."||x===".")) throw new Error("Invalid repository path.");
  return parts.join("/");
}
export function shouldSkipUpload(pathname=""){
  const p=safeRepoPath(pathname);
  return p.split("/").some(x=>[".git","node_modules",".next","dist","build","coverage"].includes(x))
    || /\.(log|tmp|swp)$/i.test(p);
}
export function normalizeUploadEntry(relativePath,file){
  const path=safeRepoPath(relativePath);
  if(!path || shouldSkipUpload(path)) return null;
  const max=10*1024*1024;
  if(file?.size>max) throw new Error(`File too large: ${path}`);
  return {path,file};
}

export const isZipFile=(file)=>/\.zip$/i.test(file?.name||"")||["application/zip","application/x-zip-compressed","application/x-zip"].includes(file?.type);

const BINARY_EXT=new Set(["png","jpg","jpeg","gif","webp","ico","bmp","svgz","pdf","zip","gz","tar","7z","rar","woff","woff2","ttf","otf","eot","mp3","mp4","mov","avi","webm","wav","exe","dll","so","dylib","class","jar","psd","ai","sqlite","db"]);
const extOf=(p)=>String(p).split(".").pop()?.toLowerCase()||"";
const mimeForUploadPath=(p)=>({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",ico:"image/x-icon",bmp:"image/bmp",svg:"image/svg+xml",pdf:"application/pdf",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",eot:"application/vnd.ms-fontobject",mp3:"audio/mpeg",mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",wav:"audio/wav"}[extOf(p)]||"application/octet-stream");


// Reads a .zip File in the browser and returns the usable text entries inside it,
// so a repository can be bootstrapped by picking a single zip export instead of
// relying on a folder picker (which most mobile browsers don't support at all).
export async function extractZipEntries(file){
  const JSZip=(await import("jszip")).default;
  const zip=await JSZip.loadAsync(file);
  const entries=Object.values(zip.files);
  const out=[];
  const skippedBinary=[];
  for(const entry of entries){
    if(entry.dir) continue;
    // Zips commonly wrap everything in a single top-level folder (e.g. GitHub's
    // "Download ZIP" produces repo-branch/...); strip that so paths land at repo root.
    let path=entry.name.replaceAll("\\","/");
    if(shouldSkipUpload(path)) continue;
    if(BINARY_EXT.has(extOf(path))){
      const base64=await entry.async("base64");
      out.push({path:safeRepoPath(path),content:{__wydevBinary:true,base64,mime:mimeForUploadPath(path),size:entry._data?.uncompressedSize||0}});
      continue;
    }
    const text=await entry.async("string");
    out.push({path:safeRepoPath(path),content:text});
  }
  return {files:out.filter(x=>x.path),skippedBinary};
}

// If every extracted path shares one top-level segment, drop it — this matches
// what people expect when unzipping a GitHub-style repo export into a project.
export function stripCommonRoot(entries){
  if(!entries.length) return entries;
  const first=entries[0].path.split("/");
  if(first.length<2) return entries;
  const root=first[0];
  const allShare=entries.every(e=>e.path.startsWith(root+"/"));
  if(!allShare) return entries;
  return entries.map(e=>({...e,path:e.path.slice(root.length+1)}));
}
