import PptxGenJS from 'pptxgenjs';
import {
  COLLAPSED_NOTE_HEIGHT,
  COLLAPSED_NOTE_WIDTH,
  buildElementsMap,
  getSelectionBounds,
} from '../engine/geometry';
import { computeConnectorPath } from '../engine/routing';
import { PALETTES } from '../themes/palettes';
import {
  ArrowHead,
  BorderStyle,
  ConnectorElement,
  NoteElement,
  ProjectDocument,
  ShapeElement,
  isConnectorElement,
  isNoteElement,
  isShapeElement,
} from '../types/diagram';
import { downloadBlob, exportToPngBlob, sanitizeFilename } from './pngExporter';

export type PptxMode = 'editable' | 'image';
export type PptxNotesMode = 'speaker-notes' | 'on-slide' | 'omit';

export interface PptxExportOptions {
  mode: PptxMode;
  notesMode: PptxNotesMode;
}

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const CONTENT_X = 0.5;
const CONTENT_Y = 0.65;
const CONTENT_W = SLIDE_W - 1.0;
const CONTENT_H = SLIDE_H - 1.15;

function stripHash(hex: string): string {
  return hex.replace(/^#/, '').toUpperCase();
}

function mapDashType(style: BorderStyle): 'solid' | 'dash' | 'sysDot' {
  if (style === 'dashed') return 'dash';
  if (style === 'dotted') return 'sysDot';
  return 'solid';
}

function mapArrow(arrow: ArrowHead): 'none' | 'triangle' | 'diamond' | 'arrow' {
  if (arrow === 'arrow') return 'triangle';
  if (arrow === 'open') return 'arrow';
  if (arrow === 'diamond') return 'diamond';
  return 'none';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to encode PNG image for PowerPoint slide.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

function buildSpeakerNotesText(doc: ProjectDocument): string {
  const elementsMap = buildElementsMap(doc.elements);
  const notes = doc.elements.filter(isNoteElement);
  if (notes.length === 0) return '';
  return notes
    .map((n, idx) => {
      const target = n.attachedToId ? elementsMap.get(n.attachedToId) : undefined;
      const targetLabel =
        target && isShapeElement(target) ? ` [Attached to: ${target.label}]` : '';
      return `${idx + 1}. ${n.title || 'Consultant Note'}${targetLabel}\n   ${n.body}`;
    })
    .join('\n\n');
}

export async function generatePptxBlob(
  doc: ProjectDocument,
  options: PptxExportOptions,
): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = doc.name;
  pptx.author = 'ArchDoddle';
  pptx.subject = 'Architecture Diagram';

  const palette = PALETTES[doc.themeId];
  const slide = pptx.addSlide();
  slide.background = { color: stripHash(palette.canvasBg) };

  // Subtle slide header with diagram title
  slide.addText(doc.name, {
    x: 0.5,
    y: 0.18,
    w: 11.5,
    h: 0.36,
    fontSize: 14,
    bold: true,
    color: stripHash(palette.tokens.neutral.text),
    fontFace: 'Segoe UI',
    margin: 0,
  });

  const includeVisualNotes = options.notesMode === 'on-slide';
  const elementsMap = buildElementsMap(doc.elements);

  if (options.mode === 'image') {
    const pngBlob = await exportToPngBlob(doc, {
      scale: 3,
      includeNotes: includeVisualNotes,
      includeBackground: true,
      padding: 36,
    });
    const dataUrl = await blobToDataUrl(pngBlob);
    slide.addImage({
      data: dataUrl,
      x: CONTENT_X,
      y: CONTENT_Y,
      w: CONTENT_W,
      h: CONTENT_H,
      sizing: {
        type: 'contain',
        w: CONTENT_W,
        h: CONTENT_H,
      },
    });
  } else {
    const visualElements = doc.elements.filter((el) => includeVisualNotes || !isNoteElement(el));
    const bounds = getSelectionBounds(visualElements, elementsMap) ?? {
      x: 0,
      y: 0,
      width: 640,
      height: 360,
    };

    const scale = Math.min(
      CONTENT_W / Math.max(40, bounds.width),
      CONTENT_H / Math.max(40, bounds.height),
    );
    const renderedW = bounds.width * scale;
    const renderedH = bounds.height * scale;
    const offsetX = CONTENT_X + (CONTENT_W - renderedW) / 2;
    const offsetY = CONTENT_Y + (CONTENT_H - renderedH) / 2;

    const toInchX = (wx: number) => offsetX + (wx - bounds.x) * scale;
    const toInchY = (wy: number) => offsetY + (wy - bounds.y) * scale;
    const toInchLen = (w: number) => Math.max(0.05, w * scale);
    const fontScale = Math.max(0.55, Math.min(1.15, scale * 72));

    const sorted = [...visualElements].sort((a, b) => a.zIndex - b.zIndex);
    const zones: ShapeElement[] = [];
    const connectors: ConnectorElement[] = [];
    const shapes: ShapeElement[] = [];
    const notes: NoteElement[] = [];

    for (const el of sorted) {
      if (isNoteElement(el)) notes.push(el);
      else if (isConnectorElement(el)) connectors.push(el);
      else if (el.type === 'zone') zones.push(el);
      else shapes.push(el);
    }

    // 1. Zones
    for (const z of zones) {
      const token = palette.tokens[z.color];
      const zx = toInchX(z.x);
      const zy = toInchY(z.y);
      const zw = toInchLen(z.width);
      const zh = toInchLen(z.height);
      slide.addShape(pptx.ShapeType.roundRect, {
        x: zx,
        y: zy,
        w: zw,
        h: zh,
        rectRadius: 0.06,
        fill: { color: stripHash(palette.zoneFill), transparency: 35 },
        line: {
          color: stripHash(token.stroke),
          width: 1.25,
          dashType: mapDashType(z.borderStyle),
        },
      });
      slide.addText(z.label || 'Zone', {
        x: zx + 0.12,
        y: zy + 0.06,
        w: Math.max(0.6, zw - 0.24),
        h: 0.26,
        fontSize: Math.max(8, Math.round(10 * fontScale)),
        bold: true,
        color: stripHash(token.text),
        fontFace: 'Segoe UI',
        margin: 0,
      });
    }

    // 2. Connectors (drawn as native PPTX line segments)
    for (const c of connectors) {
      const path = computeConnectorPath(c, elementsMap);
      const token = palette.tokens[c.color];
      const stroke = stripHash(
        c.color === 'neutral' ? palette.defaultConnectorStroke : token.stroke,
      );
      const pts = path.points;
      if (pts.length < 2) continue;

      const segPts =
        c.routeStyle === 'curved' && pts.length > 4
          ? [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]]
          : pts;

      for (let i = 0; i < segPts.length - 1; i++) {
        const p1 = segPts[i];
        const p2 = segPts[i + 1];
        const x1 = toInchX(p1.x);
        const y1 = toInchY(p1.y);
        const x2 = toInchX(p2.x);
        const y2 = toInchY(p2.y);

        const isFirst = i === 0;
        const isLast = i === segPts.length - 2;
        const dx = x2 - x1;
        const dy = y2 - y1;

        slide.addShape(pptx.ShapeType.line, {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(dx) < 0.002 ? 0 : Math.abs(dx),
          h: Math.abs(dy) < 0.002 ? 0 : Math.abs(dy),
          flipH: dx < 0,
          flipV: dy < 0,
          line: {
            color: stroke,
            width: 1.5,
            dashType: mapDashType(c.borderStyle),
            beginArrowType: isFirst ? mapArrow(c.startArrow) : 'none',
            endArrowType: isLast ? mapArrow(c.endArrow) : 'none',
          },
        });
      }

      if (c.label && c.label.trim()) {
        const lw = Math.max(0.65, c.label.length * 0.08 + 0.2);
        const lh = 0.24;
        slide.addText(c.label, {
          x: toInchX(path.labelPoint.x) - lw / 2,
          y: toInchY(path.labelPoint.y) - lh / 2,
          w: lw,
          h: lh,
          fill: { color: stripHash(palette.connectorLabelBg) },
          line: { color: stroke, width: 0.75 },
          color: stripHash(palette.connectorLabelText),
          fontSize: Math.max(7.5, Math.round(9 * fontScale)),
          bold: true,
          align: 'center',
          valign: 'middle',
          fontFace: 'Segoe UI',
          margin: 1,
        });
      }
    }

    // 3. Shapes
    for (const s of shapes) {
      const token = palette.tokens[s.color];
      const sx = toInchX(s.x);
      const sy = toInchY(s.y);
      const sw = toInchLen(s.width);
      const sh = toInchLen(s.height);
      const stroke = stripHash(token.stroke);
      const fill = stripHash(token.fill);

      if (s.type === 'text') {
        const runs: PptxGenJS.TextProps[] = [
          {
            text: s.label,
            options: {
              bold: true,
              fontSize: Math.max(10, Math.round((s.fontSize ?? 15) * fontScale)),
              color: stripHash(token.text),
              breakLine: !!s.sublabel,
            },
          },
        ];
        if (s.sublabel) {
          runs.push({
            text: s.sublabel,
            options: {
              fontSize: Math.max(8.5, Math.round(11 * fontScale)),
              color: stripHash(token.subtext),
            },
          });
        }
        slide.addText(runs, {
          x: sx,
          y: sy,
          w: sw,
          h: sh,
          valign: 'top',
          fontFace: 'Segoe UI',
          margin: 2,
        });
        continue;
      }

      const shapeType =
        s.type === 'database'
          ? pptx.ShapeType.can
          : s.type === 'queue'
            ? pptx.ShapeType.flowChartMagneticDrum
            : s.type === 'cloud'
              ? pptx.ShapeType.cloud
              : s.type === 'decision'
                ? pptx.ShapeType.diamond
                : pptx.ShapeType.roundRect;

      const textRuns: PptxGenJS.TextProps[] = [
        {
          text: s.badge ? `[${s.badge}] ${s.label}` : s.label,
          options: {
            bold: true,
            fontSize: Math.max(8, Math.round((s.fontSize ?? 11.5) * fontScale)),
            color: stripHash(token.text),
            breakLine: !!s.sublabel,
          },
        },
      ];
      if (s.sublabel) {
        textRuns.push({
          text: s.sublabel,
          options: {
            fontSize: Math.max(7, Math.round(9.5 * fontScale)),
            color: stripHash(token.subtext),
          },
        });
      }

      slide.addText(textRuns, {
        shape: shapeType,
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        rectRadius: s.type === 'actor' ? 0.14 : 0.08,
        fill: { color: fill },
        line: {
          color: stroke,
          width: 1.4,
          dashType: mapDashType(s.borderStyle),
        },
        align: 'center',
        valign: 'middle',
        fontFace: 'Segoe UI',
        margin: 4,
      });

      // Top accent bar on service cards for visual fidelity
      if (s.type === 'service') {
        slide.addShape(pptx.ShapeType.rect, {
          x: sx + 0.03,
          y: sy + 0.01,
          w: Math.max(0.05, sw - 0.06),
          h: 0.045,
          fill: { color: stripHash(token.headerBg) },
          line: { type: 'none' },
        });
      }
    }

    // 4. Optional on-slide notes
    if (includeVisualNotes) {
      for (const n of notes) {
        const token = palette.tokens[n.color];
        const nb = n.collapsed
          ? { x: n.x, y: n.y, width: COLLAPSED_NOTE_WIDTH, height: COLLAPSED_NOTE_HEIGHT }
          : { x: n.x, y: n.y, width: n.width, height: n.height };
        slide.addText(
          [
            {
              text: `${n.title || 'Consultant Note'}\n`,
              options: {
                bold: true,
                fontSize: Math.max(8, Math.round(10 * fontScale)),
                color: stripHash(token.text),
              },
            },
            ...(n.collapsed
              ? []
              : [
                  {
                    text: n.body,
                    options: {
                      fontSize: Math.max(7.5, Math.round(9 * fontScale)),
                      color: stripHash(token.subtext),
                    },
                  },
                ]),
          ],
          {
            shape: pptx.ShapeType.snip1Rect,
            x: toInchX(nb.x),
            y: toInchY(nb.y),
            w: toInchLen(nb.width),
            h: toInchLen(nb.height),
            fill: { color: stripHash(token.fill) },
            line: { color: stripHash(token.stroke), width: 1.25 },
            align: 'left',
            valign: 'top',
            fontFace: 'Segoe UI',
            margin: 5,
          },
        );
      }
    }
  }

  // Attach consultant notes into PowerPoint Speaker Notes when requested
  if (options.notesMode === 'speaker-notes') {
    const notesText = buildSpeakerNotesText(doc);
    if (notesText) {
      slide.addNotes(notesText);
    }
  }

  const output = await pptx.write({ outputType: 'blob' });
  if (output instanceof Blob) return output;
  if (output instanceof ArrayBuffer || output instanceof Uint8Array) {
    return new Blob([output as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
  return new Blob([String(output)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

export async function exportToPptx(
  doc: ProjectDocument,
  options: PptxExportOptions,
): Promise<void> {
  const blob = await generatePptxBlob(doc, options);
  downloadBlob(blob, `${sanitizeFilename(doc.name)}.pptx`);
}
