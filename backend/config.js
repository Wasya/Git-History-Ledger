const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULTS = {
  ai_provider: '',      // xai | openai | anthropic | claude_cli | ollama
  ai_api_key: '',
  ai_model: '',
  ai_base_url: '',
  ai_prompt_lang: 'ru',
  ai_prompt_custom: '',
  font_mono: '',        // CSS font-family string; empty = system default
  font_mono_google: '', // Google Fonts family param if font requires loading
  font_size: 12,        // code block font size in px
};

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(data) {
  const safe = {};
  for (const key of Object.keys(DEFAULTS)) {
    safe[key] = data[key] ?? DEFAULTS[key];
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(safe, null, 2));
  return safe;
}

module.exports = { getConfig, saveConfig, DEFAULTS };
