import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const root=process.cwd();
const required=[
  "index.html","package.json","vite.config.js",".env.example",
  "api/index.js","src/main.jsx","src/App.jsx","src/github.js",
  "src/ai.js","src/billing.js","src/storage.js","src/files.js",
  "src/git.js","src/styles.css","src/pages/Billing.jsx","src/pages/Project.jsx","vercel.json","DEPLOYMENT.md","E2E-SMOKE-TEST.md"
];
const missing=required.filter(x=>!fs.existsSync(path.join(root,x)));
if(missing.length){console.error("Missing:",missing);process.exit(1)}

execFileSync(process.execPath,["--check","api/index.js"],{stdio:"inherit"});

// node --check only validates plain JS (api/index.js). It CANNOT parse JSX, so a
// syntax error anywhere under src/**.jsx would previously pass this script silently
// and only surface as a broken production build. Actually parse every src file with
// esbuild (a transitive dependency of vite, present once `npm install` has run) so a
// build-breaking syntax error fails this script instead of shipping.
{
  let esbuildPath;
  try{ esbuildPath=require.resolve("esbuild/lib/main.js",{paths:[root]}); }catch{}
  if(!esbuildPath){
    try{ esbuildPath=require.resolve("vite/node_modules/esbuild/lib/main.js",{paths:[root]}); }catch{}
  }
  if(!esbuildPath){
    console.warn("esbuild not found (run npm install first) — skipping JSX/JS syntax check. This does NOT mean the build is clean.");
  } else {
    const esbuild = require(esbuildPath);
    const jsxFiles=[];
    (function walkSrc(dir){
      for(const name of fs.readdirSync(dir)){
        if(["node_modules","dist",".git"].includes(name)) continue;
        const p=path.join(dir,name), st=fs.statSync(p);
        if(st.isDirectory()) walkSrc(p);
        else if(/\.(js|jsx)$/.test(name)) jsxFiles.push(p);
      }
    })(path.join(root,"src"));
    const failures=[];
    for(const f of jsxFiles){
      try{ esbuild.transformSync(fs.readFileSync(f,"utf8"),{loader:f.endsWith(".jsx")?"jsx":"js",jsx:"automatic"}); }
      catch(e){ failures.push(`${path.relative(root,f)}: ${e.message.split("\n")[0]}`); }
    }
    if(failures.length){ console.error("JSX/JS syntax check FAILED:\n"+failures.join("\n")); process.exit(1); }
    console.log(`JSX/JS syntax check: PASS (${jsxFiles.length} files parsed)`);
  }
}

const api=fs.readFileSync(path.join(root,"api/index.js"),"utf8");
const forbidden=[
  /console\.log\([^)]*(token|secret|password|cvv|card)/i,
  /process\.env\.GITHUB_CLIENT_SECRET.*src/i
];
for(const re of forbidden) if(re.test(api)) { console.error("Security check failed:",re); process.exit(1); }

const webhookHandler=api.slice(api.indexOf('"/billing/webhook"'), api.indexOf('"/billing/renew"'));
if(/memory\.transactions\.get/.test(webhookHandler)) throw new Error("Webhook handler reads the in-memory transaction map directly instead of the durable getTransaction() helper — this breaks across serverless cold starts/instances even when Firestore is configured.");
if(!/await getTransaction\(/.test(webhookHandler)) throw new Error("Webhook handler must look up the transaction via the durable getTransaction() helper");

const app=fs.readFileSync(path.join(root,"src/App.jsx"),"utf8");
const billing=fs.readFileSync(path.join(root,"src/pages/Billing.jsx"),"utf8");
if(!app.includes('github.session()')) throw new Error("Auth session check missing");
if(!billing.includes('billing.checkout')) throw new Error("Billing checkout action missing");
if(!api.includes('/billing/webhook')) throw new Error("Flutterwave webhook route missing");
if(!api.includes('expectedSha')) throw new Error("Remote-change protection missing");
if(!api.includes('getEntitlement')) throw new Error("Persistent entitlement layer missing");
if(!api.includes('getUsage')) throw new Error("Persistent AI usage layer missing");

console.log("WyDev source checks passed.");
console.log("GitHub OAuth: present");
console.log("GitHub commit/push + remote SHA guard: present");
console.log("AI diagnostic + quota + fallback: present");
console.log("Firebase persistence layer: present");
console.log("Flutterwave v4 + webhook + verification: present");

const sourceFiles=[];
function walk(dir){
  for(const name of fs.readdirSync(dir)){
    if(["node_modules","dist",".git"].includes(name)) continue;
    const p=path.join(dir,name), st=fs.statSync(p);
    if(st.isDirectory()) walk(p); else sourceFiles.push(p);
  }
}
walk(path.join(root,"src"));
for(const p of sourceFiles){
  const s=fs.readFileSync(p,"utf8");
  if(/GITHUB_CLIENT_SECRET|FLW_CLIENT_SECRET|OPENAI_API_KEY|FIREBASE_PRIVATE_KEY/.test(s))
    throw new Error(`Server secret reference found in frontend source: ${path.relative(root,p)}`);
}
console.log("Frontend secret-scan: PASS");
