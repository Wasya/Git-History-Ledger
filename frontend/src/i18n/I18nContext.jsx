import React, { createContext, useContext, useState, useCallback } from 'react';
import ruStrings from './locales/ru.json';
import enStrings from './locales/en.json';

const BUILTIN = { ru: ruStrings, en: enStrings };
const LOCALE_KEY = 'ui_lang';
const CUSTOM_KEY = 'ui_lang_custom';
const CUSTOM_NAME_KEY = 'ui_lang_custom_name';

const I18nContext = createContext(null);

function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}

function interpolate(str, params) {
  if (!params || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

function loadInitialStrings(locale) {
  if (locale === 'custom') {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return ruStrings;
  }
  return BUILTIN[locale] || ruStrings;
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(
    () => localStorage.getItem(LOCALE_KEY) || 'ru'
  );
  const [strings, setStrings] = useState(
    () => loadInitialStrings(localStorage.getItem(LOCALE_KEY) || 'ru')
  );
  const [customFileName, setCustomFileName] = useState(
    () => localStorage.getItem(CUSTOM_NAME_KEY) || null
  );

  const setLocale = useCallback((loc) => {
    setLocaleState(loc);
    localStorage.setItem(LOCALE_KEY, loc);
    setStrings(BUILTIN[loc] || ruStrings);
  }, []);

  const t = useCallback((key, params) => {
    const val = getPath(strings, key);
    if (val === undefined || val === null) return key;
    return interpolate(val, params);
  }, [strings]);

  const loadCustomFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target.result;
        const parsed = JSON.parse(raw);
        localStorage.setItem(CUSTOM_KEY, raw);
        localStorage.setItem(CUSTOM_NAME_KEY, file.name);
        localStorage.setItem(LOCALE_KEY, 'custom');
        setCustomFileName(file.name);
        setStrings(parsed);
        setLocaleState('custom');
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }, []);

  const downloadTemplate = useCallback(() => {
    const blob = new Blob([JSON.stringify(strings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitledger-lang-${locale === 'custom' ? 'custom' : locale}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [strings, locale]);

  return (
    <I18nContext.Provider value={{ t, locale, setLocale, customFileName, loadCustomFile, downloadTemplate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
