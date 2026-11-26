import {
  COLLAPSED_NOTE_HEIGHT,
  COLLAPSED_NOTE_WIDTH,
  buildElementsMap,
  getElementBounds,
  getPortPoint,
  getSelectionBounds,
  resolveBestPorts,
} from '../engine/geometry';
import { computeConnectorPath } from '../engine/routing';
import { PALETTES, ThemePalette } from '../themes/palettes';
import {
  ArrowHead,
  BorderStyle,
  ConnectorElement,
  DiagramElement,
  NoteElement,
  Point,
  ProjectDocument,
  ShapeElement,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';

export interface SvgExportOptions {
  includeNotes: boolean;
  includeBackground: boolean;
  padding?: number;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLinesApprox(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  if (!text) return [];
  const avgCharW = fontSize * 0.56;
  const maxChars = Math.max(8, Math.floor(maxWidth / avgCharW));
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') {
      lines.push('');
      if (lines.length >= maxLines) break;
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) break;
        }
        current = word;
      }
    }
    if (lines.length >= maxLines) break;
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

function dashAttr(style: BorderStyle): string {
  if (style === 'dashed') return ' stroke-dasharray="7 5"';
  if (style === 'dotted') return ' stroke-dasharray="2.2 4.2"';
  return '';
}

function renderCenteredTextSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  sublabel: string | undefined,
  textColor: string,
  subtextColor: string,
  fontSize = 13,
): string {
  const maxW = Math.max(24, w - 18);
  const lines = wrapLinesApprox(label, maxW, fontSize, sublabel ? 2 : 3);
  const lineH = fontSize * 1.25;
  const subH = sublabel ? 15 : 0;
  const totalH = lines.length * lineH + (sublabel ? subH + 3 : 0);
  let cy = y + h / 2 - totalH / 2 + lineH / 2;
  const cx = x + w / 2;

  const parts: string[] = [];
  for (const line of lines) {
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="600" fill="${textColor}">${escapeXml(line)}</text>`,
    );
    cy += lineH;
  }
  if (sublabel) {
    parts.push(
      `<text x="${cx}" y="${cy + 4}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="500" fill="${subtextColor}">${escapeXml(sublabel)}</text>`,
    );
  }
  return parts.join('');
}

function renderArrowHeadSvg(
  tip: Point,
  angleRad: number,
  kind: ArrowHead,
  strokeColor: string,
  bgColor: string,
): string {
  if (kind === 'none') return '';
  const deg = (angleRad * 180) / Math.PI;
  const size = 9.5;
  const fill = kind === 'open' ? bgColor : strokeColor;
  if (kind === 'diamond') {
    return `<polygon points="0,0 ${-size * 0.85},${-size * 0.48} ${-size * 1.7},0 ${-size * 0.85},${size * 0.48}" fill="${fill}" stroke="${strokeColor}" stroke-width="1.6" transform="translate(${tip.x},${tip.y}) rotate(${deg})"/>`;
  }
  return `<polygon points="0,0 ${-size},${-size * 0.48} ${-size},${size * 0.48}" fill="${fill}" stroke="${strokeColor}" stroke-width="1.6" transform="translate(${tip.x},${tip.y}) rotate(${deg})"/>`;
}

function orthogonalRoundedSvgPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  if (pts.length <= 2) {
    return `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
  }
  const segs: string[] = [`M ${pts[0].x} ${pts[0].y}`];
  const cornerRadius = 7;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const r = Math.min(cornerRadius, d1 / 2, d2 / 2);
    if (r < 1) {
      segs.push(`L ${curr.x} ${curr.y}`);
    } else {
      const u1x = (curr.x - prev.x) / d1;
      const u1y = (curr.y - prev.y) / d1;
      const u2x = (next.x - curr.x) / d2;
      const u2y = (next.y - curr.y) / d2;
      segs.push(`L ${curr.x - u1x * r} ${curr.y - u1y * r}`);
      segs.push(`Q ${curr.x} ${curr.y} ${curr.x + u2x * r} ${curr.y + u2y * r}`);
    }
  }
  const last = pts[pts.length - 1];
  segs.push(`L ${last.x} ${last.y}`);
  return segs.join(' ');
}

function renderZoneSvg(el: ShapeElement, palette: ThemePalette): string {
  const token = palette.tokens[el.color];
  const labelText = el.label || 'Zone';
  const pillW = Math.min(el.width - 20, Math.max(60, labelText.length * 7.2 + 22));
  return [
    `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="10" fill="${palette.zoneFill}" fill-opacity="0.55" stroke="${token.stroke}" stroke-width="1.6"${dashAttr(el.borderStyle)}/>`,
    `<rect x="${el.x + 12}" y="${el.y + 8}" width="${pillW}" height="24" rx="6" fill="${palette.zoneHeaderBg}" stroke="${token.stroke}" stroke-width="1"/>`,
    `<text x="${el.x + 22}" y="${el.y + 20}" dominant-baseline="central" font-size="12" font-weight="600" fill="${token.text}">${escapeXml(labelText)}</text>`,
  ].join('');
}

function renderShapeSvg(el: ShapeElement, palette: ThemePalette): string {
  const token = palette.tokens[el.color];
  const { x, y, width: w, height: h } = el;

  switch (el.type) {
    case 'zone':
      return renderZoneSvg(el, palette);
    case 'service': {
      const parts = [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        `<path d="M ${x + 8} ${y} L ${x + w - 8} ${y} Q ${x + w} ${y} ${x + w} ${y + 4} L ${x} ${y + 4} Q ${x} ${y} ${x + 8} ${y} Z" fill="${token.headerBg}"/>`,
      ];
      if (el.badge) {
        const badgeText = el.badge.toUpperCase();
        const bw = Math.min(w - 20, badgeText.length * 6.5 + 14);
        const bx = x + w - bw - 8;
        const by = y + 9;
        parts.push(
          `<rect x="${bx}" y="${by}" width="${bw}" height="16" rx="4" fill="${token.badgeBg}"/>`,
          `<text x="${bx + bw / 2}" y="${by + 8.5}" text-anchor="middle" dominant-baseline="central" font-size="9.5" font-weight="700" fill="${token.badgeText}">${escapeXml(badgeText)}</text>`,
        );
      }
      const topOffset = el.badge ? 10 : 4;
      parts.push(
        renderCenteredTextSvg(
          x,
          y + topOffset,
          w,
          h - topOffset,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 13,
        ),
      );
      return parts.join('');
    }
    case 'database': {
      const ry = Math.min(13, Math.max(8, h * 0.14));
      const rx = w / 2;
      const cx = x + rx;
      const bodyPath = `M ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${rx} ${ry} 0 0 1 ${x} ${y + h - ry} Z`;
      return [
        `<path d="${bodyPath}" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        `<ellipse cx="${cx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="${token.badgeBg}" stroke="${token.stroke}" stroke-width="1.7"/>`,
        renderCenteredTextSvg(
          x,
          y + ry * 1.6,
          w,
          h - ry * 2.2,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 13,
        ),
      ].join('');
    }
    case 'queue': {
      const rx = Math.min(16, Math.max(10, w * 0.1));
      const ry = h / 2;
      const bodyPath = `M ${x + rx} ${y} L ${x + w - rx} ${y} A ${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} L ${x + rx} ${y + h} A ${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
      return [
        `<path d="${bodyPath}" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        `<ellipse cx="${x + w - rx}" cy="${y + ry}" rx="${rx}" ry="${ry}" fill="${token.badgeBg}" stroke="${token.stroke}" stroke-width="1.7"/>`,
        `<line x1="${x + rx + 10}" y1="${y + 10}" x2="${x + rx + 10}" y2="${y + h - 10}" stroke="${token.stroke}" stroke-opacity="0.3" stroke-width="1.2"/>`,
        `<line x1="${x + rx + 18}" y1="${y + 10}" x2="${x + rx + 18}" y2="${y + h - 10}" stroke="${token.stroke}" stroke-opacity="0.3" stroke-width="1.2"/>`,
        renderCenteredTextSvg(
          x + rx + 12,
          y,
          w - rx * 2 - 14,
          h,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 13,
        ),
      ].join('');
    }
    case 'cloud': {
      const d = `M ${x + w * 0.24} ${y + h * 0.84} C ${x + w * 0.04} ${y + h * 0.84}, ${x + w * 0.02} ${y + h * 0.56}, ${x + w * 0.16} ${y + h * 0.48} C ${x + w * 0.14} ${y + h * 0.22}, ${x + w * 0.36} ${y + h * 0.1}, ${x + w * 0.52} ${y + h * 0.22} C ${x + w * 0.64} ${y + h * 0.08}, ${x + w * 0.86} ${y + h * 0.2}, ${x + w * 0.84} ${y + h * 0.44} C ${x + w * 0.99} ${y + h * 0.5}, ${x + w * 0.96} ${y + h * 0.84}, ${x + w * 0.78} ${y + h * 0.84} Z`;
      return [
        `<path d="${d}" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        renderCenteredTextSvg(
          x + w * 0.1,
          y + h * 0.2,
          w * 0.8,
          h * 0.66,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 13,
        ),
      ].join('');
    }
    case 'actor': {
      const cx = x + w / 2;
      const iconY = y + 18;
      return [
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        `<circle cx="${cx}" cy="${iconY}" r="6" fill="${token.badgeBg}" stroke="${token.stroke}" stroke-width="1.5"/>`,
        `<path d="M ${cx - 9} ${iconY + 12} A 10 10 0 0 1 ${cx + 9} ${iconY + 12}" fill="none" stroke="${token.stroke}" stroke-width="1.5"/>`,
        renderCenteredTextSvg(
          x,
          y + 30,
          w,
          h - 32,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 12.5,
        ),
      ].join('');
    }
    case 'decision': {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
      return [
        `<polygon points="${pts}" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.7"${dashAttr(el.borderStyle)}/>`,
        renderCenteredTextSvg(
          x + w * 0.16,
          y + h * 0.14,
          w * 0.68,
          h * 0.72,
          el.label,
          el.sublabel,
          token.text,
          token.subtext,
          el.fontSize ?? 12.5,
        ),
      ].join('');
    }
    case 'text': {
      const fontSize = el.fontSize ?? 16;
      const lines = wrapLinesApprox(el.label, Math.max(40, w - 12), fontSize, 4);
      const parts: string[] = [];
      let cy = y + 6;
      for (const line of lines) {
        parts.push(
          `<text x="${x + 6}" y="${cy}" dominant-baseline="hanging" font-size="${fontSize}" font-weight="700" fill="${token.text}">${escapeXml(line)}</text>`,
        );
        cy += fontSize * 1.25;
      }
      if (el.sublabel) {
        parts.push(
          `<text x="${x + 6}" y="${cy + 2}" dominant-baseline="hanging" font-size="12" font-weight="500" fill="${token.subtext}">${escapeXml(el.sublabel)}</text>`,
        );
      }
      return parts.join('');
    }
  }
}

function renderConnectorSvg(
  conn: ConnectorElement,
  elementsMap: Map<string, DiagramElement>,
  palette: ThemePalette,
): string {
  const path = computeConnectorPath(conn, elementsMap);
  const token = palette.tokens[conn.color];
  const stroke =
    conn.color === 'neutral' ? palette.defaultConnectorStroke : token.stroke;
  const strokeWidth = conn.strokeWidth ?? 1.9;
  const pts = path.points;
  if (pts.length < 2) return '';

  let d: string;
  if (conn.routeStyle === 'curved' && path.controlPoints) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    const [cp1, cp2] = path.controlPoints;
    d = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
  } else if (conn.routeStyle === 'orthogonal') {
    d = orthogonalRoundedSvgPath(pts);
  } else {
    d = `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
  }

  const parts = [
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr(conn.borderStyle)}/>`,
    renderArrowHeadSvg(pts[0], path.startAngle, conn.startArrow, stroke, palette.canvasBg),
    renderArrowHeadSvg(pts[pts.length - 1], path.endAngle, conn.endArrow, stroke, palette.canvasBg),
  ];

  if (conn.label && conn.label.trim()) {
    const pw = conn.label.length * 6.5 + 16;
    const ph = 20;
    const lx = path.labelPoint.x - pw / 2;
    const ly = path.labelPoint.y - ph / 2;
    parts.push(
      `<rect x="${lx}" y="${ly}" width="${pw}" height="${ph}" rx="5" fill="${palette.connectorLabelBg}" stroke="${stroke}" stroke-opacity="0.65" stroke-width="1"/>`,
      `<text x="${path.labelPoint.x}" y="${path.labelPoint.y + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="600" fill="${palette.connectorLabelText}">${escapeXml(conn.label)}</text>`,
    );
  }

  return parts.join('');
}

function renderNoteSvg(
  note: NoteElement,
  elementsMap: Map<string, DiagramElement>,
  palette: ThemePalette,
): string {
  const token = palette.tokens[note.color];
  const nb = note.collapsed
    ? { x: note.x, y: note.y, width: COLLAPSED_NOTE_WIDTH, height: COLLAPSED_NOTE_HEIGHT }
    : { x: note.x, y: note.y, width: note.width, height: note.height };

  const parts: string[] = [];

  if (note.attachedToId) {
    const target = elementsMap.get(note.attachedToId);
    if (target && isBoundedElement(target)) {
      const tb = getElementBounds(target, elementsMap);
      const { startSide, endSide } = resolveBestPorts(nb, tb);
      const p1 = getPortPoint(nb, startSide);
      const p2 = getPortPoint(tb, endSide);
      parts.push(
        `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${token.stroke}" stroke-width="1.3" stroke-opacity="0.7" stroke-dasharray="4 4"/>`,
        `<circle cx="${p2.x}" cy="${p2.y}" r="3.2" fill="${token.stroke}"/>`,
      );
    }
  }

  const { x, y, width: w, height: h } = nb;
  if (note.collapsed) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.5"/>`,
      `<rect x="${x + 6}" y="${y + 7}" width="4" height="${h - 14}" rx="2" fill="${token.headerBg}"/>`,
      `<text x="${x + 16}" y="${y + h / 2}" dominant-baseline="central" font-size="10" font-weight="700" fill="${token.badgeText}">NOTE</text>`,
      `<text x="${x + 50}" y="${y + h / 2}" dominant-baseline="central" font-size="11.5" font-weight="600" fill="${token.text}">${escapeXml(note.title || 'Consultant Note')}</text>`,
    );
    return parts.join('');
  }

  const fold = 14;
  const cardPath = `M ${x + 8} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h - 8} Q ${x + w} ${y + h} ${x + w - 8} ${y + h} L ${x + 8} ${y + h} Q ${x} ${y + h} ${x} ${y + h - 8} L ${x} ${y + 8} Q ${x} ${y} ${x + 8} ${y} Z`;
  const foldPath = `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold} Z`;

  parts.push(
    `<path d="${cardPath}" fill="${token.fill}" stroke="${token.stroke}" stroke-width="1.6"${dashAttr(note.borderStyle)}/>`,
    `<path d="${foldPath}" fill="${token.badgeBg}" stroke="${token.stroke}" stroke-width="1.4"/>`,
    `<line x1="${x + 10}" y1="${y + 27}" x2="${x + w - 10}" y2="${y + 27}" stroke="${token.stroke}" stroke-opacity="0.25" stroke-width="1"/>`,
    `<rect x="${x + 10}" y="${y + 7}" width="36" height="15" rx="4" fill="${token.badgeBg}"/>`,
    `<text x="${x + 28}" y="${y + 14.5}" text-anchor="middle" dominant-baseline="central" font-size="9.5" font-weight="700" fill="${token.badgeText}">NOTE</text>`,
    `<text x="${x + 52}" y="${y + 15}" dominant-baseline="central" font-size="12" font-weight="700" fill="${token.text}">${escapeXml(note.title || 'Consultant Note')}</text>`,
  );

  const maxLines = Math.max(1, Math.floor((h - 40) / 16));
  const bodyLines = wrapLinesApprox(note.body, Math.max(40, w - 22), 11.5, maxLines);
  let cy = y + 34;
  for (const line of bodyLines) {
    parts.push(
      `<text x="${x + 11}" y="${cy}" dominant-baseline="hanging" font-size="11.5" font-weight="400" fill="${token.subtext}">${escapeXml(line)}</text>`,
    );
    cy += 16;
  }

  return parts.join('');
}

export function computeExportContentBounds(
  doc: ProjectDocument,
  includeNotes: boolean,
  padding = 40,
) {
  const elementsMap = buildElementsMap(doc.elements);
  const included = doc.elements.filter((el) => includeNotes || !isNoteElement(el));
  const bounds = getSelectionBounds(included, elementsMap) ?? {
    x: 0,
    y: 0,
    width: 640,
    height: 360,
  };
  return {
    x: Math.floor(bounds.x - padding),
    y: Math.floor(bounds.y - padding),
    width: Math.ceil(bounds.width + padding * 2),
    height: Math.ceil(bounds.height + padding * 2),
  };
}

export function exportToSvg(doc: ProjectDocument, options: SvgExportOptions): string {
  const palette = PALETTES[doc.themeId];
  const padding = options.padding ?? 40;
  const view = computeExportContentBounds(doc, options.includeNotes, padding);
  const elementsMap = buildElementsMap(doc.elements);
  const sorted = [...doc.elements].sort((a, b) => a.zIndex - b.zIndex);

  const zones: ShapeElement[] = [];
  const connectors: ConnectorElement[] = [];
  const shapes: ShapeElement[] = [];
  const notes: NoteElement[] = [];

  for (const el of sorted) {
    if (isNoteElement(el)) {
      if (options.includeNotes) notes.push(el);
    } else if (isConnectorElement(el)) {
      connectors.push(el);
    } else if (el.type === 'zone') {
      zones.push(el);
    } else {
      shapes.push(el);
    }
  }

  const body = [
    ...zones.map((z) => renderShapeSvg(z, palette)),
    ...connectors.map((c) => renderConnectorSvg(c, elementsMap, palette)),
    ...shapes.map((s) => renderShapeSvg(s, palette)),
    ...notes.map((n) => renderNoteSvg(n, elementsMap, palette)),
  ].join('\n  ');

  const bgRect = options.includeBackground
    ? `\n  <rect x="${view.x}" y="${view.y}" width="${view.width}" height="${view.height}" fill="${palette.canvasBg}"/>`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="${view.x} ${view.y} ${view.width} ${view.height}" style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">`,
    `  <title>${escapeXml(doc.name)}</title>${bgRect}`,
    `  ${body}`,
    `</svg>`,
  ].join('\n');
}
