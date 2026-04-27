import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Save,
  X,
  GitCommit,
  MessageSquare,
  Send,
  Loader,
  PlusCircle,
  RotateCcw,
  Settings,
  Check,
  Plus,
} from "lucide-react";
import { api } from "../api/index.js";
import { usePresets } from "../hooks/usePresets.js";
import { useI18n } from "../i18n/I18nContext";

function DiffLine({ line }) {
  if (line.startsWith("--- ") || line.startsWith("+++ ")) {
    return (
      <span className="text-gray-500 dark:text-gray-400 font-semibold">
        {line}
        {"\n"}
      </span>
    );
  }
  if (line.startsWith("@@")) {
    return (
      <span className="text-cyan-600 dark:text-cyan-400">
        {line}
        {"\n"}
      </span>
    );
  }
  if (line.startsWith("-")) {
    return (
      <span className="block bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
        {line}
        {"\n"}
      </span>
    );
  }
  if (line.startsWith("+")) {
    return (
      <span className="block bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400">
        {line}
        {"\n"}
      </span>
    );
  }
  if (line.includes("|")) {
    const match = line.match(/^(.*\|\s*\d+\s*)([+\-]+)(.*)$/);
    if (match) {
      const pluses = match[2].match(/\++/)?.[0] || "";
      const minuses = match[2].match(/-+/)?.[0] || "";
      return (
        <span>
          {match[1]}
          <span className="text-green-700 dark:text-green-400">{pluses}</span>
          <span className="text-red-600 dark:text-red-400">{minuses}</span>
          {match[3]}
          {"\n"}
        </span>
      );
    }
  }
  if (line.includes("changed")) {
    const parts = line.split(
      /(\d+\s+insertion[s]?\(\+\)|\d+\s+deletion[s]?\(-\))/g,
    );
    return (
      <span>
        {parts.map((part, i) =>
          part.includes("insertion") ? (
            <span key={i} className="text-green-700 dark:text-green-400">
              {part}
            </span>
          ) : part.includes("deletion") ? (
            <span key={i} className="text-red-600 dark:text-red-400">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
        {"\n"}
      </span>
    );
  }
  return (
    <span>
      {line}
      {"\n"}
    </span>
  );
}

const markdownComponents = {
  // ReactMarkdown wraps fenced code blocks in its own <pre> before calling our
  // code renderer. Without this override we'd get nested <pre> elements, which
  // makes Tailwind Typography's dark <pre> background leak above and below our
  // custom styled block. Replacing the outer <pre> with a fragment fixes it.
  pre({ children }) {
    return <>{children}</>;
  },
  code({ node, className, children }) {
    const isInline = !className && !String(children).includes("\n");
    if (isInline) {
      return (
        <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded text-xs font-mono">
          {children}
        </code>
      );
    }
    const content = String(children).trimEnd();
    const lines = content.split("\n");
    return (
      <pre className="bg-gray-100 dark:bg-gray-950 text-gray-800 dark:text-gray-200 rounded-md p-3 overflow-x-auto text-xs font-mono leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <DiffLine key={i} line={line} />
          ))}
        </code>
      </pre>
    );
  },
};

function ChatMessage({ msg, onAddToDesc, onReplaceDesc }) {
  const { t } = useI18n();
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex flex-col ${isUser ? "items-end" : "items-start"} gap-1`}
    >
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          isUser
            ? "bg-indigo-600 text-white"
            : msg.isError
              ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
              : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {!isUser && !msg.isError && (
        <div className="flex gap-1.5 px-1">
          <button
            onClick={() => onAddToDesc(msg.content)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
            title={t('commitEntry.addToDescTooltip')}
          >
            <PlusCircle size={11} /> {t('commitEntry.addToDesc')}
          </button>
          <button
            onClick={() => onReplaceDesc(msg.content)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
            title={t('commitEntry.replaceTooltip')}
          >
            <RotateCcw size={11} /> {t('commitEntry.replace')}
          </button>
        </div>
      )}
    </div>
  );
}

function extractCommitMessages(raw) {
  if (!raw) return null;
  const matches = [...raw.matchAll(/^[0-9a-f]+ - .+? : (.+)$/gm)].map((m) => m[1].trim());
  if (!matches.length) return null;
  const first = matches[0].slice(0, 70);
  return matches.length > 1 ? `${first} (+${matches.length - 1})` : first;
}

function extractDescriptionPreview(desc) {
  if (!desc) return null;
  const line = desc
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim())
    .find((l) => l.length > 0);
  return line ? line.slice(0, 70) : null;
}

export default function CommitEntry({ commit, onUpdate, onDelete }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(commit.description || "");
  const [notes, setNotes] = useState(commit.notes || "");
  const editRef = useRef(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [editingPresets, setEditingPresets] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const { presets, addPreset, deletePreset, updatePreset } = usePresets();

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [editing]);

  useEffect(() => {
    if (chatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  const time = commit.commit_date
    ? new Date(commit.commit_date).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const hashShort = commit.commit_hash
    ? commit.commit_hash.length > 20
      ? commit.commit_hash.slice(0, 8) + ".." + commit.commit_hash.slice(-8)
      : commit.commit_hash
    : "—";

  const handleSave = async () => {
    await onUpdate(commit.id, { description, notes });
    setEditing(false);
  };

  const handleCancel = () => {
    setDescription(commit.description || "");
    setNotes(commit.notes || "");
    setEditing(false);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────

  const doSend = async (currentMessages, question) => {
    const newMessages = question
      ? [...currentMessages, { role: "user", content: question }]
      : currentMessages;

    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const res = await api.askCommit(commit.id, { messages: newMessages });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: t('commitEntry.chatError', { message: err.message }), isError: true },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatInputRef.current?.focus(), 50);
    }
  };

  const handleOpenChat = () => {
    if (chatOpen) {
      setChatOpen(false);
      return;
    }
    setChatOpen(true);
    // Auto-generate initial analysis if no description yet
    if (!commit.description && chatMessages.length === 0) {
      setTimeout(() => doSend([], ""), 0);
    }
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    doSend(chatMessages, text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const handleSaveToDescription = async (content, mode) => {
    const newDesc =
      mode === "replace"
        ? content
        : commit.description
          ? `${commit.description}\n\n---\n\n${content}`
          : content;
    await onUpdate(commit.id, {
      description: newDesc,
      notes: commit.notes || "",
    });
    setDescription(newDesc);
    setChatOpen(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-2">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-gray-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <GitCommit size={14} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs font-mono text-indigo-500 dark:text-indigo-400 flex-shrink-0">
          {hashShort}
        </span>
        {commit.branch && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            {commit.branch}
          </span>
        )}
        <span className="text-xs text-gray-400 flex-shrink-0">{time}</span>
        {(() => {
          const text =
            commit.notes
              ? commit.notes.split("\n")[0].slice(0, 70)
              : extractCommitMessages(commit.raw_output) ||
                extractDescriptionPreview(commit.description);
          return text ? (
            <span className={`text-xs truncate flex-1 ${commit.notes ? "text-gray-600 dark:text-gray-300 italic" : "text-gray-400 dark:text-gray-500"}`}>
              {text}
            </span>
          ) : null;
        })()}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="p-4 space-y-4">
            {editing ? (
              <div ref={editRef} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('commitEntry.descriptionLabel')}
                  </label>
                  <textarea
                    className="input font-mono text-xs h-48 resize-y"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    {t('commitEntry.notesLabel')}
                  </label>
                  <textarea
                    className="input text-sm h-36 resize-y"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('commitEntry.notesPlaceholder')}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} className="btn-primary text-xs">
                    <Save size={13} /> {t('commitEntry.save')}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="btn-secondary text-xs"
                  >
                    <X size={13} /> {t('commitEntry.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {commit.description && (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:p-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {commit.description}
                    </ReactMarkdown>
                  </div>
                )}
                {commit.notes && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md p-3">
                    <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                      {t('commitEntry.notesTitle')}
                    </p>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {commit.notes}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="btn-secondary text-xs"
                  >
                    <Pencil size={13} /> {t('commitEntry.edit')}
                  </button>
                  <button
                    onClick={() => onDelete(commit.id)}
                    className="btn-danger text-xs"
                  >
                    <Trash2 size={13} /> {t('commitEntry.delete')}
                  </button>
                  <button
                    onClick={handleOpenChat}
                    className={`btn-secondary text-xs flex items-center gap-1.5 ${chatOpen ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400" : ""}`}
                  >
                    <MessageSquare size={13} />
                    {t('commitEntry.askAI')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Chat panel */}
          {chatOpen && !editing && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              {/* Messages */}
              <div
                ref={chatScrollRef}
                className="max-h-96 overflow-y-auto p-4 space-y-3"
              >
                {/* Existing description shown as context bubble */}
                {commit.description &&
                  chatMessages.length === 0 &&
                  !chatLoading && (
                    <div className="text-xs text-gray-400 text-center py-1">
                      {t('commitEntry.chatContext')}
                    </div>
                  )}

                {chatMessages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    msg={msg}
                    onAddToDesc={(content) =>
                      handleSaveToDescription(content, "append")
                    }
                    onReplaceDesc={(content) =>
                      handleSaveToDescription(content, "replace")
                    }
                  />
                ))}

                {chatLoading && (
                  <div className="flex items-start gap-2">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2">
                      <Loader
                        size={14}
                        className="animate-spin text-gray-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Presets bar */}
              <div className="border-t border-gray-200 dark:border-gray-700 px-3 pt-2 pb-1 flex flex-wrap gap-1.5 items-center">
                {presets.map((preset, i) =>
                  editingPresets ? (
                    <div
                      key={i}
                      className="flex items-center gap-0.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-full pl-2 pr-1 py-0.5"
                    >
                      <input
                        value={preset}
                        onChange={(e) => updatePreset(i, e.target.value)}
                        className="text-xs bg-transparent outline-none w-28 text-indigo-700 dark:text-indigo-300"
                      />
                      <button
                        onClick={() => deletePreset(i)}
                        className="text-indigo-400 hover:text-red-500 transition-colors ml-0.5"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      key={i}
                      disabled={chatLoading}
                      onClick={() => {
                        if (!chatLoading) doSend(chatMessages, preset);
                      }}
                      className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {preset}
                    </button>
                  )
                )}
                {editingPresets && (
                  <button
                    onClick={() => addPreset(t('commitEntry.newPreset'))}
                    className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title={t('commitEntry.addPresetTooltip')}
                  >
                    <Plus size={12} />
                  </button>
                )}
                <button
                  onClick={() => setEditingPresets((v) => !v)}
                  className={`ml-auto text-xs p-1 rounded transition-colors ${
                    editingPresets
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                  title={editingPresets ? t('commitEntry.doneEditingPresets') : t('commitEntry.editPresetsTooltip')}
                >
                  {editingPresets ? <Check size={13} /> : <Settings size={13} />}
                </button>
              </div>

              {/* Input bar */}
              <div className="px-3 pb-3 flex gap-2 items-end">
                <textarea
                  ref={chatInputRef}
                  className="input text-sm flex-1 resize-none min-h-[36px] max-h-32"
                  rows={1}
                  placeholder={
                    !commit.description && chatMessages.length === 0
                      ? t('commitEntry.chatPlaceholderLoading')
                      : t('commitEntry.chatPlaceholder')
                  }
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={chatLoading}
                />
                <button
                  onClick={handleSendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="btn-primary text-xs px-3 py-2 disabled:opacity-40 flex-shrink-0"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
