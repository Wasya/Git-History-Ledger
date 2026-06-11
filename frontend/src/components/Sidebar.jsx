import React from 'react';
import { FolderGit2, Plus, Trash2, GitPullRequest, RefreshCw, Loader, ScanSearch, Pencil } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export default function Sidebar({ projects, selectedId, onSelect, onAdd, onEdit, onDelete, onPull, onPullOnly, pullingId, gapCounts = {}, onRefreshGaps, refreshingGaps, onCatchUp }) {
  const { t } = useI18n();
  return (
    <aside className="w-64 flex-shrink-0 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('sidebar.projects')}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshGaps}
            disabled={refreshingGaps}
            className="text-gray-400 hover:text-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-wait"
            title={t('sidebar.refreshGaps')}
          >
            {refreshingGaps
              ? <Loader size={14} className="animate-spin" />
              : <ScanSearch size={14} />
            }
          </button>
          <button
            onClick={onAdd}
            className="text-gray-400 hover:text-indigo-500 transition-colors"
            title={t('sidebar.addProject')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {projects.length === 0 && (
          <p className="text-xs text-gray-400 px-4 py-3">{t('sidebar.noProjects')}</p>
        )}
        {projects.map((p) => {
          const isPulling = pullingId === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`
                group flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors
                ${selectedId === p.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              <FolderGit2 size={15} className="flex-shrink-0 opacity-70" />
              <span className="flex-1 truncate">{p.name}</span>

              {gapCounts[p.id] > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCatchUp(p.id); }}
                  className="flex-shrink-0 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none hover:bg-amber-600 transition-colors"
                  title={t('sidebar.gapBadgeTitle', { count: gapCounts[p.id] })}
                >
                  {gapCounts[p.id]}
                </button>
              )}

              <button
                onClick={(e) => { e.stopPropagation(); onPullOnly(p.id); }}
                disabled={isPulling}
                className={`
                  flex-shrink-0 p-1 rounded transition-all
                  ${isPulling
                    ? 'text-gray-300 cursor-wait'
                    : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-green-500'
                  }
                `}
                title={t('sidebar.pullNoAI')}
              >
                <RefreshCw size={13} />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onPull(p.id); }}
                disabled={isPulling}
                className={`
                  flex-shrink-0 p-1 rounded transition-all
                  ${isPulling
                    ? 'text-indigo-400 cursor-wait'
                    : 'opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-500'
                  }
                `}
                title={t('sidebar.pullWithAI')}
              >
                {isPulling
                  ? <Loader size={13} className="animate-spin" />
                  : <GitPullRequest size={13} />
                }
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-indigo-500 transition-all"
                title={t('sidebar.editProject')}
              >
                <Pencil size={13} />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                title={t('sidebar.deleteProject')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
