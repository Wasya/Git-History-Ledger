const fs = require('fs');
const path = require('path');

// Words that carry no signal for matching tests to a diff.
const STOP = new Set([
  'object', 'name', 'rows', 'expiration', 'expired', 'valid', 'until', 'base',
  'true', 'false', 'null', 'none', 'this', 'self', 'class', 'public', 'private',
  'static', 'void', 'string', 'array', 'index', 'value', 'return', 'const', 'function',
  'from', 'diff', 'git', 'index', 'http', 'https', 'www', 'com', 'php', 'java',
  'import', 'export', 'default', 'undefined', 'console', 'require', 'module',
]);

function listRobotFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listRobotFiles(full, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.robot')) acc.push(full);
  }
  return acc;
}

function addKw(map, tok, weight) {
  tok = (tok || '').trim().toLowerCase();
  if (tok.length < 4 || tok.length > 40) return;
  if (STOP.has(tok)) return;
  if (/^\d+$/.test(tok)) return;
  map.set(tok, (map.get(tok) || 0) + weight);
}

// Extract weighted keywords from a unified diff. Strongest signals: changed file
// basenames and quoted string literals; weakest: bare identifiers on +/- lines.
function extractKeywords(diff) {
  const kws = new Map();
  for (const line of String(diff || '').split('\n')) {
    const fileMatch = line.match(/^(?:diff --git a\/[^ ]+ b\/|\+\+\+ b\/|--- a\/)(.+)$/);
    if (fileMatch) {
      const base = path.basename(fileMatch[1].trim()).replace(/\.[A-Za-z0-9]+$/, '');
      for (const tok of base.split(/[^A-Za-z0-9]+/)) addKw(kws, tok, 3);
      continue;
    }
    if ((line.startsWith('+') || line.startsWith('-')) &&
        !line.startsWith('+++') && !line.startsWith('---')) {
      const body = line.slice(1);
      for (const q of body.match(/['"`]([^'"`]{3,40})['"`]/g) || []) {
        addKw(kws, q.replace(/['"`]/g, ''), 2);
      }
      for (const tok of body.split(/[^A-Za-z0-9_]+/)) addKw(kws, tok, 1);
    }
  }
  return kws;
}

// Pull test-case names from a .robot file: non-indented lines inside the
// `*** Test Cases ***` section.
function extractTestCases(content) {
  const names = [];
  const lines = content.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (/^\*\*\*/.test(line)) {
      inSection = /^\*\*\*\s*test cases\s*\*\*\*/i.test(line);
      continue;
    }
    if (!inSection) continue;
    if (!line.trim() || line.startsWith(' ') || line.startsWith('\t') || line.startsWith('#')) continue;
    names.push(line.trim());
  }
  return names;
}

/**
 * Finds automated tests relevant to a diff and returns a compact text block
 * for the AI prompt, or '' when nothing relevant / path unusable.
 */
function findRelevantTests(testsPath, diff, { maxFiles = 6, maxChars = 3500 } = {}) {
  if (!testsPath || !fs.existsSync(testsPath)) return '';

  const kws = extractKeywords(diff);
  if (kws.size === 0) return '';

  const files = listRobotFiles(testsPath);
  if (files.length === 0) return '';

  const scored = [];
  for (const file of files) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch (_) {
      continue;
    }
    const lower = content.toLowerCase();
    const nameLower = path.basename(file).toLowerCase();
    let score = 0;
    const hitKws = [];
    for (const [kw, weight] of kws) {
      let occ = 0;
      let idx = lower.indexOf(kw);
      while (idx !== -1 && occ < 50) { occ++; idx = lower.indexOf(kw, idx + kw.length); }
      if (nameLower.includes(kw)) score += weight * 5;
      if (occ > 0) { score += weight * Math.min(occ, 10); hitKws.push(kw); }
    }
    if (score > 0) scored.push({ file, content, score, hitKws });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxFiles);
  if (top.length === 0) return '';

  const blocks = [];
  let total = 0;
  for (const { file, content, hitKws } of top) {
    const rel = path.relative(testsPath, file);
    const cases = extractTestCases(content);
    // Prefer test cases whose name matches a hit keyword; else first few.
    const matched = cases.filter((c) => hitKws.some((kw) => c.toLowerCase().includes(kw)));
    const picked = (matched.length ? matched : cases).slice(0, 8);
    let block = `Файл: ${rel}`;
    for (const c of picked) block += `\n  - ${c}`;
    if (total + block.length > maxChars) break;
    blocks.push(block);
    total += block.length;
  }

  return blocks.join('\n');
}

module.exports = { findRelevantTests, extractKeywords, extractTestCases };
