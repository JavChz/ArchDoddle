import { renderScene } from '../engine/renderer';
import { ProjectDocument } from '../types/diagram';
import { computeExportContentBounds } from './svgExporter';

export interface PngExportOptions {
  scale: 1 | 2 | 3;
  includeNotes: boolean;
  includeBackground: boolean;
  padding?: number;
}

export function sanitizeFilename(name: string): string {
  const clean = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return clean || 'archdoddle-diagram';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}

export async function exportToPngBlob(
  doc: ProjectDocument,
  options: PngExportOptions,
): Promise<Blob> {
  const padding = options.padding ?? 40;
  const bounds = computeExportContentBounds(doc, options.includeNotes, padding);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bounds.width * options.scale));
  canvas.height = Math.max(1, Math.round(bounds.height * options.scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D rendering context for PNG export.');
  }

  renderScene(ctx, {
    width: bounds.width,
    height: bounds.height,
    dpr: options.scale,
    viewport: {
      x: -bounds.x,
      y: -bounds.y,
      zoom: 1,
    },
    elements: doc.elements,
    themeId: doc.themeId,
    settings: {
      ...doc.settings,
      showNotes: options.includeNotes,
      showSlideFrame: false,
      gridStyle: 'none',
    },
    interactive: false,
    includeBackground: options.includeBackground,
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG image.'));
    }, 'image/png');
  });
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard image copy is not supported in this browser context.');
  }
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}
