import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  LayoutTemplate,
  Maximize2,
  Palette,
  PlusSquare,
  Search,
  StickyNote,
} from 'lucide-react';
import { THEME_LIST } from '../themes/palettes';
import {
  DiagramElement,
  ProjectMeta,
  ShapeKind,
  ThemeId,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';

interface CommandAction {
  id: string;
  category: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  isDark: boolean;
  elements: DiagramElement[];
  savedProjects: ProjectMeta[];
  showNotes: boolean;
  onClose: () => void;
  onDropElement: (kind: ShapeKind | 'note') => void;
  onFocusElement: (id: string) => void;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onSetTheme: (themeId: ThemeId) => void;
  onToggleNotes: () => void;
  onToggleSlideFrame: () => void;
  onFitToContent: () => void;
  onOpenExport: () => void;
  onOpenProjectsDrawer: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  isDark,
  elements,
  savedProjects,
  showNotes,
  onClose,
  onDropElement,
  onFocusElement,
  onOpenProject,
  onNewProject,
  onSetTheme,
  onToggleNotes,
  onToggleSlideFrame,
  onFitToContent,
  onOpenExport,
  onOpenProjectsDrawer,
}) => {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const actions = useMemo<CommandAction[]>(() => {
    const list: CommandAction[] = [
      {
        id: 'drop-service',
        category: 'Add Component',
        label: 'Add Service Box at Center',
        hint: 'Shift+S',
        icon: PlusSquare,
        run: () => onDropElement('service'),
      },
      {
        id: 'drop-database',
        category: 'Add Component',
        label: 'Add Database Cylinder at Center',
        hint: 'Shift+D',
        icon: PlusSquare,
        run: () => onDropElement('database'),
      },
      {
        id: 'drop-queue',
        category: 'Add Component',
        label: 'Add Queue / Event Bus at Center',
        hint: 'Shift+Q',
        icon: PlusSquare,
        run: () => onDropElement('queue'),
      },
      {
        id: 'drop-cloud',
        category: 'Add Component',
        label: 'Add External Cloud at Center',
        hint: 'Shift+C',
        icon: PlusSquare,
        run: () => onDropElement('cloud'),
      },
      {
        id: 'drop-actor',
        category: 'Add Component',
        label: 'Add User / Actor at Center',
        hint: 'Shift+U',
        icon: PlusSquare,
        run: () => onDropElement('actor'),
      },
      {
        id: 'drop-decision',
        category: 'Add Component',
        label: 'Add Decision Gate at Center',
        hint: 'Shift+G',
        icon: PlusSquare,
        run: () => onDropElement('decision'),
      },
      {
        id: 'drop-zone',
        category: 'Add Component',
        label: 'Add VPC / Boundary Zone at Center',
        hint: 'Shift+Z',
        icon: PlusSquare,
        run: () => onDropElement('zone'),
      },
      {
        id: 'drop-note',
        category: 'Add Component',
        label: 'Add Consultant Note at Center',
        hint: 'Shift+N',
        icon: StickyNote,
        run: () => onDropElement('note'),
      },
      {
        id: 'toggle-notes',
        category: 'View',
        label: showNotes ? 'Hide All Consultant Notes' : 'Show All Consultant Notes',
        hint: 'P',
        icon: Eye,
        run: onToggleNotes,
      },
      {
        id: 'toggle-frame',
        category: 'View',
        label: 'Toggle 16:9 Slide Frame Guide',
        hint: 'F',
        icon: LayoutTemplate,
        run: onToggleSlideFrame,
      },
      {
        id: 'fit-content',
        category: 'View',
        label: 'Fit Diagram to Screen',
        hint: '1',
        icon: Maximize2,
        run: onFitToContent,
      },
      {
        id: 'open-export',
        category: 'Export',
        label: 'Export Diagram (PowerPoint / SVG / PNG / JSON)',
        hint: 'Ctrl+E',
        icon: Download,
        run: onOpenExport,
      },
      {
        id: 'new-project',
        category: 'Projects',
        label: 'Create New Blank Project',
        icon: FilePlus2,
        run: onNewProject,
      },
      {
        id: 'open-projects',
        category: 'Projects',
        label: 'Browse Saved Projects & Templates',
        hint: 'Ctrl+O',
        icon: FolderOpen,
        run: onOpenProjectsDrawer,
      },
    ];

    for (const t of THEME_LIST) {
      list.push({
        id: `theme-${t.id}`,
        category: 'Theme',
        label: `Switch Theme: ${t.name}`,
        icon: Palette,
        run: () => onSetTheme(t.id),
      });
    }

    for (const p of savedProjects) {
      list.push({
        id: `proj-${p.id}`,
        category: 'Switch Project',
        label: `Open Project: ${p.name}`,
        hint: `${p.elementCount} items`,
        icon: FolderOpen,
        run: () => onOpenProject(p.id),
      });
    }

    for (const el of elements) {
      const name = isNoteElement(el)
        ? el.title || 'Note'
        : isConnectorElement(el)
          ? el.label || 'Connector'
          : el.label;
      if (!name) continue;
      list.push({
        id: `focus-${el.id}`,
        category: 'Jump to Element',
        label: `Focus ${el.type}: ${name}`,
        icon: Search,
        run: () => onFocusElement(el.id),
      });
    }

    return list;
  }, [
    elements,
    onDropElement,
    onFitToContent,
    onFocusElement,
    onNewProject,
    onOpenExport,
    onOpenProject,
    onOpenProjectsDrawer,
    onSetTheme,
    onToggleNotes,
    onToggleSlideFrame,
    savedProjects,
    showNotes,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions.slice(0, 14);
    return actions
      .filter(
        (a) =>
          a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q),
      )
      .slice(0, 16);
  }, [actions, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const execute = (action: CommandAction | undefined) => {
    if (!action) return;
    onClose();
    action.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-[1px]" onClick={onClose} />

      <div
        className={`relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-300/20">
          <Command className="w-4 h-4 text-sky-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                execute(filtered[activeIdx]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Type a command, component, project, or node name…"
            className="w-full bg-transparent text-sm outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono opacity-60 border border-slate-400/30">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto thin-scroll p-1.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs opacity-60">No matching commands.</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const active = idx === activeIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => execute(item)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left text-xs transition cursor-pointer ${
                    active
                      ? 'bg-sky-600 text-white'
                      : isDark
                        ? 'hover:bg-slate-800'
                        : 'hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                    <span className="text-[10px] uppercase tracking-wider opacity-70 shrink-0">
                      {item.category}
                    </span>
                    <span className="font-medium truncate">{item.label}</span>
                  </div>
                  {item.hint && (
                    <kbd
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                        active ? 'bg-white/20 text-white' : 'bg-slate-500/15 opacity-75'
                      }`}
                    >
                      {item.hint}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
