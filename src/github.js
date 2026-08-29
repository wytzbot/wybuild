export async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 20000);
  try {
    const r = await fetch(path, { credentials: 'include', ...options, signal: controller.signal });
    const ct = r.headers.get('content-type') || '';
    let data = {};
    try { data = ct.includes('application/json') ? await r.json() : await r.blob(); } catch {}
    if (!r.ok) {
      if (r.status === 401 && path.split('?')[0] === '/api/auth/me') return { authenticated: false };
      const error = new Error(data?.error || `Request failed (${r.status})`);
      error.code = data?.code;
      error.status = r.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out. Check your connection and retry.');
    throw e;
  } finally { clearTimeout(timeout); }
}

export const githubLogin = () => window.location.assign('/api/auth/github');
export const githubLogout = () => api('/api/auth/logout', { method: 'POST' });
export async function getSession() { const d = await api('/api/auth/me'); return d?.authenticated === true ? d : null; }
export const listRepositories = () => api('/api/github/repos');
export const listBranches = (owner, repo) => api(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
// Resolves to { exists, dispatchable, upToDate, installedVersion, currentVersion }.
// upToDate is null when no workflow is installed yet; false means the installed
// copy predates the current WyBuild workflow template and should be reinstalled.
export const checkWorkflow = (owner, repo, ref) => api(`/api/github/workflow?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&ref=${encodeURIComponent(ref)}`);
export const installWorkflow = (owner, repo, ref) => api('/api/github/install-workflow', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({owner,repo,ref}) });
export const dispatchBuild = payload => api('/api/github/dispatch', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
export const listRuns = (owner, repo, created) => api(`/api/github/runs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}${created ? `&created=${encodeURIComponent(created)}` : ''}`);
export const getRun = (owner, repo, id) => api(`/api/github/run?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&id=${encodeURIComponent(id)}`);
export const listArtifacts = (owner, repo, id) => api(`/api/github/artifacts?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&id=${encodeURIComponent(id)}`);
export const getLogsUrl = (owner, repo, id) => `/api/github/logs?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&id=${encodeURIComponent(id)}`;
