import crypto from 'node:crypto';
import { kv } from '@vercel/kv';
import AdmZip from 'adm-zip';

const COOKIE = 'wybuild_session';
const STATE_COOKIE = 'wybuild_oauth_state';
const GH = 'https://api.github.com';
const SESSION_DAYS = 7;
const MAX_REPO_PAGES = 20;
const MAX_BRANCH_PAGES = 20;
const MAX_RUN_PAGES = 10;
const MAX_RELEASE_PAGES = 10;
const DEFAULT_FREE_LIMIT = 5;
const activeBuildLocks = new Map();

// A GitHub Actions run can get stuck reporting status=in_progress and never
// transition to completed (a lost runner, a GitHub-side hiccup, a job killed
// out-of-band). Without a cutoff, a single stuck run would reserve a quota
// slot forever and could make a plan look "full" even with zero successful
// builds. Anything still in_progress after this many hours is treated as
// abandoned and excluded from the reserved-slot count.
const STALE_ACTIVE_HOURS = 3;

// How many builds a plan may have in flight (queued/in_progress) at once,
// independent of the monthly successful-build quota. Paid plans can run
// several builds in parallel instead of waiting for one to finish.
const PLAN_CONCURRENCY = { FREE: 1, PRO: 5, 'PRO+': 15, PROPLUS: 15 };
const FREE_NATIVE_FEATURES = ['INTERNET', 'JAVASCRIPT', 'DOM_STORAGE', 'BACK_BUTTON', 'FILE_PICKER', 'SHARE', 'VIBRATION', 'ORIENTATION', 'BATTERY', 'NETWORK_STATUS', 'DEVICE_INFO', 'LOCAL_NOTIFICATIONS'];
const PRO_NATIVE_FEATURES = ['CAMERA_MIC', 'LOCATION', 'DOWNLOADS', 'EXTERNAL_LINKS', 'FULLSCREEN', 'BIOMETRIC', 'SECURE_STORAGE', 'SCREEN_CAPTURE', 'PICTURE_IN_PICTURE', 'DEEP_LINKS'];
const ALL_NATIVE_FEATURES = [...FREE_NATIVE_FEATURES, ...PRO_NATIVE_FEATURES];

function normalizeNativeFeatures(value, plan) {
  const p = String(plan || 'FREE').toUpperCase();
  const requested = typeof value === 'string'
    ? value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean)
    : [];
  const base = [...FREE_NATIVE_FEATURES];
  const allowedPremium = ['PRO', 'PRO+', 'PROPLUS'].includes(p) ? PRO_NATIVE_FEATURES : [];
  const selected = [...new Set([...base, ...requested])]
    .filter(x => ALL_NATIVE_FEATURES.includes(x) && (FREE_NATIVE_FEATURES.includes(x) || allowedPremium.includes(x)));
  return selected;
}

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const urlOf = req => new URL(req.url, `http://${req.headers.host}`);

async function body(req) {
  let s = '';
  for await (const c of req) s += c;
  if (!s) return {};
  try { return JSON.parse(s); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

function key() {
  return crypto.createHash('sha256')
    .update(process.env.SESSION_SECRET || 'development-only-change-me')
    .digest();
}

function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const raw = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + SESSION_DAYS * 86400000 }));
  const enc = Buffer.concat([cipher.update(raw), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(x => x.toString('base64url')).join('.');
}

function unseal(v) {
  try {
    const [a, b, c] = v.split('.');
    if (!a || !b || !c) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(a, 'base64url'));
    decipher.setAuthTag(Buffer.from(b, 'base64url'));
    const x = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(c, 'base64url')),
      decipher.final()
    ]));
    return x.exp > Date.now() ? x : null;
  } catch {
    return null;
  }
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .filter(Boolean)
      .map(x => {
        const i = x.indexOf('=');
        return [i < 0 ? x.trim() : x.slice(0, i).trim(), decodeURIComponent(i < 0 ? '' : x.slice(i + 1))];
      })
  );
}

function session(req) {
  const v = cookies(req)[COOKIE];
  return v ? unseal(v) : null;
}

function setCookie(res, name, value, maxAge = 604800) {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  const existing = res.getHeader('Set-Cookie');
  const values = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...values, cookie]);
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0);
}

async function gh(path, token, options = {}) {
  const r = await fetch(GH + path, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); }
  catch { data = { message: text }; }

  if (!r.ok) {
    const error = Object.assign(
      new Error(data.message || `GitHub request failed (${r.status})`),
      { status: r.status, data }
    );
    if (r.headers.get('x-ratelimit-remaining') === '0') error.rateLimited = true;
    throw error;
  }
  return data;
}

function withPage(path, page, perPage = 100) {
  const u = new URL(path, 'https://wybuild.internal');
  u.searchParams.set('per_page', String(perPage));
  u.searchParams.set('page', String(page));
  return `${u.pathname}${u.search}`;
}

async function ghList(path, token, { keyName = null, maxPages = 10, perPage = 100 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await gh(withPage(path, page, perPage), token);
    const items = keyName ? (Array.isArray(data?.[keyName]) ? data[keyName] : []) : (Array.isArray(data) ? data : []);
    out.push(...items);
    if (items.length < perPage) break;
  }
  return out;
}

const configured = () => !!(
  process.env.GITHUB_CLIENT_ID &&
  process.env.GITHUB_CLIENT_SECRET &&
  process.env.SESSION_SECRET
);

function callback(req) {
  const u = urlOf(req);
  const base = (process.env.APP_URL || `${u.protocol}//${u.host}`).replace(/\/$/, '');
  return `${base}/api/auth/github/callback`;
}

function appBase(req) {
  const u = urlOf(req);
  return (process.env.APP_URL || `${u.protocol}//${u.host}`).replace(/\/$/, '');
}

function requireSession(req, res) {
  const s = session(req);
  if (!s) {
    json(res, 401, { error: 'GitHub connection required', code: 'AUTH_REQUIRED' });
    return null;
  }
  return s;
}

function safePart(value, label) {
  if (typeof value !== 'string' || !value || value.length > 200) {
    throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  }
  return value;
}

async function wydevEntitlement(s) {
  const api = process.env.WYDEV_BILLING_API_URL?.replace(/\/$/, '');
  if (!api) return { configured: false, plan: 'FREE', buildLimit: DEFAULT_FREE_LIMIT };

  const r = await fetch(`${api}/entitlement`, {
    headers: {
      Authorization: `Bearer ${process.env.WYDEV_BILLING_SERVICE_TOKEN || ''}`,
      'X-GitHub-User': s.user.login,
      'X-GitHub-User-Id': String(s.user.id)
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(
      new Error(d.message || d.error || 'WyDev billing service unavailable'),
      { status: 502 }
    );
  }

  const plan = String(d.plan || 'FREE').toUpperCase();
  const planDefaults = { FREE: 5, PRO: 50, 'PRO+': 200, PROPLUS: 200 };
  const parsedLimit = Number(d.buildLimit);
  return {
    configured: true,
    ...d,
    plan,
    buildLimit: Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : (planDefaults[plan] ?? DEFAULT_FREE_LIMIT)
  };
}

function monthStartISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function countMonthlyBuilds(s) {
  const repos = await ghList('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member', s.token, {
    maxPages: MAX_REPO_PAGES,
    perPage: 100
  });
  if (!Array.isArray(repos)) {
    throw Object.assign(new Error('GitHub returned an invalid repository list.'), { status: 502 });
  }

  const created = encodeURIComponent(`>=${monthStartISO()}`);
  let successful = 0;
  let active = 0;

  // Query successful and active runs separately. This is both more accurate
  // and cheaper than paging through every failed/cancelled run. A failed build
  // never consumes quota; an active build temporarily reserves a slot, unless
  // it has been in_progress past STALE_ACTIVE_HOURS (see constant above).
  //
  // Fail closed if GitHub cannot inspect a repository. Treating an API error
  // as zero builds could undercount usage and allow a monthly quota bypass.
  for (let i = 0; i < repos.length; i += 5) {
    const chunk = repos.slice(i, i + 5);
    const results = await Promise.all(chunk.map(async repo => {
      if (!repo?.owner?.login || !repo?.name) {
        throw Object.assign(new Error('GitHub returned an invalid repository record.'), { status: 502 });
      }

      const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/actions/runs`;
      const [successRuns, activeRuns] = await Promise.all([
        ghList(`${base}?created=${created}&conclusion=success`, s.token, {
          keyName: 'workflow_runs', maxPages: 1, perPage: 100
        }),
        ghList(`${base}?created=${created}&status=in_progress`, s.token, {
          keyName: 'workflow_runs', maxPages: 1, perPage: 100
        })
      ]);

      const staleCutoff = Date.now() - STALE_ACTIVE_HOURS * 3600000;
      return {
        successful: successRuns.filter(run => run.name === 'WyBuild').length,
        active: activeRuns.filter(run => run.name === 'WyBuild' && new Date(run.created_at).getTime() > staleCutoff).length
      };
    }));

    for (const result of results) {
      successful += result.successful;
      active += result.active;
    }
  }

  const ledgerSuccessful = await countLedgerThisMonth(s);
  return { successful: successful + ledgerSuccessful, active, reserved: successful + ledgerSuccessful + active };
}

// --- Deleted-run quota ledger --------------------------------------------
// Deleting a run from GitHub normally makes it vanish from countMonthlyBuilds,
// which would let anyone bypass their monthly quota by deleting successful
// runs. To keep deleted successful runs counted, each deletion increments a
// per-user, per-month counter in Vercel KV, keyed to the month the run was
// originally created in (not the month it was deleted), so it lines up with
// countMonthlyBuilds' own `created` filtering.
function ledgerKey(login, date) {
  const d = new Date(date);
  const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `wybuild:ledger:${login}:${monthKey}`;
}

// Called BEFORE the GitHub delete call - if the KV write succeeds but the
// delete itself then fails, the run is briefly over-counted rather than
// under-counted, matching this codebase's existing fail-closed stance on
// quota accuracy (see countMonthlyBuilds). Errors propagate so a KV outage
// blocks the delete rather than silently letting quota go uncounted.
async function recordDeletedRun(s, { createdAt }) {
  const key = ledgerKey(s.user.login, createdAt);
  await kv.incr(key);
  await kv.expire(key, 60 * 24 * 3600); // ~60 days - covers the month plus buffer
}

async function countLedgerThisMonth(s) {
  const key = ledgerKey(s.user.login, new Date());
  const val = await kv.get(key);
  return Number(val) || 0;
}


// Bump this whenever WORKFLOW's content changes materially (action versions,
// validation logic, build steps, etc). It's embedded as a YAML comment in the
// installed file so /api/github/workflow can tell an already-installed repo
// apart from one running an older generation of the template.
const WORKFLOW_VERSION = 8;

const WORKFLOW = "# wybuild-workflow-version: 8\nname: WyBuild\non:\n  workflow_dispatch:\n    inputs:\n      build_type:\n        description: Build target\n        required: true\n        type: choice\n        options:\n          - auto\n          - apk\n          - aab\n          - web\n        default: auto\n      build_mode:\n        description: Build mode\n        required: true\n        type: choice\n        options:\n          - debug\n          - release\n        default: release\n      native_features:\n        description: Native Web-to-APK features (managed by WyBuild)\n        required: false\n        type: string\n        default: free\n\nrun-name: \"WyBuild: ${{ inputs.build_type }} (${{ inputs.build_mode }}) [${{ inputs.native_features }}] on ${{ github.ref_name }}\"\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: wybuild-${{ github.repository }}-${{ github.ref }}-${{ inputs.build_type }}-${{ inputs.build_mode }}\n  cancel-in-progress: false\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    timeout-minutes: 60\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v6\n\n      - name: Detect project type\n        id: detect\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [ -f pubspec.yaml ]; then\n            type=flutter\n          elif find . -type f -name gradlew -not -path './.git/*' -not -path '*/node_modules/*' | grep -q .; then\n            type=gradle\n          elif [ -f package.json ]; then\n            if node -e \"const p=require('./package.json'); process.exit(p.dependencies?.next || p.devDependencies?.next ? 0 : 1)\"; then\n              type=next\n            else\n              type=node-web\n            fi\n          elif find . -maxdepth 3 -type f \\( -name 'index.html' -o -name '*.html' \\) -not -path './.git/*' | grep -q .; then\n            type=vanilla\n          else\n            type=unknown\n          fi\n          echo \"type=$type\" >> \"$GITHUB_OUTPUT\"\n          echo \"Detected project type: $type\"\n\n      - name: Validate requested target\n        shell: bash\n        env:\n          REQUESTED: ${{ inputs.build_type }}\n          DETECTED: ${{ steps.detect.outputs.type }}\n        run: |\n          set -euo pipefail\n          if [ \"$DETECTED\" = \"unknown\" ]; then\n            echo \"::error title=Unsupported project::WyBuild could not detect a supported project.\"\n            exit 1\n          fi\n          if [ \"$REQUESTED\" = \"aab\" ] && [ \"$DETECTED\" != \"flutter\" ] && [ \"$DETECTED\" != \"gradle\" ] && [ \"$DETECTED\" != \"node-web\" ] && [ \"$DETECTED\" != \"vanilla\" ]; then\n            echo \"::error title=AAB unavailable::AAB builds require Flutter, Android/Gradle, or a static web project. Detected: $DETECTED\"\n            exit 1\n          fi\n          if [ \"$REQUESTED\" = \"apk\" ] && [ \"$DETECTED\" != \"flutter\" ] && [ \"$DETECTED\" != \"gradle\" ] && [ \"$DETECTED\" != \"node-web\" ] && [ \"$DETECTED\" != \"vanilla\" ]; then\n            echo \"::error title=APK target unavailable::APK builds support Flutter, Android/Gradle, Vite/React/Node and vanilla HTML. Next.js needs a static export or an existing Android wrapper.\"\n            exit 1\n          fi\n          if [ \"$REQUESTED\" = \"web\" ] && { [ \"$DETECTED\" = \"flutter\" ] || [ \"$DETECTED\" = \"gradle\" ]; }; then\n            echo \"::error title=Web target unavailable::Web builds require a web project.\"\n            exit 1\n          fi\n\n      - name: Set up Java\n        if: steps.detect.outputs.type == 'flutter' || steps.detect.outputs.type == 'gradle' || ((inputs.build_type == 'apk' || inputs.build_type == 'aab') && (steps.detect.outputs.type == 'node-web' || steps.detect.outputs.type == 'vanilla'))\n        uses: actions/setup-java@v5\n        with:\n          distribution: temurin\n          java-version: '17'\n          cache: gradle\n\n      - name: Set up Flutter\n        if: steps.detect.outputs.type == 'flutter'\n        uses: subosito/flutter-action@v2.23.0\n        with:\n          channel: stable\n          cache: true\n\n      - name: Build Flutter Android\n        if: steps.detect.outputs.type == 'flutter' && (inputs.build_type == 'apk' || inputs.build_type == 'aab' || inputs.build_type == 'auto')\n        shell: bash\n        run: |\n          set -euo pipefail\n          flutter pub get\n          if [ \"${{ inputs.build_type }}\" = \"aab\" ]; then\n            flutter build appbundle --release\n          elif [ \"${{ inputs.build_type }}\" = \"apk\" ]; then\n            if [ \"${{ inputs.build_mode }}\" = \"debug\" ]; then flutter build apk --debug; else flutter build apk --release; fi\n          else\n            flutter build apk --release\n          fi\n\n      - name: Build existing Gradle Android project\n        if: steps.detect.outputs.type == 'gradle' && (inputs.build_type == 'apk' || inputs.build_type == 'aab' || inputs.build_type == 'auto')\n        shell: bash\n        run: |\n          set -euo pipefail\n          wrapper=\"$(find . -type f -name gradlew -not -path './.git/*' -not -path '*/node_modules/*' | head -n 1)\"\n          project_dir=\"$(dirname \"$wrapper\")\"\n          cd \"$project_dir\"\n          chmod +x ./gradlew\n          ./gradlew --version\n          if [ \"${{ inputs.build_type }}\" = \"aab\" ]; then\n            ./gradlew bundleRelease --no-daemon --stacktrace\n          elif [ \"${{ inputs.build_type }}\" = \"apk\" ]; then\n            if [ \"${{ inputs.build_mode }}\" = \"debug\" ]; then ./gradlew assembleDebug --no-daemon --stacktrace; else ./gradlew assembleRelease --no-daemon --stacktrace; fi\n          else\n            ./gradlew assembleRelease --no-daemon --stacktrace\n          fi\n\n      - name: Set up Node.js\n        if: steps.detect.outputs.type == 'next' || steps.detect.outputs.type == 'node-web'\n        uses: actions/setup-node@v6\n        with:\n          node-version: 24\n\n      - name: Install Node dependencies\n        if: steps.detect.outputs.type == 'next' || steps.detect.outputs.type == 'node-web'\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [ -f package-lock.json ]; then npm ci\n          elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile\n          elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable\n          else npm install\n          fi\n\n      - name: Build static web output\n        if: (steps.detect.outputs.type == 'node-web' || steps.detect.outputs.type == 'vanilla') && (inputs.build_type == 'web' || inputs.build_type == 'apk' || inputs.build_type == 'auto')\n        shell: bash\n        run: |\n          set -euo pipefail\n          mkdir -p wybuild-output\n          if [ \"${{ steps.detect.outputs.type }}\" = \"node-web\" ]; then\n            if node -e \"const p=require('./package.json'); process.exit(typeof p.scripts?.build === 'string' ? 0 : 1)\"; then\n              npm run build\n            fi\n          fi\n          if [ -d dist ]; then cp -R dist/. wybuild-output/\n          elif [ -d build ]; then cp -R build/. wybuild-output/\n          elif [ -f index.html ]; then\n            rsync -a --exclude node_modules --exclude .git --exclude wybuild-output ./ wybuild-output/\n          else\n            echo \"::error title=No static output::Could not find dist, build or index.html.\"\n            exit 1\n          fi\n          test -f wybuild-output/index.html || {\n            echo \"::error title=Not a static web app::The project did not produce an index.html. For Next.js use static export or an existing Android wrapper.\"\n            exit 1\n          }\n\n      - name: Build Web to Android APK wrapper\n        if: (inputs.build_type == 'apk' || inputs.build_type == 'aab') && (steps.detect.outputs.type == 'node-web' || steps.detect.outputs.type == 'vanilla')\n        shell: bash\n        env:\n          FEATURES: ${{ inputs.native_features }}\n        run: |\n          set -euo pipefail\n          FEATURES=\"${FEATURES:-free}\"\n          has_feature() {\n            local needle=\"$1\"\n            case \",${FEATURES},\" in\n              *,\"$needle\",*) return 0 ;;\n              *) return 1 ;;\n            esac\n          }\n\n          mkdir -p wybuild-wrapper/app/src/main/java/com/wybuild/wrapper\n          mkdir -p wybuild-wrapper/app/src/main/assets/www\n          mkdir -p wybuild-wrapper/app/src/main/res/values\n          cp -R wybuild-output/. wybuild-wrapper/app/src/main/assets/www/\n\n          PERMISSIONS='    <uses-permission android:name=\"android.permission.INTERNET\"/>'\n          has_feature() {\n            local needle=\"$1\"\n            case \",${FEATURES},\" in\n              *,\"$needle\",*) return 0 ;;\n              *) return 1 ;;\n            esac\n          }\n          if has_feature CAMERA_MIC; then\n            PERMISSIONS=\"$PERMISSIONS\n              <uses-permission android:name=\\\"android.permission.CAMERA\\\"/>\n              <uses-permission android:name=\\\"android.permission.RECORD_AUDIO\\\"/>\"\n          fi\n          if has_feature LOCATION; then\n            PERMISSIONS=\"$PERMISSIONS\n              <uses-permission android:name=\\\"android.permission.ACCESS_COARSE_LOCATION\\\"/>\n              <uses-permission android:name=\\\"android.permission.ACCESS_FINE_LOCATION\\\"/>\"\n          fi\n          if has_feature VIBRATION; then PERMISSIONS=\"$PERMISSIONS\n              <uses-permission android:name=\\\"android.permission.VIBRATE\\\"/>\"; fi\n          if has_feature LOCAL_NOTIFICATIONS; then PERMISSIONS=\"$PERMISSIONS\n              <uses-permission android:name=\\\"android.permission.POST_NOTIFICATIONS\\\"/>\"; fi\n\n          CAMERA=false; LOCATION=false; DOWNLOADS=false; EXTERNAL_LINKS=false; FULLSCREEN=false\n          SHARE=false; VIBRATION=false; ORIENTATION=false; BATTERY=false; NETWORK_STATUS=false; DEVICE_INFO=false; LOCAL_NOTIFICATIONS=false\n          BIOMETRIC=false; SECURE_STORAGE=false; SCREEN_CAPTURE=false; PICTURE_IN_PICTURE=false; DEEP_LINKS=false\n          has_feature CAMERA_MIC && CAMERA=true || true; has_feature LOCATION && LOCATION=true || true\n          has_feature DOWNLOADS && DOWNLOADS=true || true; has_feature EXTERNAL_LINKS && EXTERNAL_LINKS=true || true\n          has_feature FULLSCREEN && FULLSCREEN=true || true; has_feature SHARE && SHARE=true || true\n          has_feature VIBRATION && VIBRATION=true || true; has_feature ORIENTATION && ORIENTATION=true || true\n          has_feature BATTERY && BATTERY=true || true; has_feature NETWORK_STATUS && NETWORK_STATUS=true || true\n          has_feature DEVICE_INFO && DEVICE_INFO=true || true; has_feature LOCAL_NOTIFICATIONS && LOCAL_NOTIFICATIONS=true || true\n          has_feature BIOMETRIC && BIOMETRIC=true || true; has_feature SECURE_STORAGE && SECURE_STORAGE=true || true\n          has_feature SCREEN_CAPTURE && SCREEN_CAPTURE=true || true; has_feature PICTURE_IN_PICTURE && PICTURE_IN_PICTURE=true || true\n          has_feature DEEP_LINKS && DEEP_LINKS=true || true\n\n          BIOMETRIC_DEP=''\n          if [ \"$BIOMETRIC\" = true ]; then BIOMETRIC_DEP='implementation \"androidx.biometric:biometric:1.1.0\"'; fi\n\n          cat > wybuild-wrapper/settings.gradle <<'EOF'\n          pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\n          dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\n          rootProject.name = \"WyBuildWebWrapper\"\n          include(\":app\")\n          EOF\n          cat > wybuild-wrapper/build.gradle <<'EOF'\n          plugins { id 'com.android.application' version '8.7.3' apply false }\n          EOF\n          cat > wybuild-wrapper/app/build.gradle <<EOF\n          plugins { id 'com.android.application' }\n          android { namespace 'com.wybuild.wrapper'; compileSdk 35\n            defaultConfig { applicationId 'com.wybuild.wrapper'; minSdk 23; targetSdk 35; versionCode 1; versionName '1.0' }\n          }\n          dependencies { implementation \"androidx.biometric:biometric:1.1.0\" }\n          EOF\n          cat > wybuild-wrapper/app/src/main/res/values/styles.xml <<'EOF'\n          <resources><style name=\"AppTheme\" parent=\"android:style/Theme.Material.Light.NoActionBar\"><item name=\"android:fontFamily\">sans</item><item name=\"android:colorAccent\">#4F46E5</item></style></resources>\n          EOF\n          DEEP_FILTER=''\n          if [ \"$DEEP_LINKS\" = true ]; then DEEP_FILTER='<intent-filter><action android:name=\"android.intent.action.VIEW\"/><category android:name=\"android.intent.category.DEFAULT\"/><category android:name=\"android.intent.category.BROWSABLE\"/><data android:scheme=\"wybuild\"/></intent-filter>'; fi\n          PIP_ATTR=''\n          if [ \"$PICTURE_IN_PICTURE\" = true ]; then PIP_ATTR='android:supportsPictureInPicture=\"true\"'; fi\n          cat > wybuild-wrapper/app/src/main/AndroidManifest.xml <<EOF\n          <manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">\n          $PERMISSIONS\n            <application android:theme=\"@style/AppTheme\" android:label=\"WyBuild App\" android:usesCleartextTraffic=\"false\" android:hardwareAccelerated=\"true\" android:supportsRtl=\"true\">\n              <activity android:name=\".MainActivity\" android:exported=\"true\" android:screenOrientation=\"unspecified\" $PIP_ATTR>\n                <intent-filter><action android:name=\"android.intent.action.MAIN\"/><category android:name=\"android.intent.category.LAUNCHER\"/></intent-filter>\n                $DEEP_FILTER\n              </activity>\n            </application>\n          </manifest>\n          EOF\n          cat > wybuild-wrapper/app/src/main/java/com/wybuild/wrapper/MainActivity.java <<EOF\n          package com.wybuild.wrapper;\n          import android.Manifest; import android.app.*; import android.content.*; import android.content.pm.ActivityInfo; import android.net.*; import android.os.*; import android.provider.Settings; import android.view.View; import android.webkit.*; import android.widget.Toast; import androidx.biometric.BiometricPrompt; import androidx.core.content.ContextCompat; import java.util.Locale; import java.security.KeyStore; import javax.crypto.Cipher; import javax.crypto.KeyGenerator; import javax.crypto.SecretKey; import javax.crypto.spec.GCMParameterSpec; import android.util.Base64;\n          public class MainActivity extends Activity {\n            private static final int FILE_CHOOSER=1001; private WebView web; private ValueCallback<Uri[]> fileCallback;\n            private final boolean CAMERA=$CAMERA, LOCATION=$LOCATION, DOWNLOADS=$DOWNLOADS, EXTERNAL_LINKS=$EXTERNAL_LINKS, FULLSCREEN=$FULLSCREEN;\n            private final boolean SHARE=$SHARE, VIBRATION=$VIBRATION, ORIENTATION=$ORIENTATION, BATTERY=$BATTERY, NETWORK_STATUS=$NETWORK_STATUS, DEVICE_INFO=$DEVICE_INFO, LOCAL_NOTIFICATIONS=$LOCAL_NOTIFICATIONS;\n            private final boolean BIOMETRIC=$BIOMETRIC, SECURE_STORAGE=$SECURE_STORAGE, SCREEN_CAPTURE=$SCREEN_CAPTURE, PICTURE_IN_PICTURE=$PICTURE_IN_PICTURE, DEEP_LINKS=$DEEP_LINKS;\n            @Override public void onCreate(Bundle state){ super.onCreate(state); if(SCREEN_CAPTURE)getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,WindowManager.LayoutParams.FLAG_SECURE); setup(); }\n            private void setup(){ web=new WebView(this); WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true); s.setMediaPlaybackRequiresUserGesture(false); CookieManager.getInstance().setAcceptCookie(true); web.addJavascriptInterface(new WyBridge(),\"WyBuild\");\n              web.setWebViewClient(new WebViewClient(){ @Override public boolean shouldOverrideUrlLoading(WebView v,String url){ if(DEEP_LINKS&&url.startsWith(\"wybuild://\")){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}return true;} if(EXTERNAL_LINKS&&(url.startsWith(\"http://\")||url.startsWith(\"https://\"))){try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));return true;}catch(Exception ignored){}} return false; }});\n              web.setWebChromeClient(new WebChromeClient(){ @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams p){fileCallback=cb;try{startActivityForResult(p.createIntent(),FILE_CHOOSER);}catch(Exception e){fileCallback=null;cb.onReceiveValue(null);}return true;} @Override public void onPermissionRequest(PermissionRequest r){if(CAMERA)r.grant(r.getResources());else r.deny();} @Override public void onGeolocationPermissionsShowPrompt(String o,GeolocationPermissions.Callback c){c.invoke(o,LOCATION,false);} });\n              if(DOWNLOADS)web.setDownloadListener((url,ua,cd,mime,len)->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}}); if(FULLSCREEN)web.setSystemUiVisibility(5894); setContentView(web); web.loadUrl(\"file:///android_asset/www/index.html\");\n              if(CAMERA)requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},2001); if(LOCATION)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},2002); if(LOCAL_NOTIFICATIONS&&Build.VERSION.SDK_INT>=33)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},2003);\n            }\n            @Override protected void onActivityResult(int r,int c,Intent d){super.onActivityResult(r,c,d);if(r==FILE_CHOOSER&&fileCallback!=null){Uri[] x=c==RESULT_OK&&d!=null&&d.getData()!=null?new Uri[]{d.getData()}:null;fileCallback.onReceiveValue(x);fileCallback=null;}}\n            @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}\n            public class WyBridge {\n              @JavascriptInterface public void vibrate(int ms){if(!VIBRATION)return;Vibrator v=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(v!=null){if(Build.VERSION.SDK_INT>=26)v.vibrate(VibrationEffect.createOneShot(Math.max(1,Math.min(ms,2000)),VibrationEffect.DEFAULT_AMPLITUDE));else v.vibrate(ms);}}\n              @JavascriptInterface public void share(String text){if(!SHARE)return;Intent i=new Intent(Intent.ACTION_SEND);i.setType(\"text/plain\");i.putExtra(Intent.EXTRA_TEXT,text);startActivity(Intent.createChooser(i,\"Share\"));}\n              @JavascriptInterface public String battery(){if(!BATTERY)return \"disabled\";BatteryManager b=(BatteryManager)getSystemService(BATTERY_SERVICE);return String.valueOf(b.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));}\n              @JavascriptInterface public String network(){if(!NETWORK_STATUS)return \"disabled\";ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);Network n=cm.getActiveNetwork();NetworkCapabilities c=n==null?null:cm.getNetworkCapabilities(n);if(c==null)return \"offline\";if(c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return \"wifi\";if(c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR))return \"cellular\";return \"online\";}\n              @JavascriptInterface public String device(){if(!DEVICE_INFO)return \"disabled\";return Build.MANUFACTURER+\" \"+Build.MODEL+\" Android \"+Build.VERSION.RELEASE;}\n              @JavascriptInterface public void notify(String title,String text){if(!LOCAL_NOTIFICATIONS)return;NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);String ch=\"wybuild\";if(Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel(ch,\"WyBuild Notifications\",NotificationManager.IMPORTANCE_DEFAULT));Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(MainActivity.this,ch):new Notification.Builder(MainActivity.this);b.setContentTitle(title).setContentText(text).setSmallIcon(android.R.drawable.ic_dialog_info).setAutoCancel(true);nm.notify((int)(System.currentTimeMillis()%100000),b.build());}\n              @JavascriptInterface public void setOrientation(String mode){if(!ORIENTATION)return;String m=mode==null?\"auto\":mode.toLowerCase(Locale.US);setRequestedOrientation(\"portrait\".equals(m)?ActivityInfo.SCREEN_ORIENTATION_PORTRAIT:\"landscape\".equals(m)?ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE:ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);}\n              @JavascriptInterface public void enterPictureInPicture(){if(PICTURE_IN_PICTURE&&Build.VERSION.SDK_INT>=26)try{enterPictureInPictureMode();}catch(Exception ignored){}}\n              @JavascriptInterface public String biometric(){if(!BIOMETRIC)return \"disabled\";try{BiometricPrompt p=new BiometricPrompt(MainActivity.this,ContextCompat.getMainExecutor(MainActivity.this),new BiometricPrompt.AuthenticationCallback(){});p.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle(\"Verify identity\").setSubtitle(\"WyBuild secure authentication\").setNegativeButtonText(\"Cancel\").build());return \"started\";}catch(Exception e){return \"unavailable\";}}\n              private SecretKey key() throws Exception { KeyStore ks=KeyStore.getInstance(\"AndroidKeyStore\"); ks.load(null); if(!ks.containsAlias(\"WyBuildSecureKey\")){KeyGenerator g=KeyGenerator.getInstance(\"AES\",\"AndroidKeyStore\");g.init(new android.security.keystore.KeyGenParameterSpec.Builder(\"WyBuildSecureKey\",android.security.keystore.KeyProperties.PURPOSE_ENCRYPT|android.security.keystore.KeyProperties.PURPOSE_DECRYPT).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();} return ((KeyStore.SecretKeyEntry)ks.getEntry(\"WyBuildSecureKey\",null)).getSecretKey(); }\n              @JavascriptInterface public boolean securePut(String name,String value){if(!SECURE_STORAGE||name==null)return false;try{Cipher c=Cipher.getInstance(\"AES/GCM/NoPadding\");c.init(Cipher.ENCRYPT_MODE,key());byte[] iv=c.getIV(),ct=c.doFinal((value==null?\"\":value).getBytes(java.nio.charset.StandardCharsets.UTF_8));String packed=Base64.encodeToString(iv,2)+\":\"+Base64.encodeToString(ct,2);return getSharedPreferences(\"wybuild_secure\",MODE_PRIVATE).edit().putString(name,packed).commit();}catch(Exception e){return false;}}\n              @JavascriptInterface public String secureGet(String name){if(!SECURE_STORAGE||name==null)return \"\";try{String packed=getSharedPreferences(\"wybuild_secure\",MODE_PRIVATE).getString(name,\"\");if(packed.isEmpty())return \"\";String[] p=packed.split(\":\",2);Cipher c=Cipher.getInstance(\"AES/GCM/NoPadding\");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(p[0],2)));return new String(c.doFinal(Base64.decode(p[1],2)),java.nio.charset.StandardCharsets.UTF_8);}catch(Exception e){return \"\";}}\n              @JavascriptInterface public boolean secureRemove(String name){if(!SECURE_STORAGE||name==null)return false;return getSharedPreferences(\"wybuild_secure\",MODE_PRIVATE).edit().remove(name).commit();}\n              @JavascriptInterface public void openSettings(){startActivity(new Intent(Settings.ACTION_SETTINGS));}\n            }\n          }\n          EOF\n          cd wybuild-wrapper\n          gradle wrapper --gradle-version 8.11.1\n          chmod +x gradlew\n          if [ \"${{ inputs.build_type }}\" = \"aab\" ]; then\n            ./gradlew bundleRelease --no-daemon --stacktrace\n          elif [ \"${{ inputs.build_mode }}\" = \"debug\" ]; then\n            ./gradlew assembleDebug --no-daemon --stacktrace\n          else\n            ./gradlew assembleRelease --no-daemon --stacktrace\n          fi\n\n      - name: Build Next.js web package\n        if: steps.detect.outputs.type == 'next' && (inputs.build_type == 'web' || inputs.build_type == 'auto')\n        shell: bash\n        run: |\n          set -euo pipefail\n          npm run build\n          mkdir -p wybuild-output\n          tar -czf wybuild-output/next-build.tar.gz .next public package.json 2>/dev/null || tar -czf wybuild-output/next-build.tar.gz .next package.json\n\n      - name: Package web output\n        if: inputs.build_type == 'web' || inputs.build_type == 'auto'\n        uses: actions/upload-artifact@v6\n        with:\n          name: wybuild-web-${{ github.run_number }}\n          path: 'wybuild-output/*'\n          if-no-files-found: error\n          retention-days: 7\n\n      - name: Upload APK\n        if: inputs.build_type == 'apk' || inputs.build_type == 'auto'\n        uses: actions/upload-artifact@v6\n        with:\n          name: wybuild-apk-${{ github.run_number }}\n          path: '**/build/outputs/apk/**/*.apk'\n          if-no-files-found: error\n          retention-days: 7\n\n      - name: Upload AAB\n        if: inputs.build_type == 'aab'\n        uses: actions/upload-artifact@v6\n        with:\n          name: wybuild-aab-${{ github.run_number }}\n          path: '**/build/outputs/bundle/**/*.aab'\n          if-no-files-found: error\n          retention-days: 7\n"

export default async function handler(req, res) {
  try {
    const u = urlOf(req);
    const route = u.pathname.replace(/^\/api\/?/, '');

    if (req.method === 'GET' && route === 'health') {
      return json(res, 200, { ok: true, service: 'wybuild' });
    }

    if (req.method === 'GET' && route === 'auth/github') {
      if (!configured()) {
        return json(res, 503, { error: 'GitHub authentication is not configured. Set APP_URL, SESSION_SECRET, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
      }
      const state = crypto.randomBytes(24).toString('hex');
      setCookie(res, STATE_COOKIE, state, 600);
      const p = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: callback(req),
        state,
        scope: 'read:user user:email repo workflow'
      });
      res.statusCode = 302;
      res.setHeader('Location', `https://github.com/login/oauth/authorize?${p}`);
      return res.end();
    }

    if (req.method === 'GET' && route === 'auth/github/callback') {
      if (!configured()) return json(res, 503, { error: 'GitHub authentication is not configured.' });
      const c = cookies(req);
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      if (!code || !state || state !== c[STATE_COOKIE]) {
        return json(res, 400, { error: 'GitHub connection failed: invalid OAuth state.' });
      }

      const tr = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callback(req)
        })
      });
      const token = await tr.json();
      if (!token.access_token) throw new Error(token.error_description || 'GitHub token exchange failed');

      const me = await gh('/user', token.access_token);
      setCookie(res, COOKIE, seal({
        token: token.access_token,
        user: { id: me.id, login: me.login, name: me.name, avatar: me.avatar_url }
      }));
      clearCookie(res, STATE_COOKIE);
      res.statusCode = 302;
      res.setHeader('Location', `${appBase(req)}/projects`);
      return res.end();
    }

    if (req.method === 'POST' && route === 'auth/logout') {
      clearCookie(res, COOKIE);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && route === 'auth/me') {
      const s = session(req);
      if (!s) return json(res, 200, { authenticated: false });
      try {
        const me = await gh('/user', s.token);
        return json(res, 200, { authenticated: true, user: { id: me.id, login: me.login, name: me.name, avatar: me.avatar_url } });
      } catch {
        clearCookie(res, COOKIE);
        return json(res, 401, { authenticated: false, error: 'GitHub session expired or revoked.' });
      }
    }

    const s = requireSession(req, res);
    if (!s) return;

    if (req.method === 'GET' && route === 'billing/status') {
      try {
        const d = await wydevEntitlement(s);
        // Display the same successful-build usage that the dispatch endpoint
        // enforces. Billing may expose its own usage counter, but WyBuild's
        // build quota is specifically based on successful GitHub Actions runs.
        const usage = await countMonthlyBuilds(s);
        const plan = String(d.plan || 'FREE').toUpperCase();
        return json(res, 200, {
          ...d,
          plan,
          buildsUsed: usage.successful,
          successfulBuilds: usage.successful,
          inProgressBuilds: usage.active,
          concurrencyLimit: PLAN_CONCURRENCY[plan] ?? PLAN_CONCURRENCY.FREE,
          source: 'wydev',
          billingUrl: d.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      } catch (e) {
        return json(res, e.status || 502, { error: e.message || 'WyDev billing service unavailable' });
      }
    }

    // Owner-only: wipes this month's WyBuild quota by cancelling any
    // in-progress runs and deleting this month's WyBuild workflow runs
    // (success + in-progress) across every repo the account can see. This is
    // intentionally NOT exposed to regular users - letting anyone reset their
    // own usage on demand would make the monthly build limit meaningless.
    const RESET_USAGE_OWNER = 'wytzbot';
    if (req.method === 'POST' && route === 'billing/reset-usage') {
      if (String(s.user.login || '').toLowerCase() !== RESET_USAGE_OWNER) {
        return json(res, 403, { error: 'Not authorized to reset usage.' });
      }
      try {
        const repos = await ghList('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member', s.token, {
          maxPages: MAX_REPO_PAGES,
          perPage: 100
        });
        if (!Array.isArray(repos)) {
          throw Object.assign(new Error('GitHub returned an invalid repository list.'), { status: 502 });
        }
        const created = encodeURIComponent(`>=${monthStartISO()}`);
        let deleted = 0;
        let cancelled = 0;
        let failed = 0;

        for (let i = 0; i < repos.length; i += 5) {
          const chunk = repos.slice(i, i + 5);
          await Promise.all(chunk.map(async repo => {
            const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/actions/runs`;
            let runs = [];
            try {
              const [successRuns, activeRuns] = await Promise.all([
                ghList(`${base}?created=${created}&conclusion=success`, s.token, { keyName: 'workflow_runs', maxPages: 1, perPage: 100 }),
                ghList(`${base}?created=${created}&status=in_progress`, s.token, { keyName: 'workflow_runs', maxPages: 1, perPage: 100 })
              ]);
              runs = [...successRuns, ...activeRuns].filter(run => run.name === 'WyBuild');
            } catch { return; }

            for (const run of runs) {
              // Cancelling first matters even if delete fails below - a
              // cancelled run's status is no longer in_progress, so it stops
              // reserving a quota slot immediately.
              if (run.status === 'in_progress' || run.status === 'queued') {
                try { await gh(`${base}/${run.id}/cancel`, s.token, { method: 'POST' }); cancelled += 1; } catch {}
              }
              try {
                await gh(`${base}/${run.id}`, s.token, { method: 'DELETE' });
                deleted += 1;
              } catch {
                failed += 1;
              }
            }
          }));
        }

        return json(res, 200, {
          ok: true,
          deleted,
          cancelled,
          failed,
          message: `Cleared ${deleted} run${deleted === 1 ? '' : 's'} counted toward this month's quota${failed ? ` (${failed} could not be removed - likely still finishing on GitHub's side, retry in a minute).` : '.'}`
        });
      } catch (e) {
        return json(res, e.status || 502, { error: e.message || 'Failed to reset usage.' });
      }
    }

    if (req.method === 'GET' && route === 'github/repos') {
      const repos = await ghList('/user/repos?sort=updated&affiliation=owner,collaborator,organization_member', s.token, {
        maxPages: MAX_REPO_PAGES,
        perPage: 100
      });
      return json(res, 200, repos);
    }

    if (req.method === 'GET' && route === 'github/branches') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const branches = await ghList(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/branches`, s.token, {
        maxPages: MAX_BRANCH_PAGES,
        perPage: 100
      });
      return json(res, 200, branches);
    }

    if (req.method === 'GET' && route === 'github/diagnose') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const ref = safePart(u.searchParams.get('ref'), 'ref');

      const exists = async (path) => {
        try { await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/${path}?ref=${encodeURIComponent(ref)}`, s.token); return true; }
        catch (e) { if (e.status === 404) return false; throw e; }
      };

      const [pubspec, gradlew, packageJson, indexHtml, vite, next, lockfile] = await Promise.all([
        exists('pubspec.yaml'), exists('gradlew'), exists('package.json'), exists('index.html'),
        exists('vite.config.js'), exists('next.config.js'), exists('package-lock.json')
      ]);

      let type = 'unknown';
      if (pubspec) type = 'flutter';
      else if (gradlew) type = 'gradle';
      else if (packageJson) type = next ? 'next' : 'node-web';
      else if (indexHtml) type = 'vanilla';

      const checks = [
        { label: 'Flutter pubspec.yaml', ok: pubspec },
        { label: 'Android Gradle wrapper (gradlew)', ok: gradlew },
        { label: 'package.json', ok: packageJson },
        { label: 'index.html / static entry', ok: indexHtml },
        { label: 'Vite configuration', ok: vite },
        { label: 'Next.js configuration', ok: next },
        { label: 'package-lock.json', ok: lockfile }
      ];

      const recommendation = type === 'flutter'
        ? 'Flutter APK or AAB'
        : type === 'gradle'
          ? 'Existing Android APK or AAB'
          : (type === 'node-web' || type === 'vanilla')
            ? 'Web build or Web → Android APK'
            : type === 'next'
              ? 'Web build; use static export or an existing Android wrapper for APK'
              : 'Add a supported project entry point';

      return json(res, 200, { type, checks, recommendation, ref });
    }

    if (req.method === 'GET' && route === 'github/workflow') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const ref = safePart(u.searchParams.get('ref'), 'ref');

      const repoInfo = await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}`, s.token);
      const defaultBranch = repoInfo.default_branch;
      let exists = false;
      let existsOnDefault = false;
      let upToDate = null;
      let installedVersion = null;
      try {
        const file = await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/.github/workflows/wybuild.yml?ref=${encodeURIComponent(ref)}`, s.token);
        exists = true;
        try {
          const content = Buffer.from(file.content || '', 'base64').toString('utf8');
          const match = content.match(/^#\s*wybuild-workflow-version:\s*(\d+)/m);
          installedVersion = match ? Number(match[1]) : 0;
          upToDate = installedVersion >= WORKFLOW_VERSION;
        } catch {
          // Couldn't parse the file (unexpected format) - treat as needing a refresh.
          upToDate = false;
        }
      } catch (e) {
        if (e.status !== 404) throw e;
      }
      try {
        const file = await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/contents/.github/workflows/wybuild.yml?ref=${encodeURIComponent(defaultBranch)}`, s.token);
        existsOnDefault = true;
        if (ref === defaultBranch && !exists) { exists = true; }
        try {
          const content = Buffer.from(file.content || '', 'base64').toString('utf8');
          const match = content.match(/^#\s*wybuild-workflow-version:\s*(\d+)/m);
          const defaultVersion = match ? Number(match[1]) : 0;
          if (installedVersion == null) installedVersion = defaultVersion;
          upToDate = defaultVersion >= WORKFLOW_VERSION;
        } catch { upToDate = false; }
      } catch (e) {
        if (e.status !== 404) throw e;
      }

      // File-existence on this ref isn't enough: GitHub only lets you dispatch a
      // workflow_dispatch run once the workflow is registered, which only happens once
      // the file is on the default branch. Check the real Actions registry too.
      let dispatchable = false;
      try {
        const workflows = await ghList(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/workflows`, s.token, {
          keyName: 'workflows',
          maxPages: 3,
          perPage: 100
        });
        dispatchable = workflows.some(w => w.path === '.github/workflows/wybuild.yml' && w.state === 'active');
      } catch { /* leave dispatchable false; UI will prompt to install/merge */ }

      return json(res, 200, { exists, existsOnDefault, defaultBranch, dispatchable, upToDate, installedVersion, currentVersion: WORKFLOW_VERSION });
    }


    if (req.method === 'POST' && route === 'github/install-workflow') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const ref = safePart(b.ref, 'ref');
      const branch = `wybuild/setup-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const repoInfo = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, s.token);
      const defaultBranch = repoInfo.default_branch;
      const baseRef = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(ref)}`, s.token);

      await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, s.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha })
      });

      try {
        // The new branch is cut from baseRef, so if wybuild.yml already exists there
        // (the common "installed but outdated" case), GitHub's contents API requires
        // that file's current sha to overwrite it - omitting it fails with
        // `Invalid request. "sha" wasn't supplied.`. Look it up on the branch we just
        // created (same content as baseRef) and include it when present.
        let existingSha;
        try {
          const existing = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/.github/workflows/wybuild.yml?ref=${encodeURIComponent(branch)}`, s.token);
          existingSha = existing.sha;
        } catch (e) {
          if (e.status !== 404) throw e;
        }

        await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/.github/workflows/wybuild.yml`, s.token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: existingSha ? 'chore: update WyBuild workflow' : 'chore: add WyBuild workflow',
            content: Buffer.from(WORKFLOW).toString('base64'),
            branch,
            ...(existingSha ? { sha: existingSha } : {})
          })
        });
      } catch (e) {
        // Best-effort cleanup if workflow creation fails.
        try { await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(branch)}`, s.token, { method: 'DELETE' }); } catch {}
        throw e;
      }

      // GitHub only ever registers a workflow_dispatch-triggerable workflow once the
      // file exists on the repo's default branch - a copy on a side branch is invisible
      // to the dispatch endpoint no matter what ref you pass it. Open a PR into the
      // default branch and try to merge it automatically so builds work immediately;
      // if that's blocked (branch protection, permissions, existing PR), fall back to
      // surfacing the PR link so the user can merge it themselves.
      let prUrl, merged = false;
      if (branch !== defaultBranch) {
        try {
          const pr = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, s.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Add WyBuild workflow',
              head: branch,
              base: defaultBranch,
              body: 'Adds the WyBuild GitHub Actions workflow.\n\nGitHub only allows manually-triggered (`workflow_dispatch`) workflows to run once they exist on the default branch, so this needs to be merged before WyBuild can start builds.'
            })
          });
          prUrl = pr.html_url;
          try {
            await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pr.number}/merge`, s.token, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ merge_method: 'squash' })
            });
            merged = true;
          } catch { /* protected branch, no permission, etc - user merges manually via prUrl */ }
        } catch { /* PR creation failed - still return the branch so the user can act on it */ }
      }

      return json(res, 201, {
        ok: true,
        branch,
        defaultBranch,
        prUrl,
        merged,
        message: merged
          ? 'WyBuild workflow installed and merged into the default branch. You can build now.'
          : prUrl
            ? `WyBuild workflow committed and a pull request opened into ${defaultBranch}. Merge it before building - GitHub only allows manual builds for workflows on the default branch.`
            : `WyBuild workflow committed to ${branch}, but WyBuild could not open a pull request automatically. Open one into ${defaultBranch} and merge it before building.`
      });
    }

    if (req.method === 'GET' && route === 'github/runs') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const created = u.searchParams.get('created');
      const query = created ? `?created=${encodeURIComponent(created)}` : '';
      const runs = await ghList(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs${query}`, s.token, {
        keyName: 'workflow_runs',
        maxPages: MAX_RUN_PAGES,
        perPage: 100
      });
      return json(res, 200, { total_count: runs.length, workflow_runs: runs });
    }

    if (req.method === 'GET' && route === 'github/run') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const id = safePart(u.searchParams.get('id'), 'id');
      return json(res, 200, await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}`, s.token));
    }

    if (req.method === 'POST' && route === 'github/delete-run') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const id = safePart(b.id, 'id');
      const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(id)}`;

      const run = await gh(base, s.token);
      if (run.name !== 'WyBuild') {
        return json(res, 403, { error: 'Only WyBuild runs can be deleted here.' });
      }

      if (run.status === 'in_progress' || run.status === 'queued') {
        try { await gh(`${base}/cancel`, s.token, { method: 'POST' }); } catch { /* best-effort */ }
      }

      // Record BEFORE deleting: a successful run must still count toward quota
      // even once removed from GitHub. See recordDeletedRun for the tradeoff.
      if (run.conclusion === 'success') {
        await recordDeletedRun(s, { owner, repo, runId: id, createdAt: run.created_at });
      }

      await gh(base, s.token, { method: 'DELETE' });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && route === 'github/run-failure') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const id = safePart(u.searchParams.get('id'), 'id');

      const jobsData = await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/jobs`, s.token);
      const jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
      const failedJobs = jobs.filter(j => j.conclusion === 'failure');

      const results = await Promise.all(failedJobs.map(async job => {
        const steps = Array.isArray(job.steps) ? job.steps : [];
        const failedStep = steps.find(st => st.conclusion === 'failure') || null;
        let annotations = [];
        try {
          annotations = await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/check-runs/${job.id}/annotations`, s.token);
        } catch { /* annotations best-effort - fall back to step name only */ }
        return {
          jobName: job.name,
          jobId: job.id,
          failedStep: failedStep ? { name: failedStep.name, number: failedStep.number } : null,
          annotations: (Array.isArray(annotations) ? annotations : [])
            .filter(a => a.annotation_level === 'failure')
            .map(a => ({ title: a.title || null, message: a.message || null }))
        };
      }));

      return json(res, 200, { failedJobs: results });
    }

    if (req.method === 'POST' && route === 'github/rebuild') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const ref = safePart(b.ref, 'ref');
      const buildType = ['auto','aab','apk','web'].includes(b.build_type) ? b.build_type : 'apk';
      const buildMode = b.build_mode === 'debug' ? 'debug' : 'release';
      const entitlement = await wydevEntitlement(s);
      const limit = Number(entitlement.buildLimit);
      if (!Number.isFinite(limit) || limit < 0) return json(res, 502, { error: 'Billing returned an invalid build limit.' });
      const usage = await countMonthlyBuilds(s);
      const plan = String(entitlement.plan || 'FREE').toUpperCase();
      if (usage.successful >= limit || usage.reserved >= limit) {
        return json(res, 402, {
          error: `Monthly successful-build limit reached (${usage.successful}/${limit}).`,
          code: 'BUILD_LIMIT_REACHED',
          plan, buildsUsed: usage.successful, buildLimit: limit,
          billingUrl: entitlement.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      }
      const nativeFeatures = normalizeNativeFeatures(b.native_features, plan);
      await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/wybuild.yml/dispatches`, s.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref, inputs: { build_type: buildType, build_mode: buildMode, native_features: nativeFeatures.join(',') } })
      });
      return json(res, 202, { ok: true, status: 'queued', nativeFeatures, buildLimit: limit, buildsUsed: usage.successful });
    }

    if (req.method === 'POST' && route === 'github/rerun') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const id = safePart(b.id, 'id');
      // Reruns the exact same run (same workflow_dispatch inputs) rather than a
      // fresh dispatch, since GitHub's run object doesn't expose the original
      // inputs for us to replay via a new dispatch call.
      await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(id)}/rerun`, s.token, { method: 'POST' });
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && route === 'github/artifacts') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const id = safePart(u.searchParams.get('id'), 'id');
      return json(res, 200, await gh(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/artifacts?per_page=100`, s.token));
    }

    if (req.method === 'GET' && route === 'github/artifact') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const id = safePart(u.searchParams.get('id'), 'id');
      const rr = await fetch(`${GH}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/artifacts/${encodeURIComponent(id)}/zip`, {
        headers: { Authorization: `Bearer ${s.token}`, 'X-GitHub-Api-Version': '2022-11-28' }
      });
      if (!rr.ok) return json(res, rr.status, { error: 'Artifact download unavailable' });
      const archive = new AdmZip(Buffer.from(await rr.arrayBuffer()));
      const entries = archive.getEntries().filter(e => !e.isDirectory);
      const wanted = entries.find(e => /\.(apk|aab)$/i.test(e.entryName));
      if (!wanted) return json(res, 404, { error: 'No APK or AAB file was found in this build artifact.' });
      const file = wanted.getData();
      const isAab = /\.aab$/i.test(wanted.entryName);
      const filename = wanted.entryName.split('/').pop() || (isAab ? 'app-release.aab' : 'app-release.apk');
      res.statusCode = 200;
      res.setHeader('Content-Type', isAab ? 'application/octet-stream' : 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
      res.setHeader('Content-Length', String(file.length));
      res.end(file);
      return;
    }

    if (req.method === 'GET' && route === 'github/logs') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const id = safePart(u.searchParams.get('id'), 'id');
      const rr = await fetch(`${GH}/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/actions/runs/${encodeURIComponent(id)}/logs`, {
        headers: { Authorization: `Bearer ${s.token}`, 'X-GitHub-Api-Version': '2022-11-28' }
      });
      if (!rr.ok) return json(res, rr.status, { error: 'GitHub logs unavailable' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="wybuild-logs-${id}.zip"`);
      res.end(Buffer.from(await rr.arrayBuffer()));
      return;
    }

    if (req.method === 'POST' && route === 'github/dispatch') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const ref = safePart(b.ref, 'ref');
      const inputs = b.inputs && typeof b.inputs === 'object' ? b.inputs : {};
      const buildType = ['auto','aab','apk','web'].includes(inputs.build_type) ? inputs.build_type : null;
      const buildMode = inputs.build_mode === 'release' ? 'release' : inputs.build_mode === 'debug' ? 'debug' : null;
      if (!buildType || !buildMode) return json(res, 400, { error: 'build_type must be auto/apk/aab/web and build_mode must be debug/release' });

      const entitlement = await wydevEntitlement(s);
      const limit = Number(entitlement.buildLimit);
      if (!Number.isFinite(limit) || limit < 0) return json(res, 502, { error: 'Billing returned an invalid build limit.' });

      const lockKey = `${s.user.id}:${new Date().toISOString().slice(0, 7)}`;
      if (activeBuildLocks.has(lockKey)) {
        return json(res, 409, { error: 'Another WyBuild request is already being started for this account. Wait a few seconds and retry.', code: 'BUILD_REQUEST_IN_PROGRESS' });
      }
      activeBuildLocks.set(lockKey, Date.now());

      // Only completed successful builds consume the quota. In-flight builds
      // temporarily reserve remaining slots so concurrent requests cannot
      // oversubscribe the monthly successful-build allowance.
      let usage;
      try {
        usage = await countMonthlyBuilds(s);
      } catch (e) {
        activeBuildLocks.delete(lockKey);
        throw e;
      }
      const monthlyUsed = usage.successful;
      const reserved = usage.reserved;
      const plan = String(entitlement.plan || 'FREE').toUpperCase();
      const nativeFeatures = normalizeNativeFeatures(inputs.native_features, plan);
      const concurrency = PLAN_CONCURRENCY[plan] ?? PLAN_CONCURRENCY.FREE;
      if (monthlyUsed >= limit || reserved >= limit) {
        activeBuildLocks.delete(lockKey);
        return json(res, 402, {
          error: monthlyUsed >= limit
            ? `Monthly successful-build limit reached (${monthlyUsed}/${limit}). Failed builds do not consume your quota.`
            : `All remaining successful-build slots are currently in progress (${monthlyUsed} successful, ${usage.active} in progress, ${limit} allowed). Failed builds do not consume your quota.`,
          code: 'BUILD_LIMIT_REACHED',
          plan,
          buildsUsed: monthlyUsed,
          successfulBuilds: monthlyUsed,
          inProgressBuilds: usage.active,
          buildLimit: limit,
          billingUrl: entitlement.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      }

      if (usage.active >= concurrency) {
        activeBuildLocks.delete(lockKey);
        return json(res, 402, {
          error: `${plan} allows ${concurrency} build${concurrency === 1 ? '' : 's'} in progress at once (${usage.active} running now). Wait for one to finish${plan === 'FREE' ? ', or upgrade to run builds in parallel' : ''}.`,
          code: 'CONCURRENCY_LIMIT_REACHED',
          plan,
          concurrencyLimit: concurrency,
          inProgressBuilds: usage.active,
          buildsUsed: monthlyUsed,
          buildLimit: limit,
          billingUrl: entitlement.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      }

      try {
        await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/wybuild.yml/dispatches`, s.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref, inputs: { build_type: buildType, build_mode: buildMode, native_features: nativeFeatures.join(',') } })
        });
      } catch (e) {
        if (e.status === 404) return json(res, 409, { error: 'WyBuild workflow is not installed on this branch. Install it first.', code: 'WORKFLOW_MISSING' });
        if (e.status === 403) return json(res, 403, { error: 'GitHub denied workflow execution. Re-authorize WyBuild with the required repository permissions.', code: 'GITHUB_PERMISSION_DENIED' });
        throw e;
      } finally {
        activeBuildLocks.delete(lockKey);
      }

      return json(res, 202, {
        ok: true,
        status: 'queued',
        // A dispatched run is not a used build yet. The quota increments only
        // when GitHub reports the WyBuild run conclusion as `success`.
        buildsUsed: monthlyUsed,
        successfulBuilds: monthlyUsed,
        inProgressBuilds: usage.active + 1,
        buildLimit: limit,
        nativeFeatures
      });
    }

    if (req.method === 'GET' && route === 'github/releases') {
      const o = safePart(u.searchParams.get('owner'), 'owner');
      const r = safePart(u.searchParams.get('repo'), 'repo');
      const releases = await ghList(`/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/releases`, s.token, {
        maxPages: MAX_RELEASE_PAGES,
        perPage: 100
      });
      return json(res, 200, releases);
    }

    if (req.method === 'POST' && route === 'github/releases') {
      const b = await body(req);
      const owner = safePart(b.owner, 'owner');
      const repo = safePart(b.repo, 'repo');
      const tag_name = safePart(b.tag_name, 'tag_name').trim();
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      const notes = typeof b.body === 'string' ? b.body.trim() : '';
      const target_commitish = typeof b.target_commitish === 'string' && b.target_commitish.trim() ? b.target_commitish.trim() : undefined;
      const prerelease = !!b.prerelease;
      const draft = !!b.draft;
      if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag_name)) {
        return json(res, 400, { error: 'Tag name must look like 1.0.0 or v1.0.0.' });
      }

      const releaseBody = {
        tag_name,
        name: name || tag_name,
        body: notes,
        target_commitish,
        prerelease,
        draft,
        generate_release_notes: !notes
      };
      if (!target_commitish) delete releaseBody.target_commitish;
      if (notes) delete releaseBody.generate_release_notes;

      return json(res, 201, await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`, s.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(releaseBody)
      }));
    }

    return json(res, 404, { error: 'Route not found' });
  } catch (e) {
    if (e?.rateLimited) return json(res, 429, { error: 'GitHub API rate limit reached. Please wait and try again.' });
    return json(res, e.status || 500, { error: e.message || 'Something went wrong' });
  }
}
