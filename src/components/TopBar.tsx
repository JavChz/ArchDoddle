import React, { useState } from 'react';
import {
  Check,
  CloudOff,
  Command,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Frame,
  HelpCircle,
  MonitorDown,
  PanelRight,
  Palette,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { SaveStatus } from '../store/useDiagramStore';
import { PALETTES, THEME_LIST } from '../themes/palettes';
import { ThemeId } from '../types/diagram';
import { BrandLogo } from './BrandLogo';

interface TopBarProps {
  projectName: string;
  saveStatus: SaveStatus;
  savedCount: number;
  themeId: ThemeId;
  showNotes: boolean;
  noteCount: number;
  showSlideFrame: boolean;
  inspectorOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canInstall?: boolean;
  isInstalled?: boolean;
  onInstallApp?: () => void;
  onRenameProject: (name: string) => void;
  onOpenProjectDrawer: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenPalette: () => void;
  onToggleNotes: () => void;
  onToggleSlideFrame: () => void;
  onSetTheme: (themeId: ThemeId) => void;
  onOpenExport: () => void;
  onToggleInspector: () => void;
  onOpenShortcuts: () => void;
  onSaveNow: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  saveStatus,
  savedCount,
  themeId,
  showNotes,
  noteCount,
  showSlideFrame,
  inspectorOpen,
  canUndo,
  canRedo,
  canInstall,
  isInstalled,
  onInstallApp,
  onRenameProject,
  onOpenProjectDrawer,
  onUndo,
  onRedo,
  onOpenPalette,
  onToggleNotes,
  onToggleSlideFrame,
  onSetTheme,
  onOpenExport,
  onToggleInspector,
  onOpenShortcuts,
  onSaveNow,
}) => {
  const palette = PALETTES[themeId];
  const isDark = palette.isDark;
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const [themeOpen, setThemeOpen] = useState(false);

  const barCls = isDark
    ? 'bg-slate-900/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-800';
  const btnCls = isDark
    ? 'hover:bg-slate-800 text-slate-200 border-slate-700'
    : 'hover:bg-slate-100 text-slate-700 border-slate-200';

  const commitName = () => {
    setEditingName(false);
    if (draftName.trim() && draftName.trim() !== projectName) {
      onRenameProject(draftName.trim());
    } else {
      setDraftName(projectName);
    }
  };

  return (
    <header
      className={`h-12 shrink-0 border-b px-3 flex items-center justify-between gap-2 backdrop-blur-md z-30 select-none ${barCls}`}
    >
      {/* Left: Brand + Options Menu + Project Name */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-2 pr-1">
          <BrandLogo className="w-7 h-7 shadow-sm shrink-0" />
          <span className="font-bold text-sm tracking-tight hidden sm:inline">ArchDoddle</span>
        </div>

        <button
          type="button"
          onClick={onOpenProjectDrawer}
          title="Projects & Options Menu (Ctrl+O)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${btnCls}`}
        >
          <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
          <span className="hidden md:inline">Projects</span>
          {savedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400">
              {savedCount}
            </span>
          )}
        </button>

        <div className="h-4 w-px bg-slate-300/40 mx-0.5 hidden sm:block" />

        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setDraftName(projectName);
                setEditingName(false);
              }
            }}
            className={`px-2 py-1 text-xs font-semibold rounded border outline-none w-44 sm:w-56 ${
              isDark
                ? 'bg-slate-800 border-sky-500 text-white'
                : 'bg-slate-50 border-sky-500 text-slate-900'
            }`}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(projectName);
              setEditingName(true);
            }}
            title="Click to rename active project"
            className="px-2 py-1 rounded-md text-xs font-semibold truncate max-w-[160px] sm:max-w-[220px] hover:bg-slate-500/10 text-left cursor-text"
          >
            {projectName}
          </button>
        )}

        <button
          type="button"
          onClick={onSaveNow}
          title="Save locally now (Ctrl+S)"
          className="hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] opacity-75 hover:opacity-100 hover:bg-slate-500/10 cursor-pointer"
        >
          {saveStatus === 'saved' && (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'saving' && <span>Saving…</span>}
          {saveStatus === 'draft' && (
            <>
              <Save className="w-3 h-3 text-slate-400" />
              <span>Draft</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <CloudOff className="w-3 h-3 text-rose-500" />
              <span className="text-rose-500">Error</span>
            </>
          )}
        </button>
      </div>

      {/* Center: Undo/Redo + Command Palette + Hide/Show Notes */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 mr-1">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-default ${
              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={`p-1.5 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-default ${
              isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
            }`}
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          title="Command Palette — jump, create, or export (Ctrl+K or /)"
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition cursor-pointer ${btnCls}`}
        >
          <Command className="w-3.5 h-3.5 opacity-70" />
          <span className="opacity-70">Quick Action…</span>
          <kbd
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
              isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'
            }`}
          >
            Ctrl+K
          </kbd>
        </button>

        {/* Hide/Show Consultant Notes Toggle */}
        <button
          type="button"
          onClick={onToggleNotes}
          title="Toggle Consultant Notes visibility (P or Alt+N)"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
            showNotes
              ? isDark
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-amber-50 border-amber-300 text-amber-900'
              : btnCls
          }`}
        >
          {showNotes ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Notes</span>
          <span className="text-[10px] font-bold px-1.5 rounded-full bg-black/10">
            {noteCount}
          </span>
        </button>
      </div>

      {/* Right: Slide Frame + Theme + Export + Inspector + Help */}
      <div className="flex items-center gap-1.5 relative">
        <button
          type="button"
          onClick={onToggleSlideFrame}
          title="Toggle 16:9 Presentation Slide Frame (F)"
          className={`hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
            showSlideFrame
              ? 'bg-sky-500/15 border-sky-500/50 text-sky-500'
              : btnCls
          }`}
        >
          <Frame className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">16:9</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setThemeOpen((o) => !o)}
            title="Switch Diagram Theme"
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${btnCls}`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{palette.name}</span>
          </button>
          {themeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
              <div
                className={`absolute right-0 mt-1.5 w-56 rounded-xl border shadow-xl p-1.5 z-50 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                {THEME_LIST.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onSetTheme(t.id);
                      setThemeOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition cursor-pointer ${
                      t.id === themeId
                        ? isDark
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-sky-50 text-sky-800'
                        : isDark
                          ? 'hover:bg-slate-800'
                          : 'hover:bg-slate-100'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border shrink-0"
                      style={{
                        backgroundColor: t.canvasBg,
                        borderColor: t.tokens.primary.stroke,
                      }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{t.name}</div>
                      <div className="text-[10px] opacity-65 truncate">{t.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {canInstall && !isInstalled && onInstallApp && (
          <button
            type="button"
            onClick={onInstallApp}
            title="Install ArchDoddle locally as an offline desktop/mobile app"
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${btnCls}`}
          >
            <MonitorDown className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden lg:inline">Install</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenExport}
          title="Export to PowerPoint (.pptx), SVG, PNG, or JSON (Ctrl+E)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <button
          type="button"
          onClick={onToggleInspector}
          title="Toggle Properties Inspector (I)"
          className={`p-1.5 rounded-lg border transition cursor-pointer ${
            inspectorOpen ? 'bg-sky-500/15 border-sky-500/40 text-sky-500' : btnCls
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Keyboard & Mouse Shortcuts (?)"
          className={`p-1.5 rounded-lg border transition cursor-pointer ${btnCls}`}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
