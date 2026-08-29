import crypto from 'node:crypto';

const COOKIE='wybuild_session', STATE_COOKIE='wybuild_oauth_state', GH='https://api.github.com';
const json=(res,status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
const urlOf=req=>new URL(req.url,`http://${req.headers.host}`);
async function body(req){let s='';for await(const c of req)s+=c;if(!s)return{};try{return JSON.parse(s)}catch{throw Object.assign(new Error('Invalid JSON body'),{status:400})}}
function key(){return crypto.createHash('sha256').update(process.env.SESSION_SECRET||'development-only-change-me').digest()}
function seal(obj){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const raw=Buffer.from(JSON.stringify({...obj,exp:Date.now()+7*86400000}));const enc=Buffer.concat([cipher.update(raw),cipher.final()]);return [iv,cipher.getAuthTag(),enc].map(x=>x.toString('base64url')).join('.')}
function unseal(v){try{const[a,b,c]=v.split('.');const d=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(a,'base64url'));d.setAuthTag(Buffer.from(b,'base64url'));const x=JSON.parse(Buffer.concat([d.update(Buffer.from(c,'base64url')),d.final()]));return x.exp>Date.now()?x:null}catch{return null}}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return[i<0?x:x.slice(0,i).trim(),decodeURIComponent(i<0?'':x.slice(i+1))]}))}
function session(req){const v=cookies(req)[COOKIE];return v?unseal(v):null}
function setCookie(res,name,value,maxAge=604800){res.setHeader('Set-Cookie',`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`)}
function clearCookie(res,name){setCookie(res,name,'',0)}
async function gh(path,token,options={}){const r=await fetch(GH+path,{...options,headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${token}`,...(options.headers||{})}});const text=await r.text();let data={};try{data=JSON.parse(text)}catch{data={message:text}}if(!r.ok)throw Object.assign(new Error(data.message||`GitHub request failed (${r.status})`),{status:r.status,data});return data}
const configured=()=>!!(process.env.GITHUB_CLIENT_ID&&process.env.GITHUB_CLIENT_SECRET&&process.env.SESSION_SECRET);
function callback(req){const u=urlOf(req);return `${process.env.APP_URL||`${u.protocol}//${u.host}`}/api/auth/github/callback`}
const WORKFLOW=`name: WyBuild
on:
  workflow_dispatch:
    inputs:
      build_type:
        description: APK or AAB
        required: true
        default: apk
      build_mode:
        description: debug or release
        required: true
        default: debug
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
          cache: gradle
      - name: Validate project
        run: |
          if [ ! -f ./gradlew ]; then echo 'No gradlew found. WyBuild currently requires a repository with a configured Android Gradle project.'; exit 1; fi
          chmod +x ./gradlew
      - name: Build APK
        if: inputs.build_type == 'apk'
        run: ./gradlew assemble\${{ inputs.build_mode == 'release' && 'Release' || 'Debug' }} --no-daemon
      - name: Build AAB
        if: inputs.build_type == 'aab'
        run: ./gradlew bundleRelease --no-daemon
      - name: Upload APK
        if: inputs.build_type == 'apk'
        uses: actions/upload-artifact@v4
        with:
          name: wybuild-apk
          path: '**/build/outputs/apk/**/*.apk'
          if-no-files-found: error
      - name: Upload AAB
        if: inputs.build_type == 'aab'
        uses: actions/upload-artifact@v4
        with:
          name: wybuild-aab
          path: '**/build/outputs/bundle/**/*.aab'
          if-no-files-found: error`;
function requireSession(req,res){const s=session(req);if(!s){json(res,401,{error:'GitHub connection required',code:'AUTH_REQUIRED'});return null}return s}
export default async function handler(req,res){
 try{
  const u=urlOf(req),route=u.pathname.replace(/^\/api\/?/,'');
  if(req.method==='GET'&&route==='health')return json(res,200,{ok:true,service:'wybuild'});
  if(req.method==='GET'&&route==='auth/github'){
   if(!configured())return json(res,503,{error:'GitHub authentication is not configured. Set APP_URL, SESSION_SECRET, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.'});
   const state=crypto.randomBytes(24).toString('hex');setCookie(res,STATE_COOKIE,state,600);const p=new URLSearchParams({client_id:process.env.GITHUB_CLIENT_ID,redirect_uri:callback(req),state,scope:'read:user user:email repo workflow'});res.statusCode=302;res.setHeader('Location',`https://github.com/login/oauth/authorize?${p}`);return res.end();
  }
  if(req.method==='GET'&&route==='auth/github/callback'){
   if(!configured())return json(res,503,{error:'GitHub authentication is not configured.'});const c=cookies(req),code=u.searchParams.get('code'),state=u.searchParams.get('state');if(!code||!state||state!==c[STATE_COOKIE])return json(res,400,{error:'GitHub connection failed: invalid OAuth state.'});
   const tr=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_CLIENT_ID,client_secret:process.env.GITHUB_CLIENT_SECRET,code,redirect_uri:callback(req)})});const token=await tr.json();if(!token.access_token)throw new Error(token.error_description||'GitHub token exchange failed');const me=await gh('/user',token.access_token);setCookie(res,COOKIE,seal({token:token.access_token,user:{id:me.id,login:me.login,name:me.name,avatar:me.avatar_url}}));clearCookie(res,STATE_COOKIE);res.statusCode=302;res.setHeader('Location',`${process.env.APP_URL||`${u.protocol}//${u.host}`}/projects`);return res.end();
  }
  if(req.method==='POST'&&route==='auth/logout'){clearCookie(res,COOKIE);return json(res,200,{ok:true})}
  if(req.method==='GET'&&route==='auth/me'){const s=session(req);if(!s)return json(res,200,{authenticated:false});try{const me=await gh('/user',s.token);return json(res,200,{authenticated:true,user:{id:me.id,login:me.login,name:me.name,avatar:me.avatar_url}})}catch{return json(res,401,{authenticated:false,error:'GitHub session expired or revoked.'})}}

  if(req.method==='GET'&&route==='billing/status'){const s=requireSession(req,res);if(!s)return;const api=process.env.WYDEV_BILLING_API_URL?.replace(/\/$/,'');if(!api)return json(res,200,{plan:'FREE',buildsUsed:0,buildLimit:5,paymentStatus:'managed by WyDev',source:'wydev',billingConfigured:false,billingUrl:process.env.WYDEV_BILLING_URL||undefined});const r=await fetch(`${api}/entitlement`,{headers:{Authorization:`Bearer ${process.env.WYDEV_BILLING_SERVICE_TOKEN||''}`,'X-GitHub-User':s.user.login,'X-GitHub-User-Id':String(s.user.id)}});const d=await r.json().catch(()=>({}));if(!r.ok)return json(res,502,{error:'WyDev billing service unavailable',details:d.message||d.error});return json(res,200,{...d,source:'wydev',billingUrl:d.billingUrl||process.env.WYDEV_BILLING_URL||undefined})}
  const s=requireSession(req,res);if(!s)return;
  if(req.method==='GET'&&route==='github/repos')return json(res,200,await gh('/user/repos?per_page=100&sort=updated',s.token));
  if(req.method==='GET'&&route==='github/branches'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo');if(!o||!r)return json(res,400,{error:'owner and repo are required'});return json(res,200,await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/branches?per_page=100`,s.token))}
  if(req.method==='GET'&&route==='github/workflow'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo'),ref=u.searchParams.get('ref');if(!o||!r||!ref)return json(res,400,{error:'owner, repo and ref are required'});try{await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/.github/workflows/wybuild.yml?ref=${encodeURIComponent(ref)}`,s.token);return json(res,200,{exists:true})}catch(e){if(e.status===404)return json(res,200,{exists:false});throw e}}
  if(req.method==='POST'&&route==='github/install-workflow'){const b=await body(req),{owner,repo,ref}=b;if(!owner||!repo||!ref)return json(res,400,{error:'owner, repo and ref are required'});const branch=`wybuild/setup-${Date.now()}`,baseRef=await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`,s.token);await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,s.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:baseRef.object.sha})});await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/.github/workflows/wybuild.yml`,s.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'chore: add WyBuild workflow',content:Buffer.from(WORKFLOW).toString('base64'),branch})});return json(res,201,{ok:true,branch,message:'WyBuild workflow installed on a new branch. Review and merge it when ready.'})}
  if(req.method==='GET'&&route==='github/runs'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo');if(!o||!r)return json(res,400,{error:'owner and repo are required'});return json(res,200,await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs?per_page=50`,s.token))}
  if(req.method==='GET'&&route==='github/run'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo'),id=u.searchParams.get('id');if(!o||!r||!id)return json(res,400,{error:'owner, repo and id are required'});return json(res,200,await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${id}`,s.token))}
  if(req.method==='GET'&&route==='github/artifacts'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo'),id=u.searchParams.get('id');if(!o||!r||!id)return json(res,400,{error:'owner, repo and id are required'});return json(res,200,await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${id}/artifacts?per_page=50`,s.token))}
  if(req.method==='GET'&&route==='github/artifact'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo'),id=u.searchParams.get('id');if(!o||!r||!id)return json(res,400,{error:'owner, repo and id are required'});const rr=await fetch(`${GH}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/artifacts/${id}/zip`,{headers:{Authorization:`Bearer ${s.token}`,'X-GitHub-Api-Version':'2022-11-28'}});if(!rr.ok)return json(res,rr.status,{error:'Artifact download unavailable'});res.statusCode=200;res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="wybuild-artifact-${id}.zip"`);res.end(Buffer.from(await rr.arrayBuffer()));return}
  if(req.method==='GET'&&route==='github/logs'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo'),id=u.searchParams.get('id');if(!o||!r||!id)return json(res,400,{error:'owner, repo and id are required'});const rr=await fetch(`${GH}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${id}/logs`,{headers:{Authorization:`Bearer ${s.token}`,'X-GitHub-Api-Version':'2022-11-28'}});if(!rr.ok)return json(res,rr.status,{error:'GitHub logs unavailable'});res.statusCode=200;res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="wybuild-logs-${id}.zip"`);res.end(Buffer.from(await rr.arrayBuffer()));return}
  if(req.method==='POST'&&route==='github/dispatch'){const b=await body(req),{owner,repo,ref,inputs={}}=b;if(!owner||!repo||!ref)return json(res,400,{error:'owner, repo and ref are required'});try{await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/wybuild.yml/dispatches`,s.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref,inputs})})}catch(e){if(e.status===404)return json(res,409,{error:'WyBuild workflow is not installed on this branch. Install it first.',code:'WORKFLOW_MISSING'});throw e}return json(res,202,{ok:true,status:'queued'})}
  if(req.method==='GET'&&route==='github/releases'){const o=u.searchParams.get('owner'),r=u.searchParams.get('repo');if(!o||!r)return json(res,400,{error:'owner and repo are required'});return json(res,200,await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/releases?per_page=30`,s.token))}
  if(req.method==='POST'&&route==='github/releases'){const b=await body(req),{owner,repo,tag_name,name,body:notes='',target_commitish,prerelease=false,draft=false}=b;if(!owner||!repo||!tag_name)return json(res,400,{error:'owner, repo and tag_name are required'});return json(res,201,await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`,s.token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name,name:name||tag_name,body:notes,target_commitish,prerelease:!!prerelease,draft:!!draft})}))}
  return json(res,404,{error:'Route not found'});
 }catch(e){return json(res,e.status||500,{error:e.message||'Something went wrong'})}
}
