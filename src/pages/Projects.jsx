import React,{useEffect,useState} from 'react';import {githubLogin,listRepositories,listBranches,checkWorkflow,installWorkflow,dispatchBuild} from '../github';import {PRESETS} from '../builds';
export default function Projects({session,onLogin}){
  const[repos,setRepos]=useState([]),[repoError,setRepoError]=useState(''),[branches,setBranches]=useState([]),[repo,setRepo]=useState(null),[branch,setBranch]=useState(''),[preset,setPreset]=useState('quick_apk'),[loading,setLoading]=useState(false),[installing,setInstalling]=useState(false),[checking,setChecking]=useState(false),[workflow,setWorkflow]=useState(null),[install,setInstall]=useState(null),[msg,setMsg]=useState(''),[error,setError]=useState('');

  useEffect(()=>{if(session){setRepoError('');listRepositories().then(setRepos).catch(e=>{setRepoError(e.message);setError(e.message)})}},[session]);
  useEffect(()=>{if(!repo)return;listBranches(repo.owner.login,repo.name).then(x=>{setBranches(x);setBranch(repo.default_branch)}).catch(e=>setError(e.message))},[repo]);

  const refreshWorkflow=()=>{if(!repo||!branch)return;setChecking(true);checkWorkflow(repo.owner.login,repo.name,branch).then(w=>{setWorkflow(w);if(w.dispatchable)setInstall(null)}).catch(e=>setWorkflow({exists:false,dispatchable:false,error:e.message})).finally(()=>setChecking(false))};
  useEffect(()=>{setInstall(null);refreshWorkflow()},[repo,branch]);

  if(!session)return <div className="page"><div className="eyebrow">WORKSPACE</div><h1 className="title">Projects</h1><div className="card"><h3>Connect GitHub to continue</h3><p className="muted">WyBuild uses GitHub authorization instead of personal access tokens.</p><button className="btn" onClick={onLogin||githubLogin}>Connect GitHub</button></div></div>;

  const build=async()=>{setLoading(true);setMsg('');setError('');try{await dispatchBuild({owner:repo.owner.login,repo:repo.name,ref:branch,inputs:{build_type:PRESETS[preset].build_type,build_mode:PRESETS[preset].build_mode}});setMsg('Build queued in GitHub Actions. Open Builds to monitor the real run.')}catch(e){setError(e.message);refreshWorkflow()}finally{setLoading(false)}};

  const doInstall=async()=>{setInstalling(true);setError('');try{const x=await installWorkflow(repo.owner.login,repo.name,branch);setMsg(x.message);setInstall(x);if(x.merged){setWorkflow({exists:true,dispatchable:true});setInstall(null);setMsg(x.message||'Workflow installed. The selected branch can now be built.')}else{refreshWorkflow()}}catch(e){setError(e.message)}finally{setInstalling(false)}};

  const ready=workflow?.dispatchable===true;

  return <div className="page"><div className="eyebrow">WORKSPACE</div><h1 className="title">Projects</h1><p className="sub">Select a repository and run a real GitHub Actions build.</p>
    {repoError&&<div className="notice error">{repoError}<button className="btn secondary" onClick={()=>listRepositories().then(setRepos).catch(e=>setRepoError(e.message))}>Retry repositories</button></div>}
    {msg&&<div className="notice">{msg}</div>}
    {error&&<div className="notice error">{error}</div>}
    <div className="card">
      <label>Repository<select value={repo?.full_name||''} onChange={e=>setRepo(repos.find(r=>r.full_name===e.target.value)||null)}><option value="">Select repository</option>{repos.map(r=><option key={r.id} value={r.full_name}>{r.full_name}{r.private?' · private':''}</option>)}</select></label>
      {repo&&<>
        <label>Branch<select value={branch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.name} value={b.name}>{b.name}</option>)}</select></label>
        {workflow&&<div className="notice">
          {ready
            ? '✓ WyBuild workflow detected and ready to build.'
            : (install?.prUrl
                ? <>Workflow committed - merge <a href={install.prUrl} target="_blank" rel="noreferrer">this pull request</a> into {install.defaultBranch} before building. GitHub only allows manual builds for workflows on the default branch.</>
                : (workflow.exists
                    ? 'Workflow file found on this branch, but GitHub has not registered it yet - it needs to be merged into the default branch before it can be triggered.'
                    : 'WyBuild workflow is not installed on this branch.'))}
          {!ready&&!install?.prUrl&&<button className="btn secondary" disabled={installing} onClick={doInstall}>{installing?'Installing…':'Install workflow'}</button>}
          {!ready&&install?.prUrl&&<button className="btn secondary" disabled={checking} onClick={refreshWorkflow}>{checking?'Checking…':"I've merged it - check again"}</button>}
        </div>}
        <label>Build preset<select value={preset} onChange={e=>setPreset(e.target.value)}>{Object.entries(PRESETS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
        <button className="btn" disabled={loading||installing||!ready} onClick={build}>{loading?'Dispatching…':'BUILD'}</button>
      </>}
    </div>
  </div>;
}

