import crypto from 'node:crypto';

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
  const created = encodeURIComponent(`>=${monthStartISO()}`);
  let successful = 0;
  let active = 0;

  // Query successful and active runs separately. This is both more accurate
  // and cheaper than paging through every failed/cancelled run. A failed build
  // never consumes quota; an active build temporarily reserves a slot.
  for (let i = 0; i < repos.length; i += 5) {
    const chunk = repos.slice(i, i + 5);
    const results = await Promise.all(chunk.map(async repo => {
      const base = `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/actions/runs`;
      try {
        const [successRuns, activeRuns] = await Promise.all([
          ghList(`${base}?created=${created}&conclusion=success`, s.token, {
            keyName: 'workflow_runs', maxPages: 1, perPage: 100
          }),
          ghList(`${base}?created=${created}&status=in_progress`, s.token, {
            keyName: 'workflow_runs', maxPages: 1, perPage: 100
          })
        ]);
        return {
          successful: successRuns.filter(run => run.name === 'WyBuild').length,
          active: activeRuns.filter(run => run.name === 'WyBuild').length
        };
      } catch {
        return { successful: 0, active: 0 };
      }
    }));
    for (const result of results) {
      successful += result.successful;
      active += result.active;
    }
  }
  return { successful, active, reserved: successful + active };
}

// Bump this whenever WORKFLOW's content changes materially (action versions,
// validation logic, build steps, etc). It's embedded as a YAML comment in the
// installed file so /api/github/workflow can tell an already-installed repo
// apart from one running an older generation of the template.
const WORKFLOW_VERSION = 3;

const WORKFLOW = `# wybuild-workflow-version: ${WORKFLOW_VERSION}
name: WyBuild
on:
  workflow_dispatch:
    inputs:
      build_type:
        description: Build target
        required: true
        type: choice
        options:
          - auto
          - apk
          - aab
          - web
        default: auto
      build_mode:
        description: Build mode
        required: true
        type: choice
        options:
          - debug
          - release
        default: release

permissions:
  contents: read

concurrency:
  group: wybuild-\${{ github.repository }}-\${{ github.ref }}-\${{ inputs.build_type }}-\${{ inputs.build_mode }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Detect project type
        id: detect
        shell: bash
        run: |
          set -euo pipefail
          if [ -f pubspec.yaml ]; then
            type=flutter
          elif find . -type f -name gradlew -not -path './.git/*' -not -path '*/node_modules/*' | grep -q .; then
            type=gradle
          elif [ -f package.json ]; then
            if node -e "const p=require('./package.json'); process.exit(p.dependencies?.next || p.devDependencies?.next ? 0 : 1)"; then
              type=next
            else
              type=node-web
            fi
          elif find . -maxdepth 3 -type f \( -name 'index.html' -o -name '*.html' \) -not -path './.git/*' | grep -q .; then
            type=vanilla
          else
            type=unknown
          fi
          echo "type=$type" >> "$GITHUB_OUTPUT"
          echo "Detected project type: $type"

      - name: Validate requested target
        shell: bash
        env:
          REQUESTED: \${{ inputs.build_type }}
          DETECTED: \${{ steps.detect.outputs.type }}
        run: |
          set -euo pipefail
          if [ "$DETECTED" = "unknown" ]; then
            echo "::error title=Unsupported project::WyBuild could not detect Flutter, Gradle/Android, Node web, Next.js, Vite/React or vanilla HTML in this repository."
            exit 1
          fi
          if [ "$REQUESTED" = "apk" ] || [ "$REQUESTED" = "aab" ]; then
            if [ "$DETECTED" != "flutter" ] && [ "$DETECTED" != "gradle" ]; then
              echo "::error title=Android target unavailable::APK/AAB builds require a Flutter or Android/Gradle project. Detected: $DETECTED"
              exit 1
            fi
          fi
          if [ "$REQUESTED" = "web" ]; then
            if [ "$DETECTED" = "flutter" ] || [ "$DETECTED" = "gradle" ]; then
              echo "::error title=Web target unavailable::Web builds require a web project, not a Flutter/Gradle-only project."
              exit 1
            fi
          fi

      - name: Set up Java
        if: steps.detect.outputs.type == 'flutter' || steps.detect.outputs.type == 'gradle'
        uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'
          cache: gradle

      - name: Set up Flutter
        if: steps.detect.outputs.type == 'flutter'
        uses: subosito/flutter-action@v2.23.0
        with:
          channel: stable
          cache: true

      - name: Build Flutter Android
        if: steps.detect.outputs.type == 'flutter' && (inputs.build_type == 'apk' || inputs.build_type == 'aab' || inputs.build_type == 'auto')
        shell: bash
        run: |
          set -euo pipefail
          flutter pub get
          if [ "\${{ inputs.build_type }}" = "aab" ]; then
            flutter build appbundle --release
          elif [ "\${{ inputs.build_type }}" = "apk" ]; then
            if [ "\${{ inputs.build_mode }}" = "debug" ]; then flutter build apk --debug; else flutter build apk --release; fi
          else
            flutter build apk --release
          fi

      - name: Build Gradle Android
        if: steps.detect.outputs.type == 'gradle' && (inputs.build_type == 'apk' || inputs.build_type == 'aab' || inputs.build_type == 'auto')
        shell: bash
        run: |
          set -euo pipefail
          wrapper="$(find . -type f -name gradlew -not -path './.git/*' -not -path '*/node_modules/*' | head -n 1)"
          project_dir="$(dirname "$wrapper")"
          cd "$project_dir"
          chmod +x ./gradlew
          ./gradlew --version
          if [ "\${{ inputs.build_type }}" = "aab" ]; then
            ./gradlew bundleRelease --no-daemon --stacktrace
          elif [ "\${{ inputs.build_type }}" = "apk" ]; then
            if [ "\${{ inputs.build_mode }}" = "debug" ]; then ./gradlew assembleDebug --no-daemon --stacktrace; else ./gradlew assembleRelease --no-daemon --stacktrace; fi
          else
            ./gradlew assembleRelease --no-daemon --stacktrace
          fi

      - name: Set up Node.js
        if: steps.detect.outputs.type == 'next' || steps.detect.outputs.type == 'node-web'
        uses: actions/setup-node@v6
        with:
          node-version: 34

      - name: Install Node dependencies
        if: steps.detect.outputs.type == 'next' || steps.detect.outputs.type == 'node-web'
        shell: bash
        run: |
          set -euo pipefail
          if [ -f package-lock.json ]; then npm ci
          elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile
          elif [ -f yarn.lock ]; then corepack enable && yarn install --immutable
          else npm install
          fi

      - name: Build Next.js
        if: steps.detect.outputs.type == 'next' && (inputs.build_type == 'web' || inputs.build_type == 'auto')
        shell: bash
        run: |
          set -euo pipefail
          npm run build
          mkdir -p wybuild-output
          tar -czf wybuild-output/next-build.tar.gz .next public package.json 2>/dev/null || tar -czf wybuild-output/next-build.tar.gz .next package.json
          if [ -f next.config.js ]; then cp next.config.js wybuild-output/; fi
          if [ -f next.config.mjs ]; then cp next.config.mjs wybuild-output/; fi
          if [ -f next.config.ts ]; then cp next.config.ts wybuild-output/; fi

      - name: Build Vite/React/Node web app
        if: steps.detect.outputs.type == 'node-web' && (inputs.build_type == 'web' || inputs.build_type == 'auto')
        shell: bash
        run: |
          set -euo pipefail
          if node -e "const p=require('./package.json'); process.exit(typeof p.scripts?.build === 'string' ? 0 : 1)"; then
            npm run build
          else
            echo "No build script found; treating repository as a static web app."
          fi
          mkdir -p wybuild-output
          if [ -d dist ]; then tar -czf wybuild-output/web-dist.tar.gz dist
          elif [ -d build ]; then tar -czf wybuild-output/web-build.tar.gz build
          else tar -czf wybuild-output/web-source.tar.gz --exclude='./node_modules' --exclude='./.git' .; fi

      - name: Package vanilla web app
        if: steps.detect.outputs.type == 'vanilla' && (inputs.build_type == 'web' || inputs.build_type == 'auto')
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p wybuild-output
          tar --exclude='./.git' --exclude='./wybuild-output' -czf wybuild-output/vanilla-web.tar.gz .

      - name: Upload APK
        if: (inputs.build_type == 'apk' || inputs.build_type == 'auto') && (steps.detect.outputs.type == 'flutter' || steps.detect.outputs.type == 'gradle')
        uses: actions/upload-artifact@v6
        with:
          name: wybuild-apk-\${{ github.run_number }}
          path: '**/build/outputs/apk/**/*.apk'
          if-no-files-found: error
          retention-days: 7

      - name: Upload AAB
        if: inputs.build_type == 'aab' && (steps.detect.outputs.type == 'flutter' || steps.detect.outputs.type == 'gradle')
        uses: actions/upload-artifact@v6
        with:
          name: wybuild-aab-\${{ github.run_number }}
          path: '**/build/outputs/bundle/**/*.aab'
          if-no-files-found: error
          retention-days: 7

      - name: Upload web build
        if: inputs.build_type == 'web' || inputs.build_type == 'auto'
        uses: actions/upload-artifact@v6
        with:
          name: wybuild-web-\${{ github.run_number }}
          path: 'wybuild-output/*'
          if-no-files-found: error
          retention-days: 7
`;


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
        return json(res, 200, {
          ...d,
          plan: String(d.plan || 'FREE').toUpperCase(),
          buildsUsed: usage.successful,
          successfulBuilds: usage.successful,
          inProgressBuilds: usage.active,
          source: 'wydev',
          billingUrl: d.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      } catch (e) {
        return json(res, e.status || 502, { error: e.message || 'WyDev billing service unavailable' });
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
        await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/.github/workflows/wybuild.yml`, s.token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'chore: add WyBuild workflow',
            content: Buffer.from(WORKFLOW).toString('base64'),
            branch
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
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="wybuild-artifact-${id}.zip"`);
      res.end(Buffer.from(await rr.arrayBuffer()));
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
      if (monthlyUsed >= limit || reserved >= limit) {
        activeBuildLocks.delete(lockKey);
        return json(res, 402, {
          error: monthlyUsed >= limit
            ? `Monthly successful-build limit reached (${monthlyUsed}/${limit}). Failed builds do not consume your quota.`
            : `All remaining successful-build slots are currently in progress (${monthlyUsed} successful, ${usage.active} in progress, ${limit} allowed). Failed builds do not consume your quota.`,
          code: 'BUILD_LIMIT_REACHED',
          plan: String(entitlement.plan || 'FREE').toUpperCase(),
          buildsUsed: monthlyUsed,
          successfulBuilds: monthlyUsed,
          inProgressBuilds: usage.active,
          buildLimit: limit,
          billingUrl: entitlement.billingUrl || process.env.WYDEV_BILLING_URL || undefined
        });
      }

      try {
        await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/wybuild.yml/dispatches`, s.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref, inputs: { build_type: buildType, build_mode: buildMode } })
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
        buildLimit: limit
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
