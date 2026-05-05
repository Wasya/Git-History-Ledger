import React, { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export default function ImportModal({ projects, selectedProjectId, onClose, onImport }) {
  const { t } = useI18n();
  const [rawText, setRawText] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState(selectedProjectId || (projects[0]?.id ?? ''));
  const [analyzeAfterImport, setAnalyzeAfterImport] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId) { setError(t('import.errorNoProject')); return; }
    if (!rawText.trim()) { setError(t('import.errorNoOutput')); return; }
    setLoading(true);
    try {
      await onImport({
        project_id: Number(projectId),
        raw_text: rawText.trim(),
        notes: notes.trim(),
        analyzeAfterImport,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-base font-semibold">{t('import.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">{t('import.projectLabel')}</label>
            <select
              className="input"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('import.gitOutputLabel')}
              <span className="text-gray-400 font-normal ml-2 text-xs">{t('import.gitOutputHelper')}</span>
            </label>
            <textarea
              className="input font-mono text-xs h-52 resize-none"
              placeholder={`=== Fri 03/20/2026 16:37:51.59 ============================\nFrom 192.0.2.1:/srv/git/my-project\n   2b980259..bd548394  master     -> origin/master\nUpdating 2b980259..bd548394\nFast-forward\n ...`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('import.notesLabel')} <span className="text-gray-400 font-normal text-xs">{t('import.notesOptional')}</span>
            </label>
            <textarea
              className="input h-20 resize-none"
              placeholder={t('import.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={analyzeAfterImport}
              onChange={(e) => setAnalyzeAfterImport(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600"
            />
            <span className="text-sm">{t('import.analyzeAfterImport')}</span>
          </label>
        </form>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">{t('import.cancel')}</button>
          <button
            type="submit"
            form="import-form"
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            <Upload size={15} />
            {loading ? t('import.importing') : t('import.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
