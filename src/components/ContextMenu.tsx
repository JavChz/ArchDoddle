import React from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Box,
  ClipboardPaste,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Pencil,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { NodeKind, Point, ShapeKind } from '../types/diagram';

export interface ContextMenuState {
  screenPt: Point;
  worldPt: Point;
  targetId: string | null;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  isDark: boolean;
  showNotes: boolean;
  canConvertShape: boolean;
  onClose: () => void;
  onEditTarget: (id: string) => void;
  onAttachNote: () => void;
  onDuplicate: () => void;
  onConvertShape: (kind: ShapeKind) => void;
  onReorderLayer: (mode: 'front' | 'back') => void;
  onDelete: () => void;
  onDropAtWorld: (kind: NodeKind, worldPt: Point) => void;
  onPaste: () => void;
  onFitToScreen: () => void;
  onToggleNotes: () => void;
  onOpenExport: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  state,
  isDark,
  showNotes,
  canConvertShape,
  onClose,
  onEditTarget,
  onAttachNote,
  onDuplicate,
  onConvertShape,
  onReorderLayer,
  onDelete,
  onDropAtWorld,
  onPaste,
  onFitToScreen,
  onToggleNotes,
  onOpenExport,
}) => {
  if (!state) return null;

  const menuCls = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100'
    : 'bg-white border-slate-200 text-slate-800';
  const itemCls = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100';

  const left = Math.min(state.screenPt.x, window.innerWidth - 230);
  const top = Math.min(state.screenPt.y, window.innerHeight - 320);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        style={{ left, top }}
        className={`fixed z-50 w-56 rounded-xl border shadow-2xl p-1.5 text-xs select-none ${menuCls}`}
      >
        {state.targetId ? (
          <>
            <button
              type="button"
              onClick={() => {
                onEditTarget(state.targetId!);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Label / Text
            </button>
            <button
              type="button"
              onClick={() => {
                onAttachNote();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <StickyNote className="w-3.5 h-3.5 text-amber-500" /> Attach Note
            </button>
            <button
              type="button"
              onClick={() => {
                onDuplicate();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>

            {canConvertShape && (
              <div className="my-1 pt-1 border-t border-slate-300/20">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-55">
                  Convert Shape To
                </div>
                <div className="grid grid-cols-3 gap-1 px-1.5 pb-1">
                  {(
                    [
                      { k: 'service', label: 'Service' },
                      { k: 'database', label: 'DB' },
                      { k: 'queue', label: 'Queue' },
                      { k: 'cloud', label: 'Cloud' },
                      { k: 'actor', label: 'Actor' },
                      { k: 'decision', label: 'Decision' },
                    ] as { k: ShapeKind; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => {
                        onConvertShape(opt.k);
                        onClose();
                      }}
                      className={`py-1 px-1 rounded text-[11px] font-medium cursor-pointer ${itemCls}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="my-1 border-t border-slate-300/20" />
            <button
              type="button"
              onClick={() => {
                onReorderLayer('front');
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <ArrowUpToLine className="w-3.5 h-3.5" /> Bring to Front
            </button>
            <button
              type="button"
              onClick={() => {
                onReorderLayer('back');
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" /> Send to Back
            </button>

            <div className="my-1 border-t border-slate-300/20" />
            <button
              type="button"
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/15 font-medium cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </>
        ) : (
          <>
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-55">
              Drop Component Here
            </div>
            <button
              type="button"
              onClick={() => {
                onDropAtWorld('service', state.worldPt);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Box className="w-3.5 h-3.5 text-sky-500" /> Service Box
            </button>
            <button
              type="button"
              onClick={() => {
                onDropAtWorld('database', state.worldPt);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Database className="w-3.5 h-3.5 text-teal-500" /> Database Cylinder
            </button>
            <button
              type="button"
              onClick={() => {
                onDropAtWorld('queue', state.worldPt);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Layers className="w-3.5 h-3.5 text-orange-500" /> Message Queue
            </button>
            <button
              type="button"
              onClick={() => {
                onDropAtWorld('note', state.worldPt);
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <StickyNote className="w-3.5 h-3.5 text-amber-500" /> Consultant Note
            </button>

            <div className="my-1 border-t border-slate-300/20" />
            <button
              type="button"
              onClick={() => {
                onPaste();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste
            </button>
            <button
              type="button"
              onClick={() => {
                onFitToScreen();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Maximize2 className="w-3.5 h-3.5" /> Fit Diagram to Screen
            </button>
            <button
              type="button"
              onClick={() => {
                onToggleNotes();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              {showNotes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showNotes ? 'Hide All Notes' : 'Show All Notes'}
            </button>
            <button
              type="button"
              onClick={() => {
                onOpenExport();
                onClose();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${itemCls}`}
            >
              <Download className="w-3.5 h-3.5 text-sky-500" /> Export PPTX / SVG / PNG
            </button>
          </>
        )}
      </div>
    </>
  );
};
