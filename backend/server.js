const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const db = require('./db');
const { parseMultipleSessions, parseGitLog } = require('./parser');
const { getConfig, saveConfig } = require('./config');
const { analyzeWithAI, askWithContext, testConnection, PROVIDER_DEFAULTS, DEFAULT_PROMPT_RU, DEFAULT_PROMPT_EN } = require('./ai');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Projects ──────────────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  const projects = db.prepare(
    'SELECT * FROM projects ORDER BY created_at DESC'
  ).all();
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, path } = req.body;
  if (!name || !path) return res.status(400).json({ error: 'name and path are required' });

  const result = db.prepare(
    'INSERT INTO projects (name, path) VALUES (?, ?)'
  ).run(name.trim(), path.trim());

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(project);
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

  Promise.resolve()
    .then(() => askWithContext(config, commit, projectName, messages || [], project?.path || ''))
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
      const short = hash.slice(0, 8);
      const exists = db.prepare(
        'SELECT id FROM commits WHERE project_id = ? AND commit_hash LIKE ?'
      ).get(project.id, `%${short}%`);
      return { hash, date, author, message, already_exists: !!exists };
    })
    .filter(Boolean);

  res.json(commits);
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
        const short = e.commitHash.slice(0, 8);
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

  Promise.resolve()
    .then(() => analyzeWithAI(config, commit.raw_output, project?.name || 'Unknown', project?.path || ''))
    .then((aiDescription) => {
      const description = aiDescription
        ? `${aiDescription}\n\n---\n\n${commit.description || ''}`
        : commit.description;
      db.prepare('UPDATE commits SET description = ? WHERE id = ?').run(description, commit.id);
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
