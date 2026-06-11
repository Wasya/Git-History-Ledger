import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Loader, CheckCircle, GitBranch, Download } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { api } from '../api/index.js';

function isUrl(value) {
  return /^(https?:\/\/|git@|ssh:\/\/)/.test(value.trim());
}

export default function AddProjectModal({ onClose, onAdd, onSave, project }) {
  const { t } = useI18n();
  const isEdit = !!project;
  const [name, setName] = useState(project?.name || '');
  const [path, setPath] = useState(project?.path || '');
  const [testsPath, setTestsPath] = useState(project?.tests_path || '');
  const [remoteUrl, setRemoteUrl] = useState(project?.remote_url || '');
  const [remoteStatus, setRemoteStatus] = useState(''); // '' | 'detecting' | 'detected' | 'not_found'
  // pathStatus: '' | 'checking' | 'ok' | 'no_dir' | 'no_git'
  const [pathStatus, setPathStatus] = useState('');
  const [cloneStatus, setCloneStatus] = useState(''); // '' | 'cloning' | 'done' | 'error'
  const [cloneError, setCloneError] = useState('');
  const [error, setError] = useState('');

  const looksLikeUrl = isUrl(path);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handlePathBlur = async () => {
    const p = path.trim();
    if (!p || isUrl(p)) return;

    // Check path validity
    setPathStatus('checking');
    setCloneStatus('');
    setCloneError('');
    try {
      const check = await api.checkPath(p);
      if (!check.exists) {
        setPathStatus('no_dir');
      } else if (!check.is_git) {
        setPathStatus('no_git');
      } else {
        setPathStatus('ok');
        // Auto-detect remote URL for valid repos
        setRemoteStatus('detecting');
        try {
          const res = await api.detectRemoteUrl(p);
          if (res.remote_url) {
            setRemoteUrl(res.remote_url);
            setRemoteStatus('detected');
          } else {
            setRemoteStatus('not_found');
          }
        } catch (_) {
          setRemoteStatus('not_found');
        }
      }
    } catch (_) {
      setPathStatus('');
    }
  };

  const handleClone = async () => {
    const p = path.trim();
    const r = remoteUrl.trim();
    if (!r || !p) return;
    setCloneStatus('cloning');
    setCloneError('');
    try {
      await api.cloneRepo(r, p);
      setCloneStatus('done');
      setPathStatus('ok');
      // Auto-detect remote after clone (should match what user entered)
      setRemoteStatus('detected');
    } catch (err) {
      setCloneStatus('error');
      setCloneError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !path.trim()) { setError(t('addProject.errorRequired')); return; }
    const data = {
      name: name.trim(),
      path: path.trim(),
      remote_url: remoteUrl.trim(),
      tests_path: testsPath.trim(),
    };
    try {
      if (isEdit) await onSave(project.id, data);
      else await onAdd(data);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold">{isEdit ? t('addProject.editTitle') : t('addProject.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">{t('addProject.nameLabel')}</label>
            <input
              className="input"
              placeholder={t('addProject.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-sm font-medium">{t('addProject.pathLabel')}</label>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                {pathStatus === 'checking' && <><Loader size={10} className="animate-spin" />{t('addProject.pathChecking')}</>}
                {pathStatus === 'ok'     && <span className="text-green-500 flex items-center gap-1"><CheckCircle size={10} />{t('addProject.pathOk')}</span>}
                {pathStatus === 'no_dir' && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={10} />{t('addProject.pathNoDir')}</span>}
                {pathStatus === 'no_git' && <span className="text-amber-500 flex items-center gap-1"><AlertTriangle size={10} />{t('addProject.pathNoGit')}</span>}
                {pathStatus === ''       && <span>{t('addProject.pathHelper')}</span>}
              </span>
            </div>
            <input
              className={`input ${looksLikeUrl ? 'border-amber-400 focus:ring-amber-400' : pathStatus === 'no_dir' || pathStatus === 'no_git' ? 'border-amber-400 focus:ring-amber-400' : ''}`}
              placeholder={t('addProject.pathPlaceholder')}
              value={path}
              onChange={(e) => { setPath(e.target.value); setPathStatus(''); setCloneStatus(''); }}
              onBlur={handlePathBlur}
            />

            {/* URL entered in path field warning */}
            {looksLikeUrl && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  {t('addProject.pathUrlWarning')}
                </p>
              </div>
            )}

            {/* Clone prompt: directory missing or not a git repo */}
            {!looksLikeUrl && (pathStatus === 'no_dir' || pathStatus === 'no_git') && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 space-y-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <GitBranch size={13} className="flex-shrink-0" />
                  {remoteUrl.trim()
                    ? pathStatus === 'no_dir' ? t('addProject.pathClonePrompt') : t('addProject.pathNoGitClonePrompt')
                    : t('addProject.pathNoDirNoRemote')}
                </p>
                {remoteUrl.trim() && cloneStatus !== 'done' && (
                  <button
                    type="button"
                    onClick={handleClone}
                    disabled={cloneStatus === 'cloning'}
                    className="btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {cloneStatus === 'cloning'
                      ? <><Loader size={12} className="animate-spin" />{t('addProject.cloning')}</>
                      : <><Download size={12} />{t('addProject.cloneBtn')}</>}
                  </button>
                )}
                {cloneStatus === 'done' && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
                    <CheckCircle size={12} />{t('addProject.cloneDone')}
                  </p>
                )}
                {cloneStatus === 'error' && (
                  <p className="text-xs text-red-500">{t('addProject.cloneError', { message: cloneError })}</p>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-sm font-medium">{t('addProject.remoteUrlLabel')}</label>
              <span className="text-xs flex items-center gap-1">
                {remoteStatus === 'detecting' && <><Loader size={10} className="animate-spin text-gray-400" /><span className="text-gray-400">{t('addProject.remoteUrlDetecting')}</span></>}
                {remoteStatus === 'detected'  && <span className="text-green-500">{t('addProject.remoteUrlDetected')}</span>}
                {remoteStatus === 'not_found' && <span className="text-gray-400">{t('addProject.remoteUrlNotFound')}</span>}
                {remoteStatus === ''          && <span className="text-gray-400">{t('addProject.remoteUrlHelper')}</span>}
              </span>
            </div>
            <input
              className="input"
              placeholder={t('addProject.remoteUrlPlaceholder')}
              value={remoteUrl}
              onChange={(e) => { setRemoteUrl(e.target.value); setRemoteStatus(''); }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('addProject.testsPathLabel')}</label>
            <input
              className="input"
              placeholder={t('addProject.testsPathPlaceholder')}
              value={testsPath}
              onChange={(e) => setTestsPath(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">{t('addProject.testsPathHelper')}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">{t('addProject.cancel')}</button>
            <button type="submit" className="btn-primary">{isEdit ? t('addProject.save') : t('addProject.submit')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
