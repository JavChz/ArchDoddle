import React from 'react';
import { Copy, Minimize2, Maximize2, StickyNote, Trash2 } from 'lucide-react';
import { buildElementsMap, getSelectionBounds, worldToScreen } from '../engine/geometry';
import { PALETTES, SEMANTIC_COLOR_ORDER } from '../themes/palettes';
import {
  DiagramElement,
  SemanticColor,
  ThemeId,
  Viewport,
  isNoteElement,
} from '../types/diagram';

interface SelectionFloatingBarProps {
  elements: DiagramElement[];
  selectedIds: string[];
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  themeId: ThemeId;
  editingId: string | null;
  onSetColor: (color: SemanticColor) => void;
  onAttachNote: () => void;
  onToggleCollapseNote: (noteId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export const SelectionFloatingBar: React.FC<SelectionFloatingBarProps> = ({
  elements,
  selectedIds,
  viewport,
  canvasSize,
  themeId,
  editingId,
  onSetColor,
  onAttachNote,
  onToggleCollapseNote,
  onDuplicate,
  onDelete,
}) => {
  if (selectedIds.length === 0 || editingId) return null;

  const selectedSet = new Set(selectedIds);
  const selected = elements.filter((e) => selectedSet.has(e.id));
  if (selected.length === 0) return null;

  const map = buildElementsMap(elements);
  const bounds = getSelectionBounds(selected, map);
  if (!bounds) return null;

  const topCenter = worldToScreen(
    { x: bounds.x + bounds.width / 2, y: bounds.y },
    viewport,
  );

  const barW = 290;
  const left = Math.max(12, Math.min(canvasSize.width - barW - 12, topCenter.x - barW / 2));
  const top = Math.max(10, topCenter.y - 48);

  const palette = PALETTES[themeId];
  const isDark = palette.isDark;
  const singleNote = selected.length === 1 && isNoteElement(selected[0]) ? selected[0] : null;

  return (
    <div
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute z-20 flex items-center gap-1 px-2 py-1 rounded-xl border shadow-lg backdrop-blur-md select-none ${
        isDark
          ? 'bg-slate-900/95 border-slate-700 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-800'
      }`}
    >
      <div className="flex items-center gap-1 pr-1.5 border-r border-slate-300/30">
        {SEMANTIC_COLOR_ORDER.slice(0, 6).map((c) => {
          const tok = palette.tokens[c];
          const isCurrent = selected.length === 1 && selected[0].color === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onSetColor(c)}
              title={`Role: ${tok.label}`}
              className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                isCurrent ? 'scale-125 ring-2 ring-sky-500/60' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: tok.stroke, borderColor: tok.fill }}
            />
          );
        })}
      </div>

      {singleNote ? (
        <button
          type="button"
          onClick={() => onToggleCollapseNote(singleNote.id)}
          title={singleNote.collapsed ? 'Expand Note' : 'Collapse Note to Badge'}
          className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
        >
          {singleNote.collapsed ? (
            <Maximize2 className="w-3.5 h-3.5" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={onAttachNote}
          title="Attach Hideable Note (M)"
          className="p-1.5 rounded-lg hover:bg-amber-500/15 text-amber-500 cursor-pointer"
        >
          <StickyNote className="w-3.5 h-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={onDuplicate}
        title="Duplicate (Ctrl+D)"
        className="p-1.5 rounded-lg hover:bg-slate-500/15 cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        title="Delete (Del / Backspace)"
        className="p-1.5 rounded-lg hover:bg-rose-500/15 text-rose-500 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
