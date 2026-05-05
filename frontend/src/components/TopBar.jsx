import React, { useState, useRef, useEffect } from 'react';
import { Search, Upload, Sun, Moon, GitBranch, Settings, GitCommit, ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export default function TopBar({ search, onSearch, onImport, onImportLog, theme, onToggleTheme, hasProject, onSettings }) {
  const { t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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
        {/* Import dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu((v) => !v)}
            disabled={!hasProject}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('topbar.importTooltip')}
          >
            <Upload size={14} />
            <span className="hidden sm:inline">{t('topbar.import')}</span>
            <ChevronDown size={12} className={`transition-transform ${showMenu ? 'rotate-180' : ''}`} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => { onImport(); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
              >
                <Upload size={14} className="text-indigo-500 flex-shrink-0" />
                <div>
                  <div className="font-medium">{t('topbar.importPull')}</div>
                  <div className="text-xs text-gray-400">git pull</div>
                </div>
              </button>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={() => { onImportLog(); setShowMenu(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
              >
                <GitCommit size={14} className="text-indigo-500 flex-shrink-0" />
                <div>
                  <div className="font-medium">{t('topbar.importLog')}</div>
                  <div className="text-xs text-gray-400">git log --stat</div>
                </div>
              </button>
            </div>
          )}
        </div>

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
