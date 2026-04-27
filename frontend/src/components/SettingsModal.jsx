import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, CheckCircle, XCircle, Loader, Info, RefreshCw, Globe, Download } from 'lucide-react';
import { api } from '../api/index.js';
import { applyFontSettings } from '../App.jsx';
import { useI18n } from '../i18n/I18nContext';

const MONO_FONTS = [
  { id: '',                value: '',                                                                          google: '' },
  { id: 'consolas',        value: "Consolas, 'Courier New', monospace",                                        label: 'Consolas',                  google: '' },
  { id: 'courier',         value: "'Courier New', Courier, monospace",                                         label: 'Courier New',               google: '' },
  { id: 'fira-code',       value: "'Fira Code', Consolas, monospace",                                          label: 'Fira Code',                 google: 'Fira+Code' },
  { id: 'jetbrains-mono',  value: "'JetBrains Mono', Consolas, monospace",                                     label: 'JetBrains Mono',            google: 'JetBrains+Mono' },
  { id: 'source-code-pro', value: "'Source Code Pro', Consolas, monospace",                                    label: 'Source Code Pro',           google: 'Source+Code+Pro' },
  { id: 'cascadia',        value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",                     label: 'Cascadia Code',             google: '' },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16];

const PROVIDERS = [
  {
    id: 'xai',
    label: 'xAI (Grok)',
    needsKey: true,
    defaultModel: 'grok-3-fast-beta',
    defaultUrl: 'https://api.x.ai/v1',
    models: ['grok-3-fast-beta', 'grok-3-beta', 'grok-2-1212'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    needsKey: true,
    defaultModel: 'gpt-4o-mini',
    defaultUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude API)',
    needsKey: true,
    defaultModel: 'claude-3-5-haiku-20251001',
    defaultUrl: '',
    models: ['claude-3-5-haiku-20251001', 'claude-3-5-sonnet-20241022', 'claude-opus-4-6'],
  },
  {
    id: 'claude_cli',
    label: 'Claude Code (CLI)',
    needsKey: false,
    defaultModel: '',
    defaultUrl: '',
    models: [],
  },
  {
    id: 'ollama',
    needsKey: false,
    defaultModel: '',
    defaultUrl: 'http://localhost:11434/v1',
    models: [],
  },
];

export default function SettingsModal({ onClose }) {
  const { t, locale, setLocale, customFileName, loadCustomFile, downloadTemplate } = useI18n();

  const [settings, setSettings] = useState({
    ai_provider: '',
    ai_api_key: '',
    ai_model: '',
    ai_base_url: '',
    ai_prompt_lang: 'ru',
    ai_prompt_custom: '',
    font_mono: '',
    font_mono_google: '',
    font_size: 12,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [ollamaError, setOllamaError] = useState('');
  const [defaultPrompts, setDefaultPrompts] = useState({ ru: '', en: '' });

  const langFileRef = useRef(null);

  useEffect(() => {
    Promise.all([api.getSettings(), api.getDefaultPrompts()]).then(([s, prompts]) => {
      setSettings(s);
      setDefaultPrompts(prompts);
      setLoading(false);
      if (s.ai_provider === 'ollama') loadOllamaModels();
    });
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const loadOllamaModels = async () => {
    setOllamaLoading(true);
    setOllamaError('');
    try {
      const data = await api.getOllamaModels();
      setOllamaModels(data.models || []);
    } catch (err) {
      setOllamaError(err.message);
    } finally {
      setOllamaLoading(false);
    }
  };

  const selectedProvider = PROVIDERS.find((p) => p.id === settings.ai_provider);

  const handleProviderChange = (id) => {
    const prov = PROVIDERS.find((p) => p.id === id);
    setSettings((s) => ({
      ...s,
      ai_provider: id,
      ai_model: prov?.defaultModel || '',
      ai_base_url: prov?.defaultUrl || '',
      ai_api_key: id !== s.ai_provider ? '' : s.ai_api_key,
    }));
    setTestResult(null);
    if (id === 'ollama') loadOllamaModels();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    await api.saveSettings(settings).catch(() => {});
    try {
      const res = await api.testConnection();
      if (res.success) {
        setTestResult({ success: true, message: t('settings.connectionOK', { reply: res.reply }) });
      } else {
        setTestResult({ success: false, message: res.error || t('settings.connectionError') });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Loader className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1">

          {/* Interface Language */}
          <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-3">
              <Globe size={12} />
              {t('settings.interfaceLang')}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {[['ru', t('settings.langRu')], ['en', t('settings.langEn')]].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="ui_lang"
                    value={val}
                    checked={locale === val}
                    onChange={() => setLocale(val)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}

              {/* Custom file zone */}
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  ref={langFileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => { if (e.target.files[0]) loadCustomFile(e.target.files[0]); e.target.value = ''; }}
                />
                <button
                  onClick={() => langFileRef.current?.click()}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors flex items-center gap-1 ${
                    locale === 'custom'
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                      : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {locale === 'custom' && customFileName
                    ? customFileName
                    : t('settings.loadLangFile')}
                </button>
                {locale === 'custom' && (
                  <button
                    onClick={() => setLocale('ru')}
                    className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    title={t('settings.resetLang')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Download template */}
              <button
                onClick={downloadTemplate}
                className="ml-auto text-xs flex items-center gap-1 text-gray-400 hover:text-indigo-500 transition-colors"
                title={t('settings.downloadTemplate')}
              >
                <Download size={12} />
                {t('settings.downloadTemplate')}
              </button>
            </div>
          </div>

          {/* Provider selector */}
          <div>
            <label className="block text-sm font-medium mb-2">{t('settings.aiProvider')}</label>
            <div className="grid grid-cols-1 gap-2">
              {PROVIDERS.map((prov) => (
                <label
                  key={prov.id}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                    ${settings.ai_provider === prov.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={prov.id}
                    checked={settings.ai_provider === prov.id}
                    onChange={() => handleProviderChange(prov.id)}
                    className="mt-0.5 accent-indigo-600"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      {prov.id === 'ollama' ? t('settings.ollamaLabel') : prov.label}
                    </span>
                    {prov.id === 'claude_cli' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {t('settings.claudeCLIDescription')}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Provider-specific fields */}
          {selectedProvider && selectedProvider.id !== 'claude_cli' && (
            <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">

              {selectedProvider.needsKey && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.apiKey')}</label>
                  <input
                    type="password"
                    className="input text-sm"
                    placeholder={t('settings.apiKeyPlaceholder')}
                    value={settings.ai_api_key}
                    onChange={(e) => setSettings((s) => ({ ...s, ai_api_key: e.target.value }))}
                  />
                </div>
              )}

              {selectedProvider.id === 'ollama' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-500">{t('settings.model')}</label>
                    <button
                      onClick={loadOllamaModels}
                      disabled={ollamaLoading}
                      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-400"
                    >
                      <RefreshCw size={11} className={ollamaLoading ? 'animate-spin' : ''} />
                      {t('settings.refreshModels')}
                    </button>
                  </div>
                  {ollamaError && (
                    <p className="text-xs text-red-500 mb-1">{ollamaError}</p>
                  )}
                  {ollamaModels.length > 0 ? (
                    <select
                      className="input text-sm"
                      value={settings.ai_model}
                      onChange={(e) => setSettings((s) => ({ ...s, ai_model: e.target.value }))}
                    >
                      <option value="">{t('settings.selectModel')}</option>
                      {ollamaModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="input text-sm flex-1"
                        placeholder={t('settings.modelPlaceholder')}
                        value={settings.ai_model}
                        onChange={(e) => setSettings((s) => ({ ...s, ai_model: e.target.value }))}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.model')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input text-sm flex-1"
                      value={settings.ai_model || selectedProvider.defaultModel}
                      onChange={(e) => setSettings((s) => ({ ...s, ai_model: e.target.value }))}
                      placeholder={selectedProvider.defaultModel}
                    />
                    {selectedProvider.models.length > 0 && (
                      <select
                        className="input text-sm w-auto"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setSettings((s) => ({ ...s, ai_model: e.target.value }));
                        }}
                      >
                        <option value="">{t('settings.selectModelDropdown')}</option>
                        {selectedProvider.models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {(selectedProvider.id === 'ollama' || settings.ai_base_url) && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{t('settings.baseUrl')}</label>
                  <input
                    type="text"
                    className="input text-sm font-mono"
                    value={settings.ai_base_url || selectedProvider.defaultUrl}
                    onChange={(e) => setSettings((s) => ({ ...s, ai_base_url: e.target.value }))}
                    placeholder={selectedProvider.defaultUrl}
                  />
                </div>
              )}
            </div>
          )}

          {/* Claude CLI info */}
          {selectedProvider?.id === 'claude_cli' && (
            <div className="flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-xs text-blue-800 dark:text-blue-300">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                {t('settings.claudeCLISetup1')} <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">claude</code> {t('settings.claudeCLISetup2')} <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">claude -p "test"</code>
              </div>
            </div>
          )}

          {/* Analysis language */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-xs font-medium text-gray-500 mb-2">{t('settings.analysisLang')}</label>
            <div className="flex gap-4">
              {[['ru', t('settings.langRu')], ['en', t('settings.langEn')]].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="lang"
                    value={val}
                    checked={settings.ai_prompt_lang === val}
                    onChange={() => setSettings((s) => ({ ...s, ai_prompt_lang: val }))}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Font settings */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <label className="block text-xs font-medium text-gray-500">{t('settings.codeFont')}</label>
            <div className="flex gap-2">
              <select
                className="input text-sm flex-1"
                value={settings.font_mono}
                onChange={(e) => {
                  const font = MONO_FONTS.find((f) => f.value === e.target.value) || MONO_FONTS[0];
                  const next = { ...settings, font_mono: font.value, font_mono_google: font.google };
                  setSettings(next);
                  applyFontSettings(next);
                }}
              >
                {MONO_FONTS.map((f) => (
                  <option key={f.id} value={f.value}>
                    {f.id === '' ? t('settings.fontDefault') : f.label}
                  </option>
                ))}
              </select>
              <select
                className="input text-sm w-24"
                value={settings.font_size}
                onChange={(e) => {
                  const next = { ...settings, font_size: Number(e.target.value) };
                  setSettings(next);
                  applyFontSettings(next);
                }}
              >
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>{s} px</option>
                ))}
              </select>
            </div>
            <p
              className="font-mono text-xs text-gray-500 dark:text-gray-400 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 rounded"
              style={{ fontFamily: settings.font_mono || undefined, fontSize: (settings.font_size || 12) + 'px' }}
            >
              const answer = 42; // preview
            </p>
          </div>

          {/* Custom prompt */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">{t('settings.promptTemplate')}</label>
              <button
                onClick={() => {
                  const def = defaultPrompts[settings.ai_prompt_lang || 'ru'] || defaultPrompts.ru;
                  setSettings((s) => ({ ...s, ai_prompt_custom: def }));
                }}
                className="text-xs text-indigo-500 hover:text-indigo-400"
              >
                {t('settings.promptReset')}
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              {t('settings.promptVariables')}{' '}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{projectName}'}</code>{' '}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{projectPath}'}</code>{' '}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{gitOutput}'}</code>
            </p>
            <textarea
              className="w-full input text-xs font-mono resize-y"
              rows={12}
              placeholder={defaultPrompts[settings.ai_prompt_lang || 'ru'] || ''}
              value={settings.ai_prompt_custom || ''}
              onChange={(e) => setSettings((s) => ({ ...s, ai_prompt_custom: e.target.value }))}
              spellCheck={false}
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
              testResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-300'
            }`}>
              {testResult.success
                ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                : <XCircle size={16} className="flex-shrink-0 mt-0.5" />
              }
              <span className="break-all">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={handleTest}
            disabled={testing || !settings.ai_provider}
            className="btn-secondary text-xs disabled:opacity-40 flex items-center gap-1.5"
          >
            {testing && <Loader size={13} className="animate-spin" />}
            {t('settings.testConnection')}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">{t('settings.close')}</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              {saving && <Loader size={13} className="animate-spin" />}
              {saved ? t('settings.saved') : t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
