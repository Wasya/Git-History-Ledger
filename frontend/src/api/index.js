const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Projects
  getProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  detectRemoteUrl: (path) => request('/projects/detect-remote', { method: 'POST', body: JSON.stringify({ path }) }),
  checkPath: (path) => request('/projects/check-path', { method: 'POST', body: JSON.stringify({ path }) }),
  cloneRepo: (remote_url, path) => request('/projects/clone', { method: 'POST', body: JSON.stringify({ remote_url, path }) }),

  // Git Pull
  gitPull: (projectId) => request(`/projects/${projectId}/pull`, { method: 'POST' }),
  gitPullOnly: (projectId) => request(`/projects/${projectId}/pull?noai=1`, { method: 'POST' }),

  // Commits
  getCommits: (projectId, search) => {
    const p = new URLSearchParams();
    if (projectId) p.set('project_id', projectId);
    if (search) p.set('search', search);
    const qs = p.toString() ? '?' + p.toString() : '';
    return request(`/commits${qs}`);
  },
  createCommit: (data) => request('/commits', { method: 'POST', body: JSON.stringify(data) }),
  getCommitDiff: (id) => request(`/commits/${id}/diff`),
  updateCommit: (id, data) => request(`/commits/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCommit: (id) => request(`/commits/${id}`, { method: 'DELETE' }),
  askCommit: (id, data) => request(`/commits/${id}/ask`, { method: 'POST', body: JSON.stringify(data) }),
  analyzeCommit: (id) => request(`/commits/${id}/analyze`, { method: 'POST' }),
  getGaps: (projectId) => request(`/projects/${projectId}/gaps`),
  logPreview: (projectId, from, to) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to)   p.set('to', to);
    const qs = p.toString() ? '?' + p.toString() : '';
    return request(`/projects/${projectId}/log-preview${qs}`);
  },
  importLog: (data) => request('/commits/import-log', { method: 'POST', body: JSON.stringify(data) }),

  // Settings
  getSettings: () => request('/settings'),
  saveSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  getProviders: () => request('/settings/providers'),
  testConnection: () => request('/settings/test', { method: 'POST' }),
  getOllamaModels: () => request('/settings/ollama-models'),
  getDefaultPrompts: () => request('/settings/default-prompts'),
};
