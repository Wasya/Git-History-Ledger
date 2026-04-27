import React from 'react';
import { Search, Upload, Sun, Moon, GitBranch, Settings } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export default function TopBar({ search, onSearch, onImport, theme, onToggleTheme, hasProject, onSettings }) {
  const { t } = useI18n();
  return (
    <header className="flex-shrink-0 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-5 gap-4">
      <div className="flex items-center gap-2 flex-shrink-0">
        <GitBranch size={20} className="text-indigo-500" />
        <h1 className="font-semibold text-sm hidden sm:block">Git History Ledger</h1>
      </div>

      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('topbar.search')}
            className="input pl-9 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onImport}
          disabled={!hasProject}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('topbar.importTooltip')}
        >
          <Upload size={14} />
          <span className="hidden sm:inline">{t('topbar.import')}</span>
        </button>
        <button
          onClick={onSettings}
          className="btn-secondary p-1.5"
          title={t('topbar.settingsTooltip')}
        >
          <Settings size={15} />
        </button>
        <button
          onClick={onToggleTheme}
          className="btn-secondary p-1.5"
          title={t('topbar.themeTooltip')}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  );
}
