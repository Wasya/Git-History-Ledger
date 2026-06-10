import React, { useState, useEffect, useRef } from 'react';
import { X, Search, GitCommit, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api/index.js';
import { useI18n } from '../i18n/I18nContext';

const GIT_LOG_COMMAND = 'git log --stat --format="%H %ad %an : %s" --date=short';

function today() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgo() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function ImportLogModal({ projects, selectedProjectId, onClose, onImportLog, catchUpCommits }) {
  const { t } = useI18n();

  const isCatchUp = !!catchUpCommits;

  const [projectId, setProjectId] = useState(selectedProjectId || (projects[0]?.id ?? ''));
  const [mode, setMode] = useState('auto');
  const [fromDate, setFromDate] = useState(monthAgo());
  const [toDate, setToDate] = useState(today());
  const [previewData, setPreviewData] = useState(isCatchUp ? catchUpCommits : null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [selectedHashes, setSelectedHashes] = useState(
    isCatchUp ? new Set(catchUpCommits.map((c) => c.hash)) : new Set()
  );
  const [rawText, setRawText] = useState('');
  const [analyzeAfterImport, setAnalyzeAfterImport] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const selectedProject = projects.find((p) => p.id === Number(projectId));
  const hasPath = !!selectedProject?.path;

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Reset preview when project or dates change (not in catch-up mode — data is pre-loaded)
  useEffect(() => {
    if (isCatchUp) return;
    setPreviewData(null);
    setPreviewError('');
    setSelectedHashes(new Set());
  }, [isCatchUp, projectId, fromDate, toDate]);

  const handlePreview = async () => {
    if (!projectId) { setPreviewError(t('importLog.errorNoProject')); return; }
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewData(null);
    setSelectedHashes(new Set());
    try {
      const data = await api.logPreview(projectId, fromDate || undefined, toDate || undefined);
      setPreviewData(data);
      const newSelected = new Set(data.filter((c) => !c.already_exists).map((c) => c.hash));
      setSelectedHashes(newSelected);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleHash = (hash) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const toggleAll = () => {
    const available = (previewData || []).filter((c) => !c.already_exists).map((c) => c.hash);
    if (available.every((h) => selectedHashes.has(h))) {
      setSelectedHashes(new Set());
    } else {
      setSelectedHashes(new Set(available));
    }
  };

  const importCount =
    mode === 'auto'
      ? selectedHashes.size
      : rawText.trim().split('\n').filter((l) => /^[a-f0-9]{7,}/.test(l.trim())).length;

  const handleImport = async () => {
    setError('');
    if (!projectId) { setError(t('importLog.errorNoProject')); return; }

    if (mode === 'auto') {
      if (!previewData) { setError(t('importLog.errorNoDates')); return; }
      if (selectedHashes.size === 0) { setError(t('importLog.noNewCommits')); return; }
      try {
        setStatus(t('importLog.importing'));
        const newCommits = await api.importLog({ project_id: Number(projectId), hashes: [...selectedHashes] });
        await runAnalyze(newCommits);
        onImportLog(newCommits, Number(projectId));
        onClose();
      } catch (err) {
        setError(err.message);
        setStatus('');
      }
    } else {
      if (!rawText.trim()) { setError(t('importLog.errorNoText')); return; }
      try {
        setStatus(t('importLog.importing'));
        const newCommits = await api.importLog({ project_id: Number(projectId), raw_text: rawText.trim() });
        await runAnalyze(newCommits);
        onImportLog(newCommits, Number(projectId));
        onClose();
      } catch (err) {
        setError(err.message);
        setStatus('');
      }
    }
  };

  const runAnalyze = async (commits) => {
    if (!analyzeAfterImport || !commits.length) return;
    for (let i = 0; i < commits.length; i++) {
      setStatus(t('importLog.analyzing', { n: i + 1, total: commits.length }));
      try {
        const updated = await api.analyzeCommit(commits[i].id);
        commits[i] = updated;
      } catch (e) {
        console.error('[analyze]', e.message);
      }
    }
  };

  const skippedCount = (previewData || []).filter((c) => c.already_exists).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <GitCommit size={16} className={isCatchUp ? 'text-amber-500' : 'text-indigo-500'} />
            {isCatchUp
              ? t('importLog.catchUpTitle', { count: catchUpCommits.length })
              : t('importLog.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Project selector — read-only in catch-up mode */}
          <div>
            <label className="block text-sm font-medium mb-1">{t('importLog.projectLabel')}</label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isCatchUp}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Catch-up hint */}
          {isCatchUp && (
            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              {t('importLog.catchUpHint')}
            </p>
          )}

          {/* Mode tabs — hidden in catch-up mode */}
          {!isCatchUp && (
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
              {['auto', 'paste'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                    mode === m
                      ? 'bg-white dark:bg-gray-700 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {m === 'auto' ? t('importLog.tabAuto') : t('importLog.tabPaste')}
                </button>
              ))}
            </div>
          )}

          {/* AUTO MODE */}
          {!isCatchUp && mode === 'auto' && (
            <div className="space-y-3">
              {hasPath ? (
                <p className="text-xs text-gray-400 font-mono truncate">
                  {t('importLog.pathInfo', { path: selectedProject.path })}
                </p>
              ) : (
                <p className="text-xs text-amber-500">{t('importLog.pathMissing')}</p>
              )}

              {/* Date range */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1 text-gray-500">{t('importLog.fromLabel')}</label>
                  <input type="date" className="input text-sm" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1 text-gray-500">{t('importLog.toLabel')}</label>
                  <input type="date" className="input text-sm" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <button
                  onClick={handlePreview}
                  disabled={!hasPath || previewLoading}
                  className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Search size={14} />
                  {previewLoading ? t('importLog.previewLoading') : t('importLog.previewBtn')}
                </button>
              </div>

              {/* Preview error */}
              {previewError && <p className="text-red-500 text-sm">{previewError}</p>}

              {/* Preview results */}
              {previewData !== null && (
                <div className="space-y-2">
                  {previewData.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">{t('importLog.previewEmpty')}</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          {t('importLog.previewFound', { total: previewData.length, skipped: skippedCount })}
                        </p>
                        {previewData.some((c) => !c.already_exists) && (
                          <button onClick={toggleAll} className="text-xs text-indigo-500 hover:underline">
                            {previewData.filter((c) => !c.already_exists).every((c) => selectedHashes.has(c.hash))
                              ? t('importLog.deselectAll')
                              : t('importLog.selectAll')}
                          </button>
                        )}
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-y-auto max-h-52">
                        {previewData.map((c) => (
                          <label
                            key={c.hash}
                            className={`flex items-start gap-2.5 px-3 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 ${
                              c.already_exists ? 'opacity-50 cursor-default' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 flex-shrink-0 rounded border-gray-300 text-indigo-600"
                              checked={selectedHashes.has(c.hash)}
                              disabled={c.already_exists}
                              onChange={() => !c.already_exists && toggleHash(c.hash)}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-xs text-indigo-500 font-mono">{c.hash.slice(0, 7)}</code>
                                <span className="text-xs text-gray-400">{c.date}</span>
                                <span className="text-xs text-gray-500">{c.author}</span>
                                {c.already_exists && (
                                  <span className="text-xs text-amber-500 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
                                    {t('importLog.alreadyImported')}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-700 dark:text-gray-300 truncate mt-0.5">{c.message}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PASTE MODE */}
          {!isCatchUp && mode === 'paste' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">{t('importLog.pasteHint')}</p>
              <pre className="bg-gray-100 dark:bg-gray-900 text-xs font-mono p-3 rounded-lg overflow-x-auto select-all">
                {GIT_LOG_COMMAND}
              </pre>
              <label className="block text-sm font-medium">{t('importLog.pasteLabel')}</label>
              <textarea
                className="input font-mono text-xs h-52 resize-none"
                placeholder={`abc1234 2026-04-28 John Doe : Fix login bug\n\n src/auth.py | 5 +++--\n 1 file changed, 3 insertions(+), 2 deletions(-)\n\ndef5678 2026-04-20 Jane Smith : Add export feature\n...`}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* CATCH-UP commit list */}
          {isCatchUp && previewData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {t('importLog.previewFound', { total: previewData.length, skipped: 0 })}
                </p>
                <button onClick={toggleAll} className="text-xs text-indigo-500 hover:underline">
                  {previewData.every((c) => selectedHashes.has(c.hash))
                    ? t('importLog.deselectAll')
                    : t('importLog.selectAll')}
                </button>
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-y-auto max-h-64">
                {previewData.map((c) => (
                  <label
                    key={c.hash}
                    className="flex items-start gap-2.5 px-3 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 flex-shrink-0 rounded border-gray-300 text-indigo-600"
                      checked={selectedHashes.has(c.hash)}
                      onChange={() => toggleHash(c.hash)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-indigo-500 font-mono">{c.hash.slice(0, 7)}</code>
                        <span className="text-xs text-gray-400">{c.date}</span>
                        <span className="text-xs text-gray-500">{c.author}</span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate mt-0.5">{c.message}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Analyze checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={analyzeAfterImport}
              onChange={(e) => setAnalyzeAfterImport(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm">{t('importLog.analyzeAfterImport')}</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span className="text-xs text-gray-400">{status}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">{t('importLog.cancel')}</button>
            <button
              onClick={handleImport}
              disabled={!!status}
              className={`disabled:opacity-40 disabled:cursor-not-allowed ${isCatchUp ? 'btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500' : 'btn-primary'}`}
            >
              <GitCommit size={14} />
              {status || (isCatchUp
                ? t('importLog.catchUpBtn', { count: selectedHashes.size })
                : t('importLog.importBtn', { count: importCount }))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
