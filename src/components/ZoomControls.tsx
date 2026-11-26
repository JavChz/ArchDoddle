import React from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  elementCount: number;
  noteCount: number;
  showNotes: boolean;
  isDark: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToContent: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  elementCount,
  noteCount,
  showNotes,
  isDark,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToContent,
}) => {
  const pillCls = isDark
    ? 'bg-slate-900/90 border-slate-700 text-slate-200'
    : 'bg-white/90 border-slate-200 text-slate-700';

  return (
    <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 select-none">
      <div
        className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] shadow-sm backdrop-blur-md ${pillCls}`}
      >
        <span className="font-medium">{elementCount} items</span>
        <span className="opacity-40">·</span>
        <span className={showNotes ? 'text-amber-500 font-medium' : 'opacity-60'}>
          {noteCount} notes {showNotes ? '' : '(hidden)'}
        </span>
      </div>

      <div
        className={`flex items-center rounded-xl border shadow-sm backdrop-blur-md overflow-hidden ${pillCls}`}
      >
        <button
          type="button"
          onClick={onZoomOut}
          title="Zoom Out (-)"
          className="px-2.5 py-1.5 hover:bg-slate-500/15 cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          title="Reset Zoom to 100% (Ctrl+0)"
          className="px-2 py-1.5 text-xs font-mono font-semibold hover:bg-slate-500/15 min-w-[52px] text-center cursor-pointer"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          title="Zoom In (+)"
          className="px-2.5 py-1.5 hover:bg-slate-500/15 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className={`w-px h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
        <button
          type="button"
          onClick={onFitToContent}
          title="Fit Diagram to Screen (1)"
          className="px-2.5 py-1.5 hover:bg-slate-500/15 flex items-center gap-1 text-xs font-medium cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Fit</span>
        </button>
      </div>
    </div>
  );
};
