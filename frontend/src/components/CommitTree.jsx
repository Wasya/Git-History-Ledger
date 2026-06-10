import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Calendar, CalendarDays } from 'lucide-react';
import CommitEntry from './CommitEntry';
import { groupCommits } from '../utils/groupCommits';
import { useI18n } from '../i18n/I18nContext';

function Section({ title, count, level, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? true);

  const levelStyles = [
    'text-base font-bold text-gray-800 dark:text-gray-100',
    'text-sm font-semibold text-gray-700 dark:text-gray-200',
    'text-xs font-medium text-gray-500 dark:text-gray-400',
    'text-xs text-gray-500 dark:text-gray-400',
  ];

  const bgStyles = [
    'hover:bg-gray-100 dark:hover:bg-gray-800/60',
    'hover:bg-gray-100 dark:hover:bg-gray-800/40',
    'hover:bg-gray-50 dark:hover:bg-gray-800/20',
    'hover:bg-gray-50 dark:hover:bg-gray-800/10',
  ];

  const indent = level * 16;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{ paddingLeft: indent + 8 }}
        className={`flex items-center gap-2 w-full py-1.5 pr-3 text-left transition-colors rounded-md ${bgStyles[level]}`}
      >
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className={levelStyles[level]}>{title}</span>
        <span className="ml-auto text-xs text-gray-400 tabular-nums">{count}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: indent + 16 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function countLeaves(obj) {
  if (Array.isArray(obj)) return obj.length;
  return Object.values(obj).reduce((s, v) => s + countLeaves(v), 0);
}

export default function CommitTree({ commits, onUpdate, onDelete, remoteUrl }) {
  const { t } = useI18n();

  if (!commits || commits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <CalendarDays size={40} className="mb-3 opacity-30" />
        <p className="text-sm">{t('commitTree.empty')}</p>
      </div>
    );
  }

  const tree = groupCommits(commits);

  return (
    <div className="space-y-1 px-1">
      {Object.entries(tree).sort(([a], [b]) => Number(b) - Number(a)).map(([year, months]) => (
        <Section key={year} title={year} level={0} count={countLeaves(months)} defaultOpen={true}>
          {Object.entries(months).map(([month, weeks]) => (
            <Section key={month} title={month} level={1} count={countLeaves(weeks)} defaultOpen={true}>
              {Object.entries(weeks).map(([week, days]) => (
                <Section key={week} title={week} level={2} count={countLeaves(days)} defaultOpen={true}>
                  {Object.entries(days).sort(([, aC], [, bC]) => {
                    const ta = aC[0]?.commit_date || aC[0]?.created_at || 0;
                    const tb = bC[0]?.commit_date || bC[0]?.created_at || 0;
                    return new Date(tb) - new Date(ta);
                  }).map(([day, dayCommits]) => (
                    <Section key={day} title={day} level={3} count={dayCommits.length} defaultOpen={true}>
                      {dayCommits.map((commit) => (
                        <CommitEntry
                          key={commit.id}
                          commit={commit}
                          onUpdate={onUpdate}
                          onDelete={onDelete}
                          remoteUrl={remoteUrl}
                        />
                      ))}
                    </Section>
                  ))}
                </Section>
              ))}
            </Section>
          ))}
        </Section>
      ))}
    </div>
  );
}
