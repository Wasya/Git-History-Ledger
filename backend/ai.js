const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROVIDER_DEFAULTS = {
  xai:        { base_url: 'https://api.x.ai/v1',          model: 'grok-3-fast-beta' },
  openai:     { base_url: 'https://api.openai.com/v1',    model: 'gpt-4o-mini' },
  anthropic:  { base_url: '',                              model: 'claude-3-5-haiku-20251001' },
  claude_cli: { base_url: '',                              model: '' },
  ollama:     { base_url: 'http://localhost:11434/v1',     model: '' },
};

const DEFAULT_PROMPT_RU = `Ты — технический аналитик изменений кода. Проанализируй вывод git pull для проекта "{projectName}" и напиши краткое резюме в формате Markdown.

## Что изменилось
- Перечисли изменённые модули/компоненты (на основе путей файлов)

## Характер изменений
- Новые функции / баг-фиксы / рефакторинг / зависимости / конфиги

## Ключевые файлы
- Перечисли наиболее значимые файлы с кратким пояснением

Будь лаконичен. Не повторяй сырой вывод. Отвечай на русском.

Вывод git pull:
\`\`\`
{gitOutput}
\`\`\``;

const DEFAULT_PROMPT_EN = `You are a code change analyst. Analyze the git pull output for project "{projectName}" and write a concise Markdown summary.

## What changed
- List changed modules/components (based on file paths)

## Nature of changes
- New features / bug fixes / refactoring / dependencies / configs

## Key files
- List the most significant files with a brief explanation

Be concise. Don't repeat raw output.

Git pull output:
\`\`\`
{gitOutput}
\`\`\``;

function buildPrompt(gitOutput, projectName, config, projectPath, testsPath) {
  const custom = (config && config.ai_prompt_custom || '').trim();
  const lang = (config && config.ai_prompt_lang) || 'ru';
  const template = custom || (lang !== 'en' ? DEFAULT_PROMPT_RU : DEFAULT_PROMPT_EN);

  return template
    .replace(/\{projectName\}/g, projectName)
    .replace(/\{projectPath\}/g, projectPath || '')
    .replace(/\{testsPath\}/g, testsPath || '')
    .replace(/\{gitOutput\}/g, gitOutput.slice(0, 12000));
}

module.exports.DEFAULT_PROMPT_RU = DEFAULT_PROMPT_RU;
module.exports.DEFAULT_PROMPT_EN = DEFAULT_PROMPT_EN;

async function callOpenAICompatible(baseUrl, apiKey, model, prompt) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || 'ollama'}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.3,
      stream: false,
    }),
  });
  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${rawText.slice(0, 400)}`);
  }
  // Parse via Buffer to guarantee UTF-8 decoding regardless of Node.js fetch internals
  const data = JSON.parse(Buffer.from(rawText).toString('utf8'));
  // Null-safe extraction — Ollama or other providers may return different shapes
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`Пустой ответ от API. Тело: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content.trim();
}

async function callAnthropic(apiKey, model, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) {
    throw new Error(`Пустой ответ Anthropic. Тело: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return content.trim();
}

/**
 * Calls Claude Code CLI by writing the prompt to a temp file and piping it via stdin.
 * This avoids shell-escaping issues on Windows with long or special-char prompts.
 */
function callClaudeCLI(prompt, projectPath) {
  const tmpFile = path.join(os.tmpdir(), `gl_${Date.now()}.txt`);
  const mcpFile = path.join(os.tmpdir(), `gl_mcp_${Date.now()}.json`);
  fs.writeFileSync(tmpFile, prompt, 'utf8');
  // Empty MCP config so --strict-mcp-config loads no servers from global/project configs
  fs.writeFileSync(mcpFile, '{"mcpServers":{}}', 'utf8');

  try {
    const flags = `--strict-mcp-config --mcp-config "${mcpFile}" --disallowedTools "Bash,PowerShell"`;
    const cmd = process.platform === 'win32'
      ? `type "${tmpFile}" | claude -p ${flags}`
      : `claude -p ${flags} < "${tmpFile}"`;

    const opts = {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      shell: true,
    };

    const output = execSync(cmd, opts);

    const text = (output || '').trim();
    if (!text) throw new Error('claude CLI вернул пустой ответ');
    return text;
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().slice(0, 400);
    throw new Error(`claude CLI ошибка: ${detail}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
    try { fs.unlinkSync(mcpFile); } catch {}
  }
}

// Runs a single completed prompt against the configured provider.
function runPrompt(config, prompt, projectPath) {
  const provider = config.ai_provider;
  if (!provider) return null;

  const defaults = PROVIDER_DEFAULTS[provider] || {};
  const baseUrl = config.ai_base_url || defaults.base_url || '';
  const model   = config.ai_model    || defaults.model    || '';
  const apiKey  = config.ai_api_key  || '';

  switch (provider) {
    case 'claude_cli':
      return callClaudeCLI(prompt, projectPath);
    case 'anthropic':
      if (!apiKey) throw new Error('Anthropic API key не настроен');
      return callAnthropic(apiKey, model, prompt);
    case 'xai':
    case 'openai':
      if (!apiKey) throw new Error(`${provider} API key не настроен`);
      return callOpenAICompatible(baseUrl, apiKey, model, prompt);
    case 'ollama':
      if (!model) throw new Error('Модель Ollama не выбрана');
      return callOpenAICompatible(baseUrl, '', model, prompt);
    default:
      throw new Error(`Неизвестный провайдер: ${provider}`);
  }
}

async function analyzeWithAI(config, gitOutput, projectName, projectPath) {
  if (!config.ai_provider) return null;
  const prompt = buildPrompt(gitOutput, projectName, config, projectPath);
  return runPrompt(config, prompt, projectPath);
}

const NOTES_MARKER = '@@@NOTES@@@';

/**
 * Produces both the formatted analysis (description) and a short summary (notes)
 * in a single provider call. Optionally augments the prompt with relevant test
 * context gathered by the backend. Returns { description, notes }.
 */
async function analyzeForLedger(config, gitOutput, projectName, projectPath, testContext, testsPath) {
  if (!config.ai_provider) return { description: '', notes: '' };
  const ru = (config.ai_prompt_lang || 'ru') !== 'en';

  let prompt = buildPrompt(gitOutput, projectName, config, projectPath, testsPath);

  if (testContext && testContext.trim()) {
    prompt += ru
      ? `\n\n=== Существующие автотесты, возможно затронутые этим изменением ===\n${testContext}\n\nВ разделе про тестирование сошлись на эти тесты: какие из них стоит прогнать и есть ли пробелы в покрытии.`
      : `\n\n=== Existing automated tests possibly affected by this change ===\n${testContext}\n\nIn the testing section, reference these tests: which to run and whether coverage gaps exist.`;
  }

  prompt += ru
    ? `\n\nВ САМОМ КОНЦЕ ответа, на отдельной строке, выведи маркер ${NOTES_MARKER}, а после него — 1–3 предложения краткой сути изменения без форматирования (что сделано, почему важно, на что влияет).`
    : `\n\nAT THE VERY END, on its own line, output the marker ${NOTES_MARKER} followed by a 1–3 sentence plain-text summary (what was done, why it matters, what it affects).`;

  const raw = await runPrompt(config, prompt, projectPath);
  if (!raw) return { description: '', notes: '' };

  const idx = raw.indexOf(NOTES_MARKER);
  if (idx === -1) return { description: raw.trim(), notes: '' };
  return {
    description: raw.slice(0, idx).trim(),
    notes: raw.slice(idx + NOTES_MARKER.length).replace(/^[\s:—-]+/, '').trim(),
  };
}

async function testConnection(config) {
  const provider = config.ai_provider;
  if (!provider) throw new Error('Провайдер не настроен');

  const defaults = PROVIDER_DEFAULTS[provider] || {};
  const baseUrl = config.ai_base_url || defaults.base_url || '';
  const model   = config.ai_model    || defaults.model    || '';
  const apiKey  = config.ai_api_key  || '';

  const ping = 'Reply with exactly one word: OK';

  switch (provider) {
    case 'claude_cli':
      return callClaudeCLI(ping);
    case 'anthropic':
      if (!apiKey) throw new Error('API key не настроен');
      return callAnthropic(apiKey, model, ping);
    case 'xai':
    case 'openai':
      if (!apiKey) throw new Error('API key не настроен');
      return callOpenAICompatible(baseUrl, apiKey, model, ping);
    case 'ollama':
      if (!model) throw new Error('Модель не выбрана');
      return callOpenAICompatible(baseUrl, '', model, ping);
    default:
      throw new Error(`Неизвестный провайдер: ${provider}`);
  }
}

// ── Chat / Ask ─────────────────────────────────────────────────────────────

function buildContextSystem(commit, projectName, config, projectPath) {
  const ru = (config.ai_prompt_lang || 'ru') !== 'en';
  const raw  = (commit.raw_output   || '').slice(0, 5000);
  const desc = (commit.description  || '').slice(0, 3000);

  if (ru) {
    let ctx = `Ты — технический аналитик изменений кода. Помогай пользователю разобраться в изменениях проекта "${projectName}".`;
    if (projectPath) ctx += `\nПуть к репозиторию: ${projectPath}`;
    ctx += `\n\nВывод git pull:\n\`\`\`\n${raw}\n\`\`\``;
    if (desc) ctx += `\n\nСуществующий анализ:\n${desc}`;
    ctx += '\n\nОтвечай на русском языке, кратко и по делу.';
    return ctx;
  } else {
    let ctx = `You are a code change analyst. Help the user understand changes in project "${projectName}".`;
    if (projectPath) ctx += `\nRepository path: ${projectPath}`;
    ctx += `\n\nGit pull output:\n\`\`\`\n${raw}\n\`\`\``;
    if (desc) ctx += `\n\nExisting analysis:\n${desc}`;
    ctx += '\n\nBe concise and to the point.';
    return ctx;
  }
}

async function callOpenAICompatibleChat(baseUrl, apiKey, model, systemMsg, messages) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || 'ollama'}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      max_tokens: 1500,
      temperature: 0.3,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Пустой ответ от API. Тело: ${JSON.stringify(data).slice(0, 200)}`);
  return content.trim();
}

async function callAnthropicChat(apiKey, model, systemMsg, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, system: systemMsg, max_tokens: 1500, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (!content) throw new Error(`Пустой ответ Anthropic. Тело: ${JSON.stringify(data).slice(0, 200)}`);
  return content.trim();
}

function callClaudeCLIChat(systemMsg, messages, projectPath) {
  const lines = [systemMsg, '\n\n---\n'];
  for (const msg of messages) {
    lines.push(`\n**${msg.role === 'user' ? 'User' : 'Assistant'}:** ${msg.content}`);
  }
  return callClaudeCLI(lines.join(''), projectPath);
}

async function askWithContext(config, commit, projectName, messages, projectPath) {
  const provider = config.ai_provider;
  if (!provider) throw new Error('AI провайдер не настроен');

  // Empty messages = initial analysis via standard buildPrompt
  if (!messages || messages.length === 0) {
    return analyzeWithAI(config, commit.raw_output || '', projectName, projectPath);
  }

  const systemMsg = buildContextSystem(commit, projectName, config, projectPath);
  const defaults  = PROVIDER_DEFAULTS[provider] || {};
  const baseUrl   = config.ai_base_url || defaults.base_url || '';
  const model     = config.ai_model    || defaults.model    || '';
  const apiKey    = config.ai_api_key  || '';

  switch (provider) {
    case 'claude_cli':
      return callClaudeCLIChat(systemMsg, messages, projectPath);
    case 'anthropic':
      if (!apiKey) throw new Error('Anthropic API key не настроен');
      return callAnthropicChat(apiKey, model, systemMsg, messages);
    case 'xai':
    case 'openai':
      if (!apiKey) throw new Error(`${provider} API key не настроен`);
      return callOpenAICompatibleChat(baseUrl, apiKey, model, systemMsg, messages);
    case 'ollama':
      if (!model) throw new Error('Модель Ollama не выбрана');
      return callOpenAICompatibleChat(baseUrl, '', model, systemMsg, messages);
    default:
      throw new Error(`Неизвестный провайдер: ${provider}`);
  }
}

module.exports = { analyzeWithAI, analyzeForLedger, askWithContext, testConnection, PROVIDER_DEFAULTS, DEFAULT_PROMPT_RU, DEFAULT_PROMPT_EN };
