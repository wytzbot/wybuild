import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
const root=process.cwd();
const required=["package.json","index.html","vite.config.js","vercel.json","api/index.js","src/main.jsx","src/App.jsx",".env.example"];
for(const f of required) if(!fs.existsSync(path.join(root,f))) throw new Error("Missing "+f);
for(const f of ["api/index.js","scripts/check-build.mjs"]) execFileSync(process.execPath,["--check",f],{stdio:"inherit"});
const ver=JSON.parse(fs.readFileSync("vercel.json","utf8"));
if(Object.keys(ver.functions||{}).length!==1 || !ver.functions["api/index.js"]) throw new Error("Expected exactly one Vercel function.");
const src=[];
function walk(d){for(const n of fs.readdirSync(d)){if(["node_modules","dist",".git"].includes(n))continue;const p=path.join(d,n),s=fs.statSync(p);s.isDirectory()?walk(p):src.push(p)}}
walk("src");
const secrets=["GITHUB_CLIENT_SECRET","FLW_CLIENT_SECRET","OPENAI_API_KEY","FIREBASE_PRIVATE_KEY","SESSION_SECRET"];
for(const p of src){const s=fs.readFileSync(p,"utf8");for(const x of secrets)if(s.includes(x))throw new Error(`Server secret in frontend: ${p}: ${x}`)}
const env=fs.readFileSync(".env.example","utf8");
if(!env.includes("FLW_PRO_NGN=9000"))throw new Error("NGN Pro price must be 9000.");
if(!env.includes("FLW_PRO_USD=9.99"))throw new Error("USD Pro price must be 9.99.");
console.log("WyDev release audit: PASS");
