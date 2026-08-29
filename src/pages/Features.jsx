import React from 'react';

const features = [
  {
    title: 'Android APK generation',
    icon: '📦',
    summary: 'Turn a compatible Android project into an installable APK.',
    how: 'WyBuild creates or uses the Android build workflow in the connected GitHub repository. GitHub Actions runs Gradle and publishes the resulting APK as a build artifact.'
  },
  {
    title: 'App name & package configuration',
    icon: '🏷️',
    summary: 'Keep the generated Android app identified correctly.',
    how: 'The Android project configuration supplies the application name and package/application ID used by the build. WyBuild does not invent unrelated app features.'
  },
  {
    title: 'App icon',
    icon: '🖼️',
    summary: 'Use the project artwork for the installed app where the Android template supports it.',
    how: 'Icon assets are placed into the Android resources/template and referenced by the application manifest.'
  },
  {
    title: 'Splash screen',
    icon: '✨',
    summary: 'Give the Android wrapper a proper startup experience.',
    how: 'The Android wrapper can display its configured launch screen while the web application is loading.'
  },
  {
    title: 'WebView / PWA wrapper',
    icon: '🌐',
    summary: 'Package a compatible web app inside an Android application.',
    how: 'The Android shell loads the web application in a WebView. Web functionality still depends on the original site, APIs, browser support and network availability.'
  },
  {
    title: 'Internet permission',
    icon: '📡',
    summary: 'Allow the Android wrapper to reach online content and APIs.',
    how: 'The Android manifest includes the network permission required for an online WebView application.'
  },
  {
    title: 'Android back-button handling',
    icon: '↩️',
    summary: 'Make the Android back button behave more naturally in the web app.',
    how: 'The wrapper can navigate backward through WebView history before exiting when there is no page history left.'
  },
  {
    title: 'Loading & error handling',
    icon: '🛟',
    summary: 'Avoid confusing blank screens when loading fails.',
    how: 'The wrapper can detect loading/network failures and show an error state instead of silently leaving the user with a blank page.'
  },
  {
    title: 'GitHub Actions automation',
    icon: '⚙️',
    summary: 'Builds happen in GitHub instead of on the user's phone or computer.',
    how: 'WyBuild installs the appropriate workflow into the selected repository. GitHub Actions checks out the project, prepares Java/Gradle and runs the Android build.'
  },
  {
    title: 'Gradle & project validation',
    icon: '🔍',
    summary: 'Catch common project setup problems before they become mysterious failures.',
    how: 'The workflow checks for the Gradle wrapper and reports useful diagnostics for missing wrappers, dependencies, SDK components, manifest errors and other build failures.'
  },
  {
    title: 'APK build artifacts',
    icon: '⬇️',
    summary: 'Get the generated APK from the GitHub Actions run.',
    how: 'After a successful build, GitHub Actions uploads the APK as an artifact so it can be downloaded from the workflow run.'
  },
  {
    title: 'Release-ready AAB support',
    icon: '🚀',
    summary: 'Android App Bundles can be produced by compatible Android projects.',
    how: 'AAB generation is handled by the Android/Gradle project and workflow. WyBuild packages the build process; it does not automatically publish the app to Google Play.'
  },
  {
    title: 'Build timeouts & concurrency',
    icon: '⏱️',
    summary: 'Prevent stuck or duplicate workflows from wasting build resources.',
    how: 'The hardened workflow has a build timeout and concurrency controls so stale or overlapping runs can be managed safely.'
  },
  {
    title: 'Artifact retention',
    icon: '🧹',
    summary: 'Old build artifacts do not need to live forever.',
    how: 'Workflow artifacts use a limited retention period, reducing unnecessary long-term storage accumulation in GitHub Actions.'
  },
  {
    title: 'Security-conscious builds',
    icon: '🔐',
    summary: 'Keep GitHub credentials and build secrets out of frontend code and logs.',
    how: 'WyBuild is designed around least-privilege GitHub access and server/workflow secrets rather than exposing sensitive credentials in the browser.'
  },
  {
    title: 'Clear troubleshooting path',
    icon: '🧭',
    summary: 'Know whether a failure comes from your project, configuration or the build system.',
    how: 'Build failures can be narrowed to repository, dependency, configuration, Gradle, Android packaging, signing or artifact stages using the original GitHub Actions logs.'
  }
];

export default function Features(){
  const [open, setOpen] = React.useState(null);
  const [q, setQ] = React.useState('');
  const filtered = features.filter(f => (f.title + ' ' + f.summary + ' ' + f.how).toLowerCase().includes(q.toLowerCase()));

  return <div className="page">
    <div className="eyebrow">WYBUILD / FEATURES</div>
    <h1 className="title">What WyBuild adds to your build</h1>
    <p className="sub">A plain-English guide to the features included in the WyBuild build pipeline and what each one actually does.</p>
    <input className="search" placeholder="Search features" value={q} onChange={e=>setQ(e.target.value)} aria-label="Search features" />
    <div className="feature-list">
      {filtered.map((f,i)=><div className={'feature-item'+(open===i?' expanded':'')} key={f.title}>
        <button className="feature-toggle" onClick={()=>setOpen(open===i?null:i)} aria-expanded={open===i}>
          <span className="feature-icon" aria-hidden="true">{f.icon}</span>
          <span className="feature-copy"><strong>{f.title}</strong><span>{f.summary}</span></span>
          <span className="feature-chevron" aria-hidden="true">{open===i?'−':'+'}</span>
        </button>
        {open===i && <div className="feature-detail"><b>How it works</b><p>{f.how}</p></div>}
      </div>)}
    </div>
    {!filtered.length && <div className="card"><h3>No matching features</h3><p className="muted">Try a different search term.</p></div>}
    <div className="notice">Important: WyBuild packages and automates the Android build process. It does not automatically add Firebase, payments, ads, push notifications, authentication or other application-specific services unless those are already part of the project.</div>
  </div>
}
