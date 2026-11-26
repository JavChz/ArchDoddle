import React, { useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileCode2,
  FileJson,
  Image as ImageIcon,
  Presentation,
  X,
} from 'lucide-react';
import {
  copyPngToClipboard,
  downloadBlob,
  downloadText,
  exportToPngBlob,
  sanitizeFilename,
} from '../exporters/pngExporter';
import { PptxMode, PptxNotesMode, generatePptxBlob } from '../exporters/pptxExporter';
import { exportToSvg } from '../exporters/svgExporter';
import { ProjectDocument, isNoteElement } from '../types/diagram';

interface ExportModalProps {
  open: boolean;
  doc: ProjectDocument;
  isDark: boolean;
  onClose: () => void;
  onExportJson: () => void;
  onExportBackup: () => void;
}

type ExportTab = 'pptx' | 'svg' | 'png' | 'json';

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  doc,
  isDark,
  onClose,
  onExportJson,
  onExportBackup,
}) => {
  const [tab, setTab] = useState<ExportTab>('pptx');
  const [pptxMode, setPptxMode] = useState<PptxMode>('editable');
  const [pptxNotesMode, setPptxNotesMode] = useState<PptxNotesMode>('speaker-notes');
  const [includeNotes, setIncludeNotes] = useState(doc.settings.showNotes);
  const [includeBg, setIncludeBg] = useState(true);
  const [pngScale, setPngScale] = useState<1 | 2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open) return null;

  const noteCount = doc.elements.filter(isNoteElement).length;
  const slug = sanitizeFilename(doc.name);

  const showToast = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2600);
  };

  const handleDownloadPptx = async () => {
    setBusy(true);
    try {
      const blob = await generatePptxBlob(doc, {
        mode: pptxMode,
        notesMode: pptxNotesMode,
      });
      downloadBlob(blob, `${slug}.pptx`);
      showToast('PowerPoint (.pptx) downloaded');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PPTX export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSvg = () => {
    const svg = exportToSvg(doc, {
      includeNotes,
      includeBackground: includeBg,
    });
    downloadText(svg, `${slug}.svg`, 'image/svg+xml;charset=utf-8');
    showToast('SVG vector file downloaded');
  };

  const handleCopySvg = async () => {
    const svg = exportToSvg(doc, {
      includeNotes,
      includeBackground: includeBg,
    });
    await navigator.clipboard.writeText(svg);
    showToast('SVG markup copied to clipboard');
  };

  const handleDownloadPng = async () => {
    setBusy(true);
    try {
      const blob = await exportToPngBlob(doc, {
        scale: pngScale,
        includeNotes,
        includeBackground: includeBg,
      });
      downloadBlob(blob, `${slug}@${pngScale}x.png`);
      showToast(`PNG (${pngScale}x) downloaded`);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPng = async () => {
    setBusy(true);
    try {
      const blob = await exportToPngBlob(doc, {
        scale: pngScale,
        includeNotes,
        includeBackground: includeBg,
      });
      await copyPngToClipboard(blob);
      showToast('PNG image copied to clipboard');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Clipboard copy failed');
    } finally {
      setBusy(false);
    }
  };

  const modalCls = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900';
  const cardCls = isDark
    ? 'bg-slate-800/70 border-slate-700'
    : 'bg-slate-50 border-slate-200';

  const tabs: { id: ExportTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'pptx', label: 'PowerPoint', icon: Presentation },
    { id: 'svg', label: 'SVG Vector', icon: FileCode2 },
    { id: 'png', label: 'PNG Image', icon: ImageIcon },
    { id: 'json', label: 'Project JSON', icon: FileJson },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className={`relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden ${modalCls}`}
      >
        <div className="px-5 py-3.5 border-b border-slate-300/20 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Export & Render Diagram</h2>
            <p className="text-[11px] opacity-65">
              {doc.name} · {doc.elements.length} elements · {noteCount} notes
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

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-1.5 border-b border-slate-300/20">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition cursor-pointer ${
                  active
                    ? 'border-sky-500 text-sky-500'
                    : 'border-transparent opacity-65 hover:opacity-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 flex flex-col gap-4">
          {tab === 'pptx' && (
            <>
              <div>
                <div className="text-xs font-semibold mb-2">Slide Rendering Mode</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPptxMode('editable')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      pptxMode === 'editable'
                        ? 'border-sky-500 bg-sky-500/10'
                        : cardCls
                    }`}
                  >
                    <div className="text-xs font-bold">Editable Native Shapes</div>
                    <div className="text-[11px] opacity-70 mt-0.5">
                      Vector boxes, cylinders, arrows & text editable inside PowerPoint.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPptxMode('image')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      pptxMode === 'image'
                        ? 'border-sky-500 bg-sky-500/10'
                        : cardCls
                    }`}
                  >
                    <div className="text-xs font-bold">High-Res Slide Snapshot</div>
                    <div className="text-[11px] opacity-70 mt-0.5">
                      Pixel-identical 3x canvas render embedded into a 16:9 slide.
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-2">
                  Consultant Notes Handling ({noteCount} notes)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'speaker-notes', label: 'Speaker Notes', desc: 'Clean slide + presenter notes' },
                      { id: 'on-slide', label: 'On Slide', desc: 'Include callouts visibly' },
                      { id: 'omit', label: 'Omit Notes', desc: 'Architecture only' },
                    ] as { id: PptxNotesMode; label: string; desc: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPptxNotesMode(opt.id)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer ${
                        pptxNotesMode === opt.id
                          ? 'border-sky-500 bg-sky-500/10'
                          : cardCls
                      }`}
                    >
                      <div className="text-[11px] font-bold">{opt.label}</div>
                      <div className="text-[10px] opacity-65 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadPptx}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {busy ? 'Generating Presentation…' : `Download ${slug}.pptx`}
              </button>
            </>
          )}

          {tab === 'svg' && (
            <>
              <div className={`p-3 rounded-xl border flex flex-col gap-2.5 ${cardCls}`}>
                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span>Include Consultant Notes ({noteCount})</span>
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="accent-sky-600"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span>Include Theme Background</span>
                  <input
                    type="checkbox"
                    checked={includeBg}
                    onChange={(e) => setIncludeBg(e.target.checked)}
                    className="accent-sky-600"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopySvg}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${cardCls}`}
                >
                  <ClipboardCopy className="w-4 h-4" /> Copy SVG Code
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSvg}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download .svg
                </button>
              </div>
            </>
          )}

          {tab === 'png' && (
            <>
              <div>
                <div className="text-xs font-semibold mb-2">Resolution Scale</div>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPngScale(s)}
                      className={`py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        pngScale === s ? 'border-sky-500 bg-sky-500/10 text-sky-500' : cardCls
                      }`}
                    >
                      {s}x {s === 2 ? '(Retina)' : s === 3 ? '(Print/Deck)' : '(Standard)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`p-3 rounded-xl border flex flex-col gap-2.5 ${cardCls}`}>
                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span>Include Consultant Notes ({noteCount})</span>
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(e) => setIncludeNotes(e.target.checked)}
                    className="accent-sky-600"
                  />
                </label>
                <label className="flex items-center justify-between text-xs font-medium cursor-pointer">
                  <span>Include Theme Background</span>
                  <input
                    type="checkbox"
                    checked={includeBg}
                    onChange={(e) => setIncludeBg(e.target.checked)}
                    className="accent-sky-600"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCopyPng}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${cardCls}`}
                >
                  <ClipboardCopy className="w-4 h-4" /> Copy Image
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDownloadPng}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Download .png
                </button>
              </div>
            </>
          )}

          {tab === 'json' && (
            <>
              <p className="text-xs opacity-75 leading-relaxed">
                Save portable ArchDoddle project files to share with colleagues, version in Git, or
                re-import anytime with zero vendor lock-in.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onExportJson();
                    showToast('Project JSON downloaded');
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" /> Current Project
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportBackup();
                    showToast('Full workspace backup downloaded');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${cardCls}`}
                >
                  <Download className="w-4 h-4" /> All Projects Backup
                </button>
              </div>
            </>
          )}

          {feedback && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <Check className="w-4 h-4" /> {feedback}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
