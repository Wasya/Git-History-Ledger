const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const db = require('./db');
const { parseMultipleSessions, parseGitLog } = require('./parser');
const { getConfig, saveConfig } = require('./config');
const { analyzeWithAI, analyzeForLedger, askWithContext, testConnection, PROVIDER_DEFAULTS, DEFAULT_PROMPT_RU, DEFAULT_PROMPT_EN } = require('./ai');
const { findRelevantTests } = require('./testmatch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Projects ──────────────────────────────────────────────────────────────

function normalizeRemoteUrl(url) {
  if (!url) return '';
  url = url.trim();
  // git@github.com:user/repo.git → https://github.com/user/repo
  url = url.replace(/^git@([^:]+):(.+)$/, 'https://$1/$2');
  // Remove .git suffix and trailing slash
  url = url.replace(/\.git$/, '').replace(/\/$/, '');
  return url;
}

function detectRemoteUrl(repoPath) {
  if (!repoPath || !fs.existsSync(repoPath)) return '';
  try {
    const raw = execFileSync('git', ['remote', 'get-url', 'origin'],
      { cwd: repoPath, encoding: 'utf8', timeout: 5000 });
    return normalizeRemoteUrl(raw.trim());
  } catch (_) {
    return '';
  }
}

// Fetch the full diff so the AI sees actual code changes, not just the stat.
// Range commits (FROM..TO) → `git diff FROM TO`; single hashes → `git diff
// HASH^1 HASH` (falls back to `git show` for the initial commit). Falls back to
// the stored stat-only raw_output if git is unavailable. Shared by /analyze
// and /ask so both paths feed the model real code.
function getDiffForAI(commit, project) {
  const rawHash = (commit.commit_hash || '').trim();
  if (!rawHash || !project?.path || !fs.existsSync(project.path)) return commit.raw_output;
  const opts = { cwd: project.path, encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024 };
  try {
    if (rawHash.includes('..')) {
      const [from, to] = rawHash.split('..').map((h) => h.trim());
      return execFileSync('git', ['diff', from, to, '--no-color'], opts);
    }
    try {
      return execFileSync('git', ['diff', rawHash + '^1', rawHash, '--no-color'], opts);
    } catch {
      return execFileSync('git', ['show', '--pretty=format:', '-p', '--no-color', rawHash], opts);
    }
  } catch (e) {
    console.warn('[getDiffForAI] git diff failed, using raw_output:', e.message);
    return commit.raw_output;
  }
}

app.get('/api/projects', (req, res) => {
  const projects = db.prepare(
    'SELECT * FROM projects ORDER BY created_at DESC'
  ).all();
  res.json(projects);
});

// Detect remote URL from a local path (called before project is created)
app.post('/api/projects/detect-remote', (req, res) => {
  const { path: repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'path required' });
  res.json({ remote_url: detectRemoteUrl(repoPath) });
});

// Check whether a path exists and is a git repository
app.post('/api/projects/check-path', (req, res) => {
  const { path: repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'path required' });

  const exists = fs.existsSync(repoPath);
  if (!exists) return res.json({ exists: false, is_git: false });

  let is_git = false;
  try {
    execFileSync('git', ['rev-parse', '--git-dir'],
      { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
    is_git = true;
  } catch (_) {}

  res.json({ exists: true, is_git });
});

// Clone a remote repository into a local path
app.post('/api/projects/clone', (req, res) => {
  const { remote_url, path: targetPath } = req.body;
  if (!remote_url || !targetPath) {
    return res.status(400).json({ error: 'remote_url and path are required' });
  }
  try {
    execFileSync('git', ['clone', remote_url, targetPath],
      { encoding: 'utf8', timeout: 120000 });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.stderr || err.stdout || err.message });
  }
});

app.post('/api/projects', (req, res) => {
  const { name, path, remote_url, tests_path } = req.body;
  if (!name || !path) return res.status(400).json({ error: 'name and path are required' });

  // Auto-detect remote URL if not provided
  const remoteUrl = remote_url !== undefined
    ? normalizeRemoteUrl(remote_url)
    : detectRemoteUrl(path.trim());

  const result = db.prepare(
    'INSERT INTO projects (name, path, remote_url, tests_path) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), path.trim(), remoteUrl, (tests_path || '').trim());

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
});

// Update editable project fields (name, path, remote_url, tests_path)
app.put('/api/projects/:id', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, path, remote_url, tests_path } = req.body;
  const next = {
    name: name !== undefined ? String(name).trim() : project.name,
    path: path !== undefined ? String(path).trim() : project.path,
    remote_url: remote_url !== undefined ? normalizeRemoteUrl(remote_url) : project.remote_url,
    tests_path: tests_path !== undefined ? String(tests_path).trim() : project.tests_path,
  };
  if (!next.name || !next.path) return res.status(400).json({ error: 'name and path are required' });

  db.prepare('UPDATE projects SET name = ?, path = ?, remote_url = ?, tests_path = ? WHERE id = ?')
    .run(next.name, next.path, next.remote_url, next.tests_path, project.id);

  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id));
});

app.delete('/api/projects/:id', (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// ── Git Pull ──────────────────────────────────────────────────────────────

app.post('/api/projects/:id/pull', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Build timestamp header matching the batch-script format
  const now = new Date();
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const header = `=== ${DAY_NAMES[now.getDay()]} ${dateStr} ${timeStr} ============================\n`;

  // Execute git pull
  let gitRaw;
  try {
    const out = execSync('git pull', {
      cwd: project.path,
      encoding: 'utf8',
      timeout: 30000,
    });
    gitRaw = header + out;
  } catch (err) {
    // git exits non-zero even for "Already up to date" in some configs
    gitRaw = header + ((err.stdout || '') + (err.stderr || '') || err.message);
  }

  const upToDate =
    gitRaw.includes('Already up to date') ||
    gitRaw.includes('already up-to-date');

  if (upToDate) {
    return res.json({ status: 'up_to_date', message: 'Already up to date', commits: [] });
  }

  const sessions = parseMultipleSessions(gitRaw);
  const hasChanges = sessions.some((s) => s.commitHash);

  if (!hasChanges) {
    return res.json({ status: 'up_to_date', message: gitRaw.trim(), commits: [] });
  }

  const config = getConfig();

  const saveCommits = (aiDescription, aiError) => {
    const insert = db.prepare(`
      INSERT INTO commits (project_id, commit_date, branch, commit_hash, raw_output, description, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) =>
      items.map((parsed) => {
        const description = aiDescription
          ? `${aiDescription}\n\n---\n\n${parsed.description}`
          : parsed.description;

        const r = insert.run(
          project.id,
          parsed.commitDate,
          parsed.branch,
          parsed.commitHash,
          parsed.raw_output,
          description,
          ''
        );
        return db.prepare('SELECT * FROM commits WHERE id = ?').get(r.lastInsertRowid);
      })
    );

    const commits = insertMany(sessions);
    res.json({ status: 'updated', commits, aiError: aiError || null });
  };

  if (!config.ai_provider || req.query.noai === '1') {
    return saveCommits(null, null);
  }

  // AI analysis (non-fatal — save without it if AI fails)
  Promise.resolve()
    .then(() => analyzeWithAI(config, gitRaw, project.name, project.path))
    .then((aiDescription) => saveCommits(aiDescription, null))
    .catch((err) => {
      console.error('[AI] analysis failed:', err.message);
      saveCommits(null, err.message);
    });
});

// ── Commits ───────────────────────────────────────────────────────────────

app.get('/api/commits', (req, res) => {
  const { project_id, search } = req.query;
  const conditions = [];
  const params = [];

  if (project_id) {
    conditions.push('project_id = ?');
    params.push(project_id);
  }
  if (search) {
    conditions.push('(commit_hash LIKE ? OR branch LIKE ? OR description LIKE ? OR notes LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const commits = db.prepare(
    `SELECT * FROM commits${where} ORDER BY commit_date DESC, created_at DESC`
  ).all(...params);

  res.json(commits);
});

app.post('/api/commits', (req, res) => {
  const { project_id, raw_text, notes } = req.body;
  if (!project_id || !raw_text) {
    return res.status(400).json({ error: 'project_id and raw_text are required' });
  }

  const sessions = parseMultipleSessions(raw_text);

  const insert = db.prepare(`
    INSERT INTO commits (project_id, commit_date, branch, commit_hash, raw_output, description, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) =>
    items.map((parsed) => {
      const r = insert.run(
        project_id,
        parsed.commitDate,
        parsed.branch,
        parsed.commitHash,
        parsed.raw_output,
        parsed.description,
        notes || ''
      );
      return db.prepare('SELECT * FROM commits WHERE id = ?').get(r.lastInsertRowid);
    })
  );

  const commits = insertMany(sessions);
  res.status(201).json(commits);
});

app.get('/api/commits/:id/diff', (req, res) => {
  const commit = db.prepare(
    'SELECT c.*, p.path as project_path FROM commits c JOIN projects p ON c.project_id = p.id WHERE c.id = ?'
  ).get(req.params.id);
  if (!commit) return res.status(404).json({ error: 'Commit not found' });

  const rawHash = (commit.commit_hash || '').trim();
  if (!rawHash) return res.status(400).json({ error: 'No commit hash' });

  const opts = { cwd: commit.project_path, maxBuffer: 20 * 1024 * 1024, timeout: 30000 };

  const normalize = buf => buf.toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  try {
    let buf;
    if (rawHash.includes('..')) {
      // Range from git pull session — diff between the two endpoints
      const [from, to] = rawHash.split('..').map(h => h.trim());
      buf = execFileSync('git', ['diff', from, to, '--no-color'], opts);
    } else {
      // Single commit — diff vs first parent; fall back to git show for initial commit
      try {
        buf = execFileSync('git', ['diff', rawHash + '^1', rawHash, '--no-color'], opts);
      } catch {
        buf = execFileSync('git', ['show', '--pretty=format:', '-p', '--no-color', rawHash], opts);
      }
    }
    res.json({ diff: normalize(buf).trimStart() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/commits/:id', (req, res) => {
  const { description, notes } = req.body;
  db.prepare(
    'UPDATE commits SET description = ?, notes = ? WHERE id = ?'
  ).run(description, notes, req.params.id);

  const commit = db.prepare('SELECT * FROM commits WHERE id = ?').get(req.params.id);
  res.json(commit);
});

app.delete('/api/commits/:id', (req, res) => {
  db.prepare('DELETE FROM commits WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

app.post('/api/commits/:id/ask', (req, res) => {
  const commit = db.prepare('SELECT * FROM commits WHERE id = ?').get(req.params.id);
  if (!commit) return res.status(404).json({ error: 'Commit not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(commit.project_id);
  const projectName = project?.name || 'Unknown';

  const config = getConfig();
  if (!config.ai_provider) {
    return res.status(400).json({ error: 'AI провайдер не настроен' });
  }

  const { messages } = req.body;

  // Same as /analyze: feed the chat the real code diff, not the stat-only
  // raw_output (git-log/gap-imported commits store only the stat). raw_output
  // carries the commit header (author/message) a bare diff lacks, so prepend it.
  const fullDiff = getDiffForAI(commit, project) || '';
  const enrichedRaw = [commit.raw_output, fullDiff].filter(Boolean).join('\n\n');
  const enrichedCommit = { ...commit, raw_output: enrichedRaw };

  Promise.resolve()
    .then(() => askWithContext(config, enrichedCommit, projectName, messages || [], project?.path || ''))
    .then((reply) => res.json({ reply }))
    .catch((err) => {
      console.error('[commits/ask]', err.message);
      res.status(500).json({ error: err.message });
    });
});

// ── Git Log Preview ───────────────────────────────────────────────────────

app.get('/api/projects/:id/log-preview', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.path) return res.status(400).json({ error: 'Project path is not set' });
  if (!fs.existsSync(project.path)) return res.status(400).json({ error: `Directory does not exist: ${project.path}` });

  const { from, to } = req.query;
  const args = ['log', '--reverse', '--format=%H %ad %an : %s', '--date=short'];
  if (from) args.push(`--after=${from}`);
  if (to)   args.push(`--before=${to}`);

  let output;
  try {
    output = execFileSync('git', args, { cwd: project.path, encoding: 'utf8', timeout: 15000 });
  } catch (err) {
    return res.status(400).json({ error: err.stderr || err.message });
  }

  const LOG_RE = /^([a-f0-9]{7,40})\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*:\s*(.+)/;
  const commits = output
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(LOG_RE);
      if (!m) return null;
      const [, hash, date, author, message] = m;
      const short = hash.slice(0, 7);
      const exists = db.prepare(
        'SELECT id FROM commits WHERE project_id = ? AND commit_hash LIKE ?'
      ).get(project.id, `%${short}%`);
      return { hash, date, author, message, already_exists: !!exists };
    })
    .filter(Boolean);

  res.json(commits);
});

// ── Gap detection ─────────────────────────────────────────────────────────

app.get('/api/projects/:id/gaps', (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!project.path) return res.status(400).json({ error: 'Project path is not set' });
  if (!fs.existsSync(project.path)) return res.status(400).json({ error: `Directory does not exist: ${project.path}` });

  // Last known commit date for this project; fall back to 90 days ago
  const lastRow = db.prepare(
    'SELECT commit_date FROM commits WHERE project_id = ? AND commit_date IS NOT NULL ORDER BY commit_date DESC, created_at DESC LIMIT 1'
  ).get(req.params.id);

  let afterDate;
  if (lastRow?.commit_date) {
    // Go 1 day back to catch same-day commits that may have been missed
    const d = new Date(lastRow.commit_date);
    d.setDate(d.getDate() - 1);
    afterDate = d.toISOString().slice(0, 10);
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    afterDate = d.toISOString().slice(0, 10);
  }

  const args = ['log', '--reverse', '--format=%H %ad %an : %s', '--date=short', `--after=${afterDate}`];

  let output;
  try {
    output = execFileSync('git', args, { cwd: project.path, encoding: 'utf8', timeout: 15000 });
  } catch (err) {
    return res.status(400).json({ error: err.stderr || err.message });
  }

  const LOG_RE = /^([a-f0-9]{7,40})\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*:\s*(.+)/;
  const missing = output
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const m = line.match(LOG_RE);
      if (!m) return null;
      const [, hash, date, author, message] = m;
      const short = hash.slice(0, 7);
      const exists = db.prepare(
        'SELECT id FROM commits WHERE project_id = ? AND commit_hash LIKE ?'
      ).get(project.id, `%${short}%`);
      return exists ? null : { hash, date, author, message };
    })
    .filter(Boolean);

  res.json(missing);
});

// ── Import git log ────────────────────────────────────────────────────────

app.post('/api/commits/import-log', (req, res) => {
  const { project_id, hashes, raw_text } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let entries;

  if (hashes && Array.isArray(hashes) && hashes.length > 0) {
    if (!project.path) return res.status(400).json({ error: 'Project path is not set' });
    if (!fs.existsSync(project.path)) return res.status(400).json({ error: `Directory does not exist: ${project.path}` });
    const parts = [];
    for (const hash of hashes) {
      try {
        const out = execFileSync(
          'git', ['show', hash, '--stat', '--format=%H %ad %an : %s', '--date=short'],
          { cwd: project.path, encoding: 'utf8', timeout: 10000 }
        );
        parts.push(out.trim());
      } catch (e) {
        console.error(`[import-log] git show ${hash} failed:`, e.message);
      }
    }
    entries = parseGitLog(parts.join('\n\n'));
  } else if (raw_text) {
    entries = parseGitLog(raw_text);
  } else {
    return res.status(400).json({ error: 'hashes or raw_text required' });
  }

  if (!entries.length) return res.status(400).json({ error: 'No commits parsed from input' });

  const insert = db.prepare(`
    INSERT INTO commits (project_id, commit_date, branch, commit_hash, raw_output, description, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const saved = db.transaction(() =>
    entries
      .filter((e) => {
        const short = e.commitHash.slice(0, 7);
        return !db.prepare(
          'SELECT id FROM commits WHERE project_id = ? AND commit_hash LIKE ?'
        ).get(project_id, `%${short}%`);
      })
      .map((e) => {
        const r = insert.run(project_id, e.commitDate, e.branch, e.commitHash, e.raw_output, e.description, '');
        return db.prepare('SELECT * FROM commits WHERE id = ?').get(r.lastInsertRowid);
      })
  )();

  res.status(201).json(saved);
});

// ── Analyze existing commit with AI ───────────────────────────────────────

app.post('/api/commits/:id/analyze', (req, res) => {
  const commit = db.prepare('SELECT * FROM commits WHERE id = ?').get(req.params.id);
  if (!commit) return res.status(404).json({ error: 'Commit not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(commit.project_id);
  const config = getConfig();
  if (!config.ai_provider) return res.status(400).json({ error: 'AI provider not configured' });

  // Hand the full diff to analyzeForLedger, which applies ai_prompt_custom (the
  // user's analysis FORMAT template) via buildPrompt and returns both the
  // formatted description and a short notes summary in one call. The custom
  // prompt must be a pure format spec — NOT an agentic workflow (git pull /
  // curl / write files), or Claude tries to execute it under `claude -p`.
  const fullDiff = getDiffForAI(commit, project) || '';

  // Backend-gathered context: tests in project.tests_path relevant to this diff.
  let testContext = '';
  if (project?.tests_path) {
    try {
      testContext = findRelevantTests(project.tests_path, fullDiff);
    } catch (e) {
      console.warn('[analyze] test match failed:', e.message);
    }
  }

  // raw_output carries the commit header (hash/date/author/message) + stat that
  // a bare `git diff` lacks; prepend it so the AI gets author & message too.
  const aiContent = [commit.raw_output, fullDiff].filter(Boolean).join('\n\n').slice(0, 13000);

  Promise.resolve()
    .then(() => analyzeForLedger(config, aiContent, project?.name || 'Unknown', project?.path || '', testContext, project?.tests_path || ''))
    .then(({ description: ai, notes: aiNotes }) => {
      const description = ai
        ? (commit.description ? `${commit.description}\n\n---\n\n${ai}` : ai)
        : commit.description;
      // Only fill notes if the user hasn't written any — never overwrite manual notes.
      const notes = (commit.notes && commit.notes.trim()) ? commit.notes : (aiNotes || '');
      db.prepare('UPDATE commits SET description = ?, notes = ? WHERE id = ?').run(description, notes, commit.id);
      return db.prepare('SELECT * FROM commits WHERE id = ?').get(commit.id);
    })
    .then((updated) => res.json(updated))
    .catch((err) => {
      console.error('[commits/analyze]', err.message);
      res.status(500).json({ error: err.message });
    });
});

// ── Settings ──────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(getConfig());
});

app.put('/api/settings', (req, res) => {
  const saved = saveConfig(req.body);
  res.json(saved);
});

app.get('/api/settings/providers', (req, res) => {
  res.json(PROVIDER_DEFAULTS);
});

app.get('/api/settings/default-prompts', (req, res) => {
  res.json({ ru: DEFAULT_PROMPT_RU, en: DEFAULT_PROMPT_EN });
});

// Returns list of models installed in local Ollama
app.get('/api/settings/ollama-models', async (req, res) => {
  const config = getConfig();
  const baseUrl = (config.ai_base_url || 'http://localhost:11434').replace(/\/v1\/?$/, '');
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`Ollama вернула статус ${response.status}`);
    const data = await response.json();
    const models = (data.models || []).map((m) => m.name).sort();
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: `Ollama недоступна: ${err.message}` });
  }
});

app.post('/api/settings/test', (req, res) => {
  let config;
  try {
    config = getConfig();
  } catch (e) {
    return res.json({ success: false, error: `config error: ${e.message}` });
  }

  if (!config.ai_provider) {
    return res.json({ success: false, error: 'Провайдер не настроен' });
  }

  Promise.resolve()
    .then(() => testConnection(config))
    .then((reply) => res.json({ success: true, reply }))
    .catch((err) => {
      console.error('[settings/test]', config.ai_provider, err);
      res.json({ success: false, error: err.message || String(err) });
    });
});

// Global error handler — prevents Express from returning HTML 500 pages
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Git History Ledger API → http://localhost:${PORT}`);
});
