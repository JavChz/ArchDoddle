import React from 'react';
import { Keyboard, Mouse, X } from 'lucide-react';

interface ShortcutsModalProps {
  open: boolean;
  isDark: boolean;
  onClose: () => void;
}

const KEYBOARD_GROUPS = [
  {
    title: 'Keyboard-Only Creation & Flow',
    items: [
      ['Shift + S / D / Q / C / U / G / Z / T / N', 'Drop component at focal point immediately'],
      ['Ctrl + Arrow (Right/Down/Left/Up)', 'Spawn & connect next node + start typing label'],
      ['M', 'Attach hideable Consultant Note to selected node'],
      ['P  or  Alt + N', 'Hide / Show all Consultant Notes'],
      ['Alt + 1..6', 'Convert selected shape (Service/DB/Queue/Cloud/Actor/Decision)'],
      ['Enter / F2', 'Edit label of selected node, connector, or note'],
    ],
  },
  {
    title: 'Keyboard Navigation & Editing',
    items: [
      ['Tab / Shift + Tab', 'Cycle through visible diagram items'],
      ['Arrow / Shift + Arrow', 'Nudge selected items (or pan canvas if none selected)'],
      ['Alt + Arrow', 'Always pan canvas'],
      ['Delete / Backspace', 'Delete selected items & bound connectors'],
      ['Ctrl + Z / Ctrl + Y', 'Undo / Redo'],
      ['Ctrl + D / C / V / A', 'Duplicate / Copy / Paste / Select All'],
      ['[ / ]', 'Send Backward / Bring Forward'],
      ['Ctrl + K  or  /', 'Open Command Palette'],
    ],
  },
];

const MOUSE_ITEMS = [
  ['Left Drag (Empty Space)', 'Marquee box selection (works inside VPC zones too)'],
  ['Double-Click (Empty Space)', 'Instant Service box + inline edit'],
  ['Double-Click (Node / Line / Note)', 'Inline edit text directly on canvas'],
  ['Hover + Port Circles', 'Click to spawn connected node, or drag to connect to another'],
  ['Right-Click Drag / Middle-Drag / Space+Drag', 'Grab & pan canvas effortlessly'],
  ['Short Right-Click', 'Context menu (Add, Convert, Note, Delete, Fit, Export)'],
  ['Scroll Wheel / Trackpad Pinch', 'Zoom centered at cursor'],
  ['Eraser Tool (X) Sweep', 'Click or drag across items to delete cleanly'],
  ['+ / - / 1 / 2 / Ctrl+0', 'Zoom In / Out / Fit All / Zoom Selection / 100%'],
  ['F / I / Ctrl+O / Ctrl+E', '16:9 Slide Frame / Inspector / Projects / Export'],
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  open,
  isDark,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className={`relative z-10 w-full max-w-3xl max-h-[85vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="px-5 py-3.5 border-b border-slate-300/20 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold">Power-User Keyboard & Mouse Workflows</h2>
            <p className="text-[11px] opacity-65">
              Operate ArchDoddle completely hands-on-keyboard or completely mouse-only
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

        <div className="p-5 overflow-y-auto thin-scroll grid md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-5">
            {KEYBOARD_GROUPS.map((grp) => (
              <div key={grp.title}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sky-500 flex items-center gap-1.5 mb-2.5">
                  <Keyboard className="w-3.5 h-3.5" /> {grp.title}
                </h3>
                <div className="flex flex-col gap-1.5">
                  {grp.items.map(([key, desc]) => (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-2 text-xs py-1 border-b border-slate-400/15"
                    >
                      <kbd
                        className={`px-1.5 py-0.5 rounded font-mono text-[10.5px] shrink-0 ${
                          isDark ? 'bg-slate-800 text-sky-300' : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {key}
                      </kbd>
                      <span className="text-right opacity-80">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-teal-500 flex items-center gap-1.5 mb-2.5">
              <Mouse className="w-3.5 h-3.5" /> Mouse-Only & Navigation Controls
            </h3>
            <div className="flex flex-col gap-1.5">
              {MOUSE_ITEMS.map(([gesture, desc]) => (
                <div
                  key={gesture}
                  className="flex items-start justify-between gap-2 text-xs py-1 border-b border-slate-400/15"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold text-[10.5px] shrink-0 ${
                      isDark ? 'bg-slate-800 text-teal-300' : 'bg-teal-50 text-teal-900'
                    }`}
                  >
                    {gesture}
                  </span>
                  <span className="text-right opacity-80">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
