import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api/index.js';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import CommitTree from './components/CommitTree';
import ImportModal from './components/ImportModal';
import AddProjectModal from './components/AddProjectModal';
import SettingsModal from './components/SettingsModal';
import { useI18n } from './i18n/I18nContext';
import { GitBranch, CheckCircle, AlertCircle, Info } from 'lucide-react';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Toast types: 'success' | 'error' | 'info'
function Toast({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white animate-in slide-in-from-right-5 ${
            t.type === 'success' ? 'bg-green-600' :
            t.type === 'error'   ? 'bg-red-600' :
                                   'bg-gray-700'
          }`}
        >
          {t.type === 'success' && <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />}
          {t.type === 'error'   && <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />}
          {t.type === 'info'    && <Info size={15} className="flex-shrink-0 mt-0.5" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

function loadGoogleFont(family) {
  if (!family) return;
  const id = `gf-${family}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500&display=swap`;
  document.head.appendChild(link);
}

export function applyFontSettings(s) {
  const root = document.documentElement;
  root.style.setProperty('--code-font', s.font_mono || '');
  root.style.setProperty('--code-size', (s.font_size || 12) + 'px');
  if (s.font_mono_google) loadGoogleFont(s.font_mono_google);
}

export default function App() {
  const { t } = useI18n();

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Apply font settings on startup
  useEffect(() => {
    api.getSettings().then(applyFontSettings).catch(() => {});
  }, []);

  // Data
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [commits, setCommits] = useState([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);

  // Modals
  const [showImport, setShowImport] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Pull state
  const [pullingId, setPullingId] = useState(null);

  // Loading
  const [loading, setLoading] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  // Fetch projects on mount
  useEffect(() => {
    api.getProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedProjectId(list[0].id);
    });
  }, []);

  // Fetch commits when project or search changes
  useEffect(() => {
    if (!selectedProjectId && !debouncedSearch) {
      setCommits([]);
      return;
    }
    setLoading(true);
    api.getCommits(selectedProjectId, debouncedSearch)
      .then(setCommits)
      .finally(() => setLoading(false));
  }, [selectedProjectId, debouncedSearch]);

  // Handlers
  const handleAddProject = async (data) => {
    const p = await api.createProject(data);
    setProjects((prev) => [p, ...prev]);
    setSelectedProjectId(p.id);
  };

  const handleDeleteProject = async (id) => {
    if (!confirm(t('app.deleteProjectConfirm'))) return;
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProjectId === id) {
      const remaining = projects.filter((p) => p.id !== id);
      setSelectedProjectId(remaining[0]?.id ?? null);
    }
  };

  const handleGitPullOnly = async (projectId) => {
    if (pullingId) return;
    setPullingId(projectId);
    const project = projects.find((p) => p.id === projectId);
    try {
      const result = await api.gitPullOnly(projectId);
      if (result.status === 'up_to_date') {
        addToast(t('app.alreadyUpToDate', { name: project?.name }), 'info');
        return;
      }
      if (result.commits?.length > 0) {
        if (selectedProjectId === projectId) {
          setCommits((prev) => [...result.commits, ...prev]);
        }
        const n = result.commits.length;
        addToast(
          n === 1
            ? t('app.importedOne', { name: project?.name, count: n })
            : t('app.importedMany', { name: project?.name, count: n }),
          'success'
        );
      }
    } catch (err) {
      addToast(t('app.gitPullError', { message: err.message }), 'error', 6000);
    } finally {
      setPullingId(null);
    }
  };

  const handleGitPull = async (projectId) => {
    if (pullingId) return;
    setPullingId(projectId);
    const project = projects.find((p) => p.id === projectId);
    try {
      const result = await api.gitPull(projectId);

      if (result.status === 'up_to_date') {
        addToast(t('app.alreadyUpToDate', { name: project?.name }), 'info');
        return;
      }

      // Merge new commits into state if viewing same project
      if (result.commits?.length > 0) {
        if (selectedProjectId === projectId) {
          setCommits((prev) => [...result.commits, ...prev]);
        }
        const n = result.commits.length;
        addToast(
          n === 1
            ? t('app.importedOne', { name: project?.name, count: n })
            : t('app.importedMany', { name: project?.name, count: n }),
          'success'
        );
      }

      if (result.aiError) {
        addToast(t('app.aiError', { message: result.aiError }), 'error', 6000);
      }
    } catch (err) {
      addToast(t('app.gitPullError', { message: err.message }), 'error', 6000);
    } finally {
      setPullingId(null);
    }
  };

  const matchesSearch = (commit, q) => {
    const lower = q.toLowerCase();
    return (
      (commit.commit_hash || '').toLowerCase().includes(lower) ||
      (commit.branch || '').toLowerCase().includes(lower) ||
      (commit.description || '').toLowerCase().includes(lower) ||
      (commit.notes || '').toLowerCase().includes(lower)
    );
  };

  const handleImport = async (data) => {
    const result = await api.createCommit(data);
    const newCommits = Array.isArray(result) ? result : [result];
    const filtered = debouncedSearch
      ? newCommits.filter((c) => matchesSearch(c, debouncedSearch))
      : newCommits;
    if (filtered.length > 0) {
      setCommits((prev) => [...filtered, ...prev]);
    }
  };

  const handleUpdateCommit = async (id, data) => {
    const updated = await api.updateCommit(id, data);
    setCommits((prev) => prev.map((c) => (c.id === id ? updated : c)));
  };

  const handleDeleteCommit = async (id) => {
    if (!confirm(t('app.deleteCommitConfirm'))) return;
    await api.deleteCommit(id);
    setCommits((prev) => prev.filter((c) => c.id !== id));
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex h-full bg-white dark:bg-gray-900">
      <Sidebar
        projects={projects}
        selectedId={selectedProjectId}
        onSelect={setSelectedProjectId}
        onAdd={() => setShowAddProject(true)}
        onDelete={handleDeleteProject}
        onPull={handleGitPull}
        onPullOnly={handleGitPullOnly}
        pullingId={pullingId}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          search={search}
          onSearch={setSearch}
          onImport={() => setShowImport(true)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          hasProject={!!selectedProjectId}
          onSettings={() => setShowSettings(true)}
        />

        <main className="flex-1 overflow-y-auto px-5 py-4">
          {!selectedProjectId && !debouncedSearch ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <GitBranch size={48} className="mb-4 opacity-20" />
              <p className="text-sm">{t('app.emptyState')}</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {selectedProject && (
                <div className="mb-5 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-end justify-between gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50 leading-none">
                      {selectedProject.name}
                    </h1>
                    <span className="text-xs text-gray-400 shrink-0">
                      {commits.length === 1
                        ? t('app.commitsCountOne', { count: commits.length })
                        : t('app.commitsCountMany', { count: commits.length })}
                    </span>
                  </div>
                  {selectedProject.path && (
                    <p className="mt-1 text-xs text-gray-400 font-mono truncate">{selectedProject.path}</p>
                  )}
                </div>
              )}
              {debouncedSearch && (
                <p className="text-xs text-gray-400 mb-3">
                  {commits.length === 1
                    ? t('app.searchResultOne', { count: commits.length, query: debouncedSearch })
                    : t('app.searchResultMany', { count: commits.length, query: debouncedSearch })}
                </p>
              )}
              <CommitTree
                commits={commits}
                onUpdate={handleUpdateCommit}
                onDelete={handleDeleteCommit}
              />
            </>
          )}
        </main>
      </div>

      {showAddProject && (
        <AddProjectModal
          onClose={() => setShowAddProject(false)}
          onAdd={handleAddProject}
        />
      )}

      {showImport && (
        <ImportModal
          projects={projects}
          selectedProjectId={selectedProjectId}
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
