/**
 * Parses a single git pull session block into structured data.
 * Also used by parseMultipleSessions for each individual chunk.
 */
function parseGitPullOutput(rawText) {
  const result = {
    commitDate: null,
    branch: null,
    commitHash: null,
    raw_output: rawText.trim(),
    description: '',
  };

  // Date: === Mon 01/05/2026  9:54:35.33 === (hour can be 1 or 2 digits)
  const dateMatch = rawText.match(/===\s+\w{3}\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2}:\d{2})/);
  if (dateMatch) {
    const [month, day, year] = dateMatch[1].split('/');
    const timeParts = dateMatch[2].split(':').map((p) => p.padStart(2, '0'));
    result.commitDate = `${year}-${month}-${day}T${timeParts.join(':')}`;
  }

  // Hash range + branch: "   abc123..def456  master -> origin/master"
  const hashBranchMatch = rawText.match(/[ \t]+([a-f0-9]{6,40})\.\.([a-f0-9]{6,40})[ \t]+(\S+)\s+->/);
  if (hashBranchMatch) {
    result.commitHash = `${hashBranchMatch[1]}..${hashBranchMatch[2]}`;
    result.branch = hashBranchMatch[3];
  } else {
    // Fallback: extract hash from "Updating X..Y" (no fetch line present)
    const updatingMatch = rawText.match(/Updating\s+([a-f0-9]{6,40})\.\.([a-f0-9]{6,40})/);
    if (updatingMatch) {
      result.commitHash = `${updatingMatch[1]}..${updatingMatch[2]}`;
    }
  }

  result.description = '```diff\n' + rawText.trim() + '\n```';
  return result;
}

/**
 * Splits text containing multiple git pull sessions (each starting with
 * "=== Day MM/DD/YYYY ...") and parses each one individually.
 * Returns an array of parsed session objects.
 */
const SESSION_HEADER_RE = /===\s+\w{3}\s+\d{1,2}\/\d{2}\/\d{4}/;

function parseMultipleSessions(rawText) {
  const chunks = rawText
    .split(/(?====\s+\w{3}\s+\d{1,2}\/\d{2}\/\d{4})/)
    .filter((s) => SESSION_HEADER_RE.test(s));

  if (chunks.length === 0) {
    return [parseGitPullOutput(rawText)];
  }

  return chunks.map((chunk) => parseGitPullOutput(chunk.trim()));
}

/**
 * Parses output of:
 *   git log --stat --format="%H %ad %an : %s" --date=short
 * Each commit starts with a line matching: HASH YYYY-MM-DD AUTHOR : MESSAGE
 * Subsequent lines (file stats) are accumulated until the next commit line.
 */
const GIT_LOG_LINE_RE = /^([a-f0-9]{7,40})\s+(\d{4}-\d{2}-\d{2})\s+(.+?)\s*:\s*(.+)/;

function parseGitLog(rawText) {
  const lines = rawText.split('\n');
  const commits = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(GIT_LOG_LINE_RE);
    if (m) {
      if (current) commits.push(current);
      const [, hash, date] = m;
      current = { commitHash: hash, commitDate: `${date}T00:00:00`, headerLine: line.trim(), statLines: [] };
    } else if (current) {
      if (line.trim() || current.statLines.length > 0) {
        current.statLines.push(line);
      }
    }
  }
  if (current) commits.push(current);

  return commits.map((c) => {
    while (c.statLines.length && !c.statLines[c.statLines.length - 1].trim()) c.statLines.pop();
    const rawOutput = c.statLines.length
      ? c.headerLine + '\n\n' + c.statLines.join('\n')
      : c.headerLine;
    return {
      commitHash: c.commitHash,
      commitDate: c.commitDate,
      branch: null,
      raw_output: rawOutput.trim(),
      description: '```diff\n' + rawOutput.trim() + '\n```',
    };
  });
}

module.exports = { parseGitPullOutput, parseMultipleSessions, parseGitLog };
