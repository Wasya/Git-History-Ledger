import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

export default function AddProjectModal({ onClose, onAdd }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !path.trim()) { setError(t('addProject.errorRequired')); return; }
    try {
      await onAdd({ name: name.trim(), path: path.trim() });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold">{t('addProject.title')}</h2>
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
            <label className="block text-sm font-medium mb-1">{t('addProject.pathLabel')}</label>
            <input
              className="input"
              placeholder={t('addProject.pathPlaceholder')}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">{t('addProject.cancel')}</button>
            <button type="submit" className="btn-primary">{t('addProject.submit')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
