#!/usr/bin/env node
// GitLed MCP Server — Git History Ledger integration for Claude Code
// Direct SQLite access (read/write) + REST API calls for git pull
// Protocol: MCP 2024-11-05, stdio transport with Content-Length framing

'use strict';

const path = require('path');
const http = require('http');
const Database = require(path.join(__dirname, 'backend/node_modules/better-sqlite3'));

const DB_PATH = path.join(__dirname, 'backend/ledger.db');
const REST_BASE = 'http://localhost:3001';

let db;
try {
  db = new Database(DB_PATH, { readonly: false });
  db.pragma('journal_mode = WAL');
} catch (e) {
  process.stderr.write(`[gitled-mcp] DB open failed: ${e.message}\n`);
  process.exit(1);
}

// ── REST helper ───────────────────────────────────────────────────────────

function restPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 35000
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('REST timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function restPostEmpty(urlPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3001, path: urlPath, method: 'POST',
      headers: { 'Content-Length': 0 }, timeout: 35000
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('REST timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'gitled_projects',
    description:
      'List all Git repositories registered in GitLed with their IDs, names, and local paths. ' +
      'Use this first to get a project_id before querying commits.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'gitled_commits',
    description:
      'Search commit history in GitLed. Each commit record includes an AI-generated description ' +
      'with a code change analysis (what changed, why, affected files) and a notes field with ' +
      'manually added context. Much faster and richer than running git log. ' +
      'Provide project_id (from gitled_projects) to filter by repo. ' +
      'Provide search to match against hash/branch/description/notes.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Filter by project ID (from gitled_projects)' },
        search: { type: 'string', description: 'Full-text search across hash, branch, description, notes' },
        limit: { type: 'integer', description: 'Max results (default: 20, max: 100)' },
        since: { type: 'string', description: 'Only commits on or after this date (YYYY-MM-DD)' }
      }
    }
  },
  {
    name: 'gitled_commit',
    description: 'Get full details of a single commit by its GitLed ID, including complete AI description and notes.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'GitLed commit ID (from gitled_commits)' }
      },
      required: ['id']
    }
  },
  {
    name: 'gitled_update_notes',
    description: 'Append or replace the notes field of a commit. Use to record analysis findings after reviewing a change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'GitLed commit ID' },
        notes: { type: 'string', description: 'New notes text (Markdown supported). Replaces existing notes.' },
        append: { type: 'boolean', description: 'If true, append to existing notes instead of replacing (default: false)' }
      },
      required: ['id', 'notes']
    }
  },
  {
    name: 'gitled_pull',
    description:
      'Trigger git pull on a registered project and import any new commits into GitLed. ' +
      'Requires the GitLed backend server to be running at localhost:3001. ' +
      'Returns imported commits with AI analysis if a provider is configured.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Project ID from gitled_projects' }
      },
      required: ['project_id']
    }
  },
  {
    name: 'gitled_gaps',
    description:
      'Find commits present in the git repository that are NOT yet imported into GitLed. ' +
      'Useful for filling gaps in the ledger history. Returns hash, date, author, message.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Project ID from gitled_projects' }
      },
      required: ['project_id']
    }
  }
];

// ── Tool implementations ──────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {

    case 'gitled_projects': {
      return db.prepare('SELECT id, name, path, remote_url, created_at FROM projects ORDER BY name').all();
    }

    case 'gitled_commits': {
      const conditions = [];
      const params = [];

      if (args.project_id) {
        conditions.push('project_id = ?');
        params.push(args.project_id);
      }
      if (args.search) {
        conditions.push('(commit_hash LIKE ? OR branch LIKE ? OR description LIKE ? OR notes LIKE ?)');
        const s = `%${args.search}%`;
        params.push(s, s, s, s);
      }
      if (args.since) {
        conditions.push("commit_date >= ?");
        params.push(args.since);
      }

      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const limit = Math.min(args.limit || 20, 100);
      params.push(limit);

      return db.prepare(
        `SELECT id, project_id, commit_date, branch, commit_hash, description, notes, created_at
         FROM commits${where}
         ORDER BY commit_date DESC, created_at DESC
         LIMIT ?`
      ).all(...params);
    }

    case 'gitled_commit': {
      const row = db.prepare(
        'SELECT * FROM commits WHERE id = ?'
      ).get(args.id);
      return row || { error: `Commit id=${args.id} not found` };
    }

    case 'gitled_update_notes': {
      const commit = db.prepare('SELECT * FROM commits WHERE id = ?').get(args.id);
      if (!commit) return { error: `Commit id=${args.id} not found` };

      const newNotes = args.append && commit.notes
        ? commit.notes + '\n\n' + args.notes
        : args.notes;

      db.prepare('UPDATE commits SET notes = ? WHERE id = ?').run(newNotes, args.id);
      return db.prepare('SELECT id, commit_hash, commit_date, notes FROM commits WHERE id = ?').get(args.id);
    }

    case 'gitled_pull': {
      try {
        const result = await restPostEmpty(`/api/projects/${args.project_id}/pull`);
        return result;
      } catch (e) {
        return {
          error: `GitLed REST server unavailable: ${e.message}`,
          hint: 'Start GitLed with: cd C:\\OTbase\\GitLed && npm run dev'
        };
      }
    }

    case 'gitled_gaps': {
      try {
        const result = await new Promise((resolve, reject) => {
          const req = http.get(`${REST_BASE}/api/projects/${args.project_id}/gaps`, { timeout: 15000 }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
          });
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
          req.on('error', reject);
        });
        return result;
      } catch (e) {
        return {
          error: `GitLed REST server unavailable: ${e.message}`,
          hint: 'Start GitLed with: cd C:\\OTbase\\GitLed && npm run dev'
        };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── MCP stdio transport (newline-delimited JSON) ──────────────────────────
// Claude Code uses plain NDJSON over stdio — one JSON object per line.

let inputBuffer = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  inputBuffer += chunk;
  let newlineIdx;
  while ((newlineIdx = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIdx).trim();
    inputBuffer = inputBuffer.slice(newlineIdx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { continue; }
    handleMessage(msg).catch((e) =>
      process.stderr.write(`[gitled-mcp] unhandled error: ${e.message}\n`)
    );
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMessage(msg) {
  const { id, method, params } = msg;

  // Notifications have no id — don't respond
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized') {
      process.stderr.write('[gitled-mcp] initialized\n');
    }
    return;
  }

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'gitled', version: '1.0.0' }
      }
    });
    return;
  }

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    try {
      const result = await callTool(toolName, toolArgs);
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        }
      });
    } catch (e) {
      send({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Error: ${e.message}` }],
          isError: true
        }
      });
    }
    return;
  }

  // ping / health
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
}

process.stderr.write('[gitled-mcp] started, DB: ' + DB_PATH + '\n');
