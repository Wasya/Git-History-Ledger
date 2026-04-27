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

function buildPrompt(gitOutput, projectName, config, projectPath) {
  const custom = (config && config.ai_prompt_custom || '').trim();
  const lang = (config && config.ai_prompt_lang) || 'ru';
  const template = custom || (lang !== 'en' ? DEFAULT_PROMPT_RU : DEFAULT_PROMPT_EN);

  return template
    .replace(/\{projectName\}/g, projectName)
    .replace(/\{projectPath\}/g, projectPath || '')
    .replace(/\{gitOutput\}/g, gitOutput.slice(0, 6000));
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
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
  fs.writeFileSync(tmpFile, prompt, 'utf8');

  try {
    const dirFlag = projectPath ? ` --add-dir "${projectPath}"` : '';
    const cmd = process.platform === 'win32'
      ? `type "${tmpFile}" | claude -p${dirFlag}`
      : `claude -p${dirFlag} < "${tmpFile}"`;

    const opts = {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      shell: true,
    };
    if (projectPath) opts.cwd = projectPath;

    const output = execSync(cmd, opts);

    const text = (output || '').trim();
    if (!text) throw new Error('claude CLI вернул пустой ответ');
    return text;
  } catch (err) {
    // execSync throws with .stderr / .stdout / .message
    const detail = (err.stderr || err.stdout || err.message || '').toString().slice(0, 400);
    throw new Error(`claude CLI ошибка: ${detail}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function analyzeWithAI(config, gitOutput, projectName, projectPath) {
  const provider = config.ai_provider;
  if (!provider) return null;

  const defaults = PROVIDER_DEFAULTS[provider] || {};
  const baseUrl = config.ai_base_url || defaults.base_url || '';
  const model   = config.ai_model    || defaults.model    || '';
  const apiKey  = config.ai_api_key  || '';

  const prompt = buildPrompt(gitOutput, projectName, config, projectPath);

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

module.exports = { analyzeWithAI, askWithContext, testConnection, PROVIDER_DEFAULTS, DEFAULT_PROMPT_RU, DEFAULT_PROMPT_EN };
