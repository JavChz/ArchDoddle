import React, { useRef, useState } from 'react';
import {
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { STARTER_TEMPLATES } from '../templates/starters';
import { PALETTES } from '../themes/palettes';
import { ProjectMeta } from '../types/diagram';

interface ProjectDrawerProps {
  open: boolean;
  activeProjectId: string;
  savedProjects: ProjectMeta[];
  isDark: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: (id: string) => void;
  onOpenTemplate: (templateId: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onExportSingleJson: (id: string, name: string) => void;
  onExportAllBackup: () => void;
  onImportJsonFile: (rawJson: string) => void;
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const ProjectDrawer: React.FC<ProjectDrawerProps> = ({
  open,
  activeProjectId,
  savedProjects,
  isDark,
  onClose,
  onNewProject,
  onOpenProject,
  onOpenTemplate,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onExportSingleJson,
  onExportAllBackup,
  onImportJsonFile,
}) => {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const filtered = savedProjects.filter((p) =>
    p.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const surfaceCls = isDark
    ? 'bg-slate-900 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const cardCls = isDark
    ? 'bg-slate-800/70 border-slate-700 hover:border-slate-600'
    : 'bg-slate-50/90 border-slate-200 hover:border-slate-300';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImportJsonFile(text);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        className={`relative z-10 w-full max-w-md h-full border-r shadow-2xl flex flex-col ${surfaceCls}`}
      >
        <div className="px-4 py-3 border-b border-slate-300/20 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-sky-500" />
              Projects & Options
            </h2>
            <p className="text-[11px] opacity-65">
              100% local browser storage · Switch, template, import or backup
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 flex flex-col gap-2 border-b border-slate-300/20">
          <button
            type="button"
            onClick={() => {
              onNewProject();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" /> New Blank Architecture Project
          </button>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter saved projects…"
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-sky-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500'
              }`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll p-3 flex flex-col gap-4">
          {/* Saved Projects List */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">
              Saved in Local Storage ({savedProjects.length})
            </div>
            {filtered.length === 0 ? (
              <div className="text-xs opacity-60 py-4 text-center border border-dashed rounded-xl border-slate-400/30">
                {savedProjects.length === 0
                  ? 'No saved diagrams yet. Draw on the blank canvas to auto-save, or pick a template below.'
                  : 'No matching projects.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((proj) => {
                  const isActive = proj.id === activeProjectId;
                  const pal = PALETTES[proj.themeId] ?? PALETTES['executive-slate'];
                  const isRenaming = renamingId === proj.id;
                  const isConfirmingDel = confirmDeleteId === proj.id;

                  return (
                    <div
                      key={proj.id}
                      className={`rounded-xl border p-2.5 transition ${
                        isActive
                          ? 'border-sky-500 bg-sky-500/10'
                          : cardCls
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (!isRenaming) {
                              onOpenProject(proj.id);
                              onClose();
                            }
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full border shrink-0"
                              style={{
                                backgroundColor: pal.canvasBg,
                                borderColor: pal.tokens.primary.stroke,
                              }}
                            />
                            {isRenaming ? (
                              <input
                                autoFocus
                                value={renameDraft}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                onBlur={() => {
                                  if (renameDraft.trim()) {
                                    onRenameProject(proj.id, renameDraft);
                                  }
                                  setRenamingId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (renameDraft.trim()) {
                                      onRenameProject(proj.id, renameDraft);
                                    }
                                    setRenamingId(null);
                                  }
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                                className={`px-1.5 py-0.5 rounded border text-xs font-semibold w-full outline-none ${
                                  isDark
                                    ? 'bg-slate-900 border-sky-500 text-white'
                                    : 'bg-white border-sky-500 text-slate-900'
                                }`}
                              />
                            ) : (
                              <span className="text-xs font-semibold truncate">
                                {proj.name}
                              </span>
                            )}
                            {isActive && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-600 text-white shrink-0">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] opacity-65 mt-1">
                            {proj.elementCount} items · {proj.noteCount} notes ·{' '}
                            {formatShortDate(proj.updatedAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(proj.id);
                              setRenameDraft(proj.name);
                            }}
                            title="Rename"
                            className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateProject(proj.id)}
                            title="Duplicate"
                            className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onExportSingleJson(proj.id, proj.name)}
                            title="Export .archdoddle.json"
                            className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteId(isConfirmingDel ? null : proj.id)
                            }
                            title="Delete"
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/15 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isConfirmingDel && (
                        <div className="mt-2 pt-2 border-t border-rose-500/20 flex items-center justify-between text-[11px]">
                          <span className="text-rose-500 font-medium">Delete permanently?</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 rounded bg-slate-500/15 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteProject(proj.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold cursor-pointer"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Starter Consulting Templates */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" /> Consulting Starter Templates
            </div>
            <div className="flex flex-col gap-2">
              {STARTER_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onOpenTemplate(tpl.id);
                    onClose();
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${cardCls}`}
                >
                  <div className="text-xs font-semibold">{tpl.name}</div>
                  <div className="text-[11px] opacity-65 mt-0.5">{tpl.subtitle}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Import / Backup Footer */}
        <div className="p-3 border-t border-slate-300/20 grid grid-cols-2 gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.archdoddle.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer ${cardCls}`}
          >
            <Upload className="w-3.5 h-3.5" /> Import JSON
          </button>
          <button
            type="button"
            onClick={onExportAllBackup}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium cursor-pointer ${cardCls}`}
          >
            <Download className="w-3.5 h-3.5" /> Backup All
          </button>
        </div>
      </div>
    </div>
  );
};
