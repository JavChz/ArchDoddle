import React from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { PALETTES, SEMANTIC_COLOR_ORDER, THEME_LIST } from '../themes/palettes';
import {
  AlignKind,
  ArrowHead,
  BorderStyle,
  ConnectorRouteStyle,
  DiagramElement,
  DistributeAxis,
  GridStyle,
  NoteElement,
  ProjectSettings,
  SemanticColor,
  ShapeKind,
  ThemeId,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';

interface InspectorPanelProps {
  elements: DiagramElement[];
  selectedIds: string[];
  themeId: ThemeId;
  settings: ProjectSettings;
  onUpdateElement: (id: string, patch: Partial<DiagramElement>) => void;
  onSetSelectedColor: (color: SemanticColor) => void;
  onConvertShape: (kind: ShapeKind) => void;
  onAlign: (alignment: AlignKind) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onReorderLayer: (mode: 'front' | 'back') => void;
  onDeleteSelected: () => void;
  onSetTheme: (themeId: ThemeId) => void;
  onSetGridStyle: (style: GridStyle) => void;
  onToggleSnap: () => void;
  onToggleNotes: () => void;
  onToggleSlideFrame: () => void;
  onFocusElement: (id: string) => void;
}

const SHAPE_KINDS: { value: ShapeKind; label: string }[] = [
  { value: 'service', label: 'Service Box' },
  { value: 'database', label: 'Database Cylinder' },
  { value: 'queue', label: 'Event Queue' },
  { value: 'cloud', label: 'External Cloud' },
  { value: 'actor', label: 'User / Actor' },
  { value: 'decision', label: 'Decision Diamond' },
  { value: 'zone', label: 'VPC / Zone' },
  { value: 'text', label: 'Text Heading' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  elements,
  selectedIds,
  themeId,
  settings,
  onUpdateElement,
  onSetSelectedColor,
  onConvertShape,
  onAlign,
  onDistribute,
  onReorderLayer,
  onDeleteSelected,
  onSetTheme,
  onSetGridStyle,
  onToggleSnap,
  onToggleNotes,
  onToggleSlideFrame,
  onFocusElement,
}) => {
  const palette = PALETTES[themeId];
  const isDark = palette.isDark;
  const selectedSet = new Set(selectedIds);
  const selectedEls = elements.filter((e) => selectedSet.has(e.id));
  const single = selectedEls.length === 1 ? selectedEls[0] : null;
  const notes = elements.filter(isNoteElement);

  const panelCls = isDark
    ? 'bg-slate-900/95 border-slate-800 text-slate-200'
    : 'bg-white/95 border-slate-200 text-slate-800';
  const inputCls = isDark
    ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-sky-500'
    : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-500';
  const subtleBtn = isDark
    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700';

  return (
    <aside
      aria-label="Properties Inspector"
      className={`w-64 shrink-0 border-l overflow-y-auto thin-scroll p-3 flex flex-col gap-4 select-none z-20 ${panelCls}`}
    >
      {/* Multi-selection view */}
      {selectedEls.length > 1 && (
        <>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">
              {selectedEls.length} Elements Selected
            </div>

            <div className="text-[11px] font-semibold mb-1.5 opacity-80">Align</div>
            <div className="grid grid-cols-6 gap-1 mb-3">
              <button
                type="button"
                onClick={() => onAlign('left')}
                title="Align Left"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignStartVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAlign('center')}
                title="Align Center Horizontally"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignCenterVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAlign('right')}
                title="Align Right"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignEndVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAlign('top')}
                title="Align Top"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignStartHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAlign('middle')}
                title="Align Middle Vertically"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onAlign('bottom')}
                title="Align Bottom"
                className={`p-1.5 rounded-lg border flex justify-center cursor-pointer ${subtleBtn}`}
              >
                <AlignEndHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedEls.length >= 3 && (
              <>
                <div className="text-[11px] font-semibold mb-1.5 opacity-80">Distribute</div>
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  <button
                    type="button"
                    onClick={() => onDistribute('horizontal')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${subtleBtn}`}
                  >
                    <AlignHorizontalSpaceAround className="w-3.5 h-3.5" /> Horizontal
                  </button>
                  <button
                    type="button"
                    onClick={() => onDistribute('vertical')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${subtleBtn}`}
                  >
                    <AlignVerticalSpaceAround className="w-3.5 h-3.5" /> Vertical
                  </button>
                </div>
              </>
            )}

            <div className="text-[11px] font-semibold mb-1.5 opacity-80">Batch Semantic Role</div>
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {SEMANTIC_COLOR_ORDER.map((c) => {
                const tok = palette.tokens[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSetSelectedColor(c)}
                    title={tok.label}
                    className="h-7 rounded-lg border flex items-center justify-center cursor-pointer hover:scale-105 transition"
                    style={{ backgroundColor: tok.fill, borderColor: tok.stroke }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tok.stroke }}
                    />
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onDeleteSelected}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete {selectedEls.length} Items
            </button>
          </div>
        </>
      )}

      {/* Single selection view */}
      {single && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-60">
              {single.type} Properties
            </span>
            <button
              type="button"
              onClick={onDeleteSelected}
              title="Delete (Del)"
              className="p-1 rounded text-rose-500 hover:bg-rose-500/15 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {isNoteElement(single) ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Note Title
                </label>
                <input
                  value={single.title}
                  onChange={(e) => onUpdateElement(single.id, { title: e.target.value })}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Consultant Details
                </label>
                <textarea
                  rows={4}
                  value={single.body}
                  onChange={(e) => onUpdateElement(single.id, { body: e.target.value })}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none resize-y ${inputCls}`}
                />
              </div>
              <label className="flex items-center justify-between text-xs font-medium cursor-pointer py-1">
                <span>Collapse to Pin Badge</span>
                <input
                  type="checkbox"
                  checked={single.collapsed}
                  onChange={(e) =>
                    onUpdateElement(single.id, { collapsed: e.target.checked } as Partial<NoteElement>)
                  }
                  className="accent-sky-600"
                />
              </label>
            </>
          ) : isConnectorElement(single) ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Edge Label / Protocol
                </label>
                <input
                  value={single.label ?? ''}
                  placeholder="e.g. gRPC, Async, HTTPS"
                  onChange={(e) => onUpdateElement(single.id, { label: e.target.value })}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Routing Style
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(['orthogonal', 'curved', 'straight'] as ConnectorRouteStyle[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onUpdateElement(single.id, { routeStyle: r })}
                      className={`py-1.5 rounded-lg border text-[11px] font-medium capitalize cursor-pointer ${
                        single.routeStyle === r
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : subtleBtn
                      }`}
                    >
                      {r === 'orthogonal' ? 'Elbow' : r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">
                    Start Head
                  </label>
                  <select
                    value={single.startArrow}
                    onChange={(e) =>
                      onUpdateElement(single.id, { startArrow: e.target.value as ArrowHead })
                    }
                    className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  >
                    <option value="none">None</option>
                    <option value="arrow">Arrow</option>
                    <option value="open">Open Arrow</option>
                    <option value="diamond">Diamond</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">
                    End Head
                  </label>
                  <select
                    value={single.endArrow}
                    onChange={(e) =>
                      onUpdateElement(single.id, { endArrow: e.target.value as ArrowHead })
                    }
                    className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  >
                    <option value="none">None</option>
                    <option value="arrow">Arrow</option>
                    <option value="open">Open Arrow</option>
                    <option value="diamond">Diamond</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Component Type
                </label>
                <select
                  value={single.type}
                  onChange={(e) => onConvertShape(e.target.value as ShapeKind)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                >
                  {SHAPE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">
                  Primary Label
                </label>
                <input
                  value={single.label}
                  onChange={(e) => onUpdateElement(single.id, { label: e.target.value })}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                />
              </div>
              {single.type !== 'zone' && (
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">
                    Subtitle / Tech Stack
                  </label>
                  <input
                    value={single.sublabel ?? ''}
                    placeholder="e.g. PostgreSQL 16, REST"
                    onChange={(e) => onUpdateElement(single.id, { sublabel: e.target.value })}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none ${inputCls}`}
                  />
                </div>
              )}
              {single.type === 'service' && (
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">
                    Corner Badge Tag
                  </label>
                  <input
                    value={single.badge ?? ''}
                    maxLength={10}
                    placeholder="e.g. API, GO, EKS"
                    onChange={(e) => onUpdateElement(single.id, { badge: e.target.value })}
                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs uppercase outline-none ${inputCls}`}
                  />
                </div>
              )}
            </>
          )}

          {/* Semantic Color & Stroke */}
          <div>
            <label className="block text-[11px] font-semibold mb-1.5 opacity-75">
              Semantic Role Color
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SEMANTIC_COLOR_ORDER.map((c) => {
                const tok = palette.tokens[c];
                const active = single.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSetSelectedColor(c)}
                    title={tok.label}
                    className={`h-7 rounded-lg border flex items-center justify-center cursor-pointer transition ${
                      active ? 'ring-2 ring-sky-500 scale-105' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: tok.fill, borderColor: tok.stroke }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tok.stroke }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5 opacity-75">
              Line / Border Style
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['solid', 'dashed', 'dotted'] as BorderStyle[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => onUpdateElement(single.id, { borderStyle: b })}
                  className={`py-1.5 rounded-lg border text-[11px] font-medium capitalize cursor-pointer ${
                    single.borderStyle === b
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : subtleBtn
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold mb-1.5 opacity-75">
              Layer Order
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onReorderLayer('front')}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${subtleBtn}`}
              >
                <ArrowUpToLine className="w-3.5 h-3.5" /> Front
              </button>
              <button
                type="button"
                onClick={() => onReorderLayer('back')}
                className={`flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer ${subtleBtn}`}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas settings view when nothing selected */}
      {selectedEls.length === 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 mb-2">
              Canvas & Consulting View
            </div>

            <div className="text-[11px] font-semibold mb-1.5 opacity-80">Theme Palette</div>
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {THEME_LIST.map((t) => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSetTheme(t.id)}
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      active
                        ? 'border-sky-500 bg-sky-500/10'
                        : isDark
                          ? 'border-slate-700 hover:bg-slate-800'
                          : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-3 h-3 rounded-full border"
                        style={{
                          backgroundColor: t.canvasBg,
                          borderColor: t.tokens.primary.stroke,
                        }}
                      />
                      <span className="text-[11px] font-semibold truncate">{t.name.split(' ')[0]}</span>
                    </div>
                    <div className="text-[9.5px] opacity-60 truncate">{t.name}</div>
                  </button>
                );
              })}
            </div>

            <div className="text-[11px] font-semibold mb-1.5 opacity-80">Grid Style</div>
            <div className="grid grid-cols-3 gap-1 mb-3">
              {(['dots', 'blueprint', 'none'] as GridStyle[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onSetGridStyle(g)}
                  className={`py-1.5 rounded-lg border text-[11px] font-medium capitalize cursor-pointer ${
                    settings.gridStyle === g
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : subtleBtn
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                <span>Snap to Grid ({settings.gridSize}px)</span>
                <input
                  type="checkbox"
                  checked={settings.snapToGrid}
                  onChange={onToggleSnap}
                  className="accent-sky-600"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                <span>16:9 Slide Frame (F)</span>
                <input
                  type="checkbox"
                  checked={settings.showSlideFrame}
                  onChange={onToggleSlideFrame}
                  className="accent-sky-600"
                />
              </label>
            </div>
          </div>

          <div className={`h-px ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

          {/* Hideable Notes Summary List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
                <StickyNote className="w-3 h-3 text-amber-500" />
                Notes ({notes.length})
              </span>
              <button
                type="button"
                onClick={onToggleNotes}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${subtleBtn}`}
              >
                {settings.showNotes ? (
                  <>
                    <Eye className="w-3 h-3" /> Shown
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3" /> Hidden
                  </>
                )}
              </button>
            </div>

            {notes.length === 0 ? (
              <p className="text-[11px] opacity-60 leading-relaxed">
                Press <kbd className="font-mono px-1 rounded bg-slate-500/15">N</kbd> or select a
                node and press <kbd className="font-mono px-1 rounded bg-slate-500/15">M</kbd> to
                add hideable consulting notes.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {notes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onFocusElement(n.id)}
                    className={`w-full text-left p-2 rounded-lg border transition cursor-pointer ${
                      isDark
                        ? 'bg-slate-800/60 border-slate-700 hover:border-amber-500/60'
                        : 'bg-amber-50/70 border-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">
                      {n.title || 'Consultant Note'}
                    </div>
                    <div className="text-[10.5px] opacity-70 truncate">{n.body}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
