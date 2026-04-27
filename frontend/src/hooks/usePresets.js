import { useState, useEffect } from "react";

const STORAGE_KEY = "ai_chat_presets";
const DEFAULT_PRESETS = [
  "Анализ и отчет",
  "Что изменилось?",
  "Возможные проблемы",
  "Краткое резюме",
  "Оцени риски",
];

export function usePresets() {
  const [presets, setPresets] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_PRESETS;
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  const addPreset = (text = "New preset") => setPresets((p) => [...p, text]);
  const deletePreset = (i) => setPresets((p) => p.filter((_, idx) => idx !== i));
  const updatePreset = (i, val) =>
    setPresets((p) => p.map((v, idx) => (idx === i ? val : v)));

  return { presets, addPreset, deletePreset, updatePreset };
}
