import React from 'react';

const features = [
  {
    title: 'Automatic project detection',
    icon: '🧠',
    summary: 'Detect Flutter, Android/Gradle, Next.js, Vite/React, Node web and vanilla HTML projects.',
    how: 'The GitHub workflow inspects the repository for pubspec.yaml, Gradle wrappers, package.json and HTML entry files, then selects the matching build toolchain. You can also explicitly choose APK, AAB or Web.'
  },
  {
    title: 'Flutter APK & AAB builds',
    icon: '🦋',
    summary: 'Build modern Flutter Android projects directly from GitHub.',
    how: 'WyBuild installs a stable Flutter SDK, runs flutter pub get, then uses flutter build apk or flutter build appbundle. Current Flutter projects using the recommended Gradle Plugin DSL are supported.'
  },
  {
    title: 'Web project builds',
    icon: '💻',
    summary: 'Build Vite, React, Next.js, Node-based and plain HTML projects.',
    how: 'Node projects use the repository lockfile/package manager and npm run build when available. Next.js output is packaged separately, while Vite/React builds package dist/build output. Plain HTML projects are packaged without requiring Node.'
  },
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
    summary: 'Preserve the project's existing Android icon configuration during the build.',
    how: 'WyBuild does not invent an icon. It builds the repository as supplied, so an existing Android icon/resource configuration is retained by Gradle or Flutter.'
  },
  {
    title: 'Splash screen',
    icon: '✨',
    summary: 'Preserve the project's existing Android/Flutter launch-screen configuration.',
    how: 'WyBuild builds the existing project configuration. If the Android or Flutter project already defines a splash/launch screen, the generated app uses that configuration.'
  },
  {
    title: 'WebView / PWA wrapper',
    icon: '🌐',
    summary: 'Build web projects directly, or build an existing Android wrapper project.',
    how: 'For Vite, React, Next.js and vanilla projects, WyBuild runs the project build and uploads the web output. For Android projects, WyBuild builds the Android project as-is; it does not secretly convert a website into a WebView app.'
  },
  {
    title: 'Internet permission',
    icon: '📡',
    summary: 'Allow the Android wrapper to reach online content and APIs.',
    how: 'The Android manifest includes the network permission required for an online WebView application.'
  },
  {
    title: 'Existing Android behavior',
    icon: '↩️',
    summary: 'Keep the repository's existing Android navigation behavior intact.',
    how: 'WyBuild does not inject navigation code. Any back-button/WebView behavior comes from the project being built.'
  },
  {
    title: 'Loading & error handling',
    icon: '🛟',
    summary: 'Expose build and packaging failures instead of hiding them.',
    how: 'GitHub Actions stops on failed commands and exposes the original logs, so dependency, compiler, Gradle, Flutter and packaging failures can be diagnosed directly.'
  },
  {
    title: 'GitHub Actions automation',
    icon: '⚙️',
    summary: 'Builds happen in GitHub instead of on the user's phone or computer.',
    how: 'WyBuild installs the appropriate workflow into the selected repository. GitHub Actions checks out the project, detects the technology, prepares Java/Flutter/Node as needed, builds it and uploads the correct artifact.'
  },
  {
    title: 'Multi-stack project validation',
    icon: '🔍',
    summary: 'Catch common setup problems across Android, Flutter and web projects before they become mysterious failures.',
    how: 'The workflow checks for the expected project markers and reports useful diagnostics for missing wrappers, dependencies, SDK components, package-manager lockfiles, build scripts and other build failures.'
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
