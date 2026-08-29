import React,{useMemo,useState} from "react";
const docs=[
["Getting Started","Connect GitHub, create a project, select a branch and start an APK build."],
["How WyBuild Works","GitHub → WyBuild → GitHub Actions → Gradle → APK/AAB → artifact or release."],
["Projects","A project links WyBuild metadata to a GitHub repository and selected branch."],
["Builds","APK is generally used for device testing. AAB is the Android App Bundle format used for Play distribution."],
["Understanding Build Logs","Gradle is Android's build system. Dependencies are libraries your project needs. compileSdk controls the SDK used to compile; minSdk controls the oldest Android version supported; targetSdk declares the target behavior. Kotlin is a JVM language commonly used in Android apps."],
["Common Errors","Java/Gradle/AGP mismatches, dependency failures, missing SDK components, duplicate classes/resources, manifest errors and signing failures should be diagnosed from the original workflow logs."],
["Signing","A release keystore identifies the signing identity of an Android application. Losing a production signing key can prevent future updates to an already-published app."],
["Releases","A version tag identifies a source point. A GitHub Release can attach APK/AAB artifacts and release notes derived deterministically from commits."],
["Website → Android","Supported web projects can be wrapped in a maintained Android WebView template when their requirements fit the wrapper. Unsupported features must be identified before a build."],
["Billing","Plans, limits and prices should come from backend configuration. Payment is unlocked only after server-side verification."],
["Security","GitHub access should use least privilege. Secrets must never be sent to frontend code or printed into build logs."],
["Troubleshooting","Retry only after identifying whether the failure is repository, dependency, configuration, Gradle, packaging, signing or artifact related."]
];
export default function Docs(){const [q,setQ]=useState("");const items=useMemo(()=>docs.filter(([t,d])=>(t+" "+d).toLowerCase().includes(q.toLowerCase())),[q]);return <div className="page"><div className="eyebrow">DOCUMENTATION</div><h1 className="title">Docs & Guide</h1><p className="sub">Understand the complete WyBuild workflow without leaving the app.</p><input className="search" placeholder="Search WyBuild documentation" value={q} onChange={e=>setQ(e.target.value)}/>{items.map(([t,d])=><section className="doc" key={t}><h2>{t}</h2><p>{d}</p></section>)}{!items.length&&<div className="card">No matching documentation.</div>}</div>}