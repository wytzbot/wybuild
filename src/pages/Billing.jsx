import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {DEFAULT_PLANS,getBillingStatus,openWyDevBilling,resetUsage} from '../billing';
import {getSession} from '../github';

const OWNER_LOGIN='wytzbot';

export default function Billing(){
  const [session,setSession]=useState(undefined);
  const [status,setStatus]=useState(null);
  const [error,setError]=useState('');
  const [resetting,setResetting]=useState(false);
  const [resetMsg,setResetMsg]=useState('');

  const load=()=>{setError('');getBillingStatus().then(setStatus).catch(e=>setError(e.message))};
  useEffect(()=>{getSession().then(x=>{setSession(x);if(x)load()}).catch(e=>{setSession(null);setError(e.message)})},[]);

  if(session===undefined) return <div className="page"><h1 className="title">Billing</h1><div className="card">Loading…</div></div>;
  if(!session) return <div className="page"><div className="eyebrow">SUBSCRIPTION</div><h1 className="title">Billing</h1><div className="card"><h3>Connect GitHub first</h3><p className="muted">WyBuild links your billing entitlement to your authenticated WyDev account.</p><Link className="btn" to="/projects">Connect GitHub</Link></div></div>;

  const currentPlanKey = status ? String(status.plan||'FREE').toUpperCase() : null;
  const isOwner = String(session.user?.login||'').toLowerCase() === OWNER_LOGIN;

  const doReset=async()=>{
    setResetting(true);setResetMsg('');setError('');
    try{ const r=await resetUsage(); setResetMsg(r.message||'Usage reset.'); load(); }
    catch(e){ setError(e.message); }
    finally{ setResetting(false); }
  };

  return <div className="page">
    <div className="eyebrow">SUBSCRIPTION</div>
    <h1 className="title">Billing</h1>
    <p className="sub">Flutterwave payments are handled by WyDev. WyBuild only reads the server-confirmed entitlement.</p>

    {error && <div className="notice error">{error}<button className="btn secondary" onClick={load}>Retry</button></div>}

    {status && <>
      <div className="notice"><strong>Billing authority: WyDev</strong><br/>Payment verification and subscription state are controlled by WyDev.</div>
      <div className="card">
        <div className="eyebrow">CURRENT PLAN</div>
        <h2>{currentPlanKey}</h2>
        <p className="muted">{status.buildsUsed??0} / {status.buildLimit??DEFAULT_PLANS.free.builds} successful builds used this month</p>
        <p className="muted">{status.inProgressBuilds??0} / {status.concurrencyLimit??DEFAULT_PLANS.free.concurrency} builds in progress right now</p>
        <p className="muted">Payment status: {status.paymentStatus||'not provided'}</p>
        {status.billingUrl
          ? <button className="btn primary" onClick={()=>window.location.assign(status.billingUrl)}>Manage subscription in WyDev</button>
          : <button className="btn secondary" onClick={()=>{try{openWyDevBilling()}catch(e){setError(e.message)}}}>Open WyDev billing</button>}
        {isOwner && <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #262b33'}}>
          <p className="muted">Owner tools</p>
          <button className="btn secondary" disabled={resetting} onClick={doReset}>{resetting?'Resetting…':'Reset my usage to 0'}</button>
          {resetMsg && <p className="muted" style={{marginTop:8}}>{resetMsg}</p>}
        </div>}
      </div>
    </>}

    <div className="grid">
      {Object.values(DEFAULT_PLANS).map(p=>
        <div className={'card plan-card'+(currentPlanKey===p.label?' current':'')} key={p.label}>
          <div className="eyebrow">{p.label}{currentPlanKey===p.label?' · CURRENT':''}</div>
          <h3>₦{p.ngn.toLocaleString()} / ${p.usd}</h3>
          <p className="muted">{p.builds} successful builds / month</p>
          <ul className="plan-features">
            {p.features.map(f=><li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  </div>;
}
