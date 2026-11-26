import React from 'react';
import { ToastItem } from '../store/useDiagramStore';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold shadow-lg border backdrop-blur-md ${
            t.kind === 'error'
              ? 'bg-rose-600/95 border-rose-500 text-white'
              : t.kind === 'success'
                ? 'bg-emerald-600/95 border-emerald-500 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-100'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};
