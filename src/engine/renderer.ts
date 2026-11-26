import { PALETTES, ThemePalette } from '../themes/palettes';
import {
  ArrowHead,
  BorderStyle,
  Bounds,
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  NoteElement,
  Point,
  ProjectSettings,
  ShapeElement,
  SmartGuide,
  ThemeId,
  Viewport,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';
import {
  COLLAPSED_NOTE_HEIGHT,
  COLLAPSED_NOTE_WIDTH,
  SLIDE_FRAME_BOUNDS,
  buildElementsMap,
  getElementBounds,
  getPortPoint,
  getQuickConnectPorts,
  getResizeHandles,
  isShapeResizable,
  resolveBestPorts,
} from './geometry';
import { supportsQuickConnect } from './hitTest';
import { computeConnectorPath } from './routing';

export interface RenderSceneOptions {
  width: number;
  height: number;
  dpr: number;
  viewport: Viewport;
  elements: DiagramElement[];
  themeId: ThemeId;
  settings: ProjectSettings;
  interactive: boolean;
  includeBackground?: boolean;
  selectedIds?: string[];
  hoveredId?: string | null;
  hoveredQuickPort?: { elementId: string; side: CardinalSide } | null;
  marqueeRect?: Bounds | null;
  draftShape?: ShapeElement | NoteElement | null;
  draftConnector?: ConnectorElement | null;
  snapTarget?: { elementId: string; side: CardinalSide; point: Point } | null;
  smartGuides?: SmartGuide[];
  eraserIds?: Set<string>;
  eraserTrail?: Point[];
  editingId?: string | null;
}

const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 8,
): string[] {
  if (!text) return [];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      if (lines.length >= maxLines) break;
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) break;
        }
        // Handle very long single word
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              lines.push(chunk);
              if (lines.length >= maxLines) break;
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
  }

  return lines.slice(0, maxLines);
}

function setBorderDash(ctx: CanvasRenderingContext2D, style: BorderStyle, strokeWidth = 1.6) {
  if (style === 'dashed') {
    ctx.setLineDash([7, 5]);
  } else if (style === 'dotted') {
    ctx.setLineDash([strokeWidth * 1.3, strokeWidth * 2.5]);
  } else {
    ctx.setLineDash([]);
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  settings: ProjectSettings,
  palette: ThemePalette,
) {
  if (settings.gridStyle === 'none') return;

  let step = Math.max(10, settings.gridSize || 20);
  while (step * viewport.zoom < 12) {
    step *= 2;
  }

  const startX = Math.floor(-viewport.x / viewport.zoom / step) * step;
  const endX = Math.ceil((width - viewport.x) / viewport.zoom / step) * step;
  const startY = Math.floor(-viewport.y / viewport.zoom / step) * step;
  const endY = Math.ceil((height - viewport.y) / viewport.zoom / step) * step;

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  if (settings.gridStyle === 'dots') {
    ctx.fillStyle = palette.gridMinor;
    const dotSize = Math.max(1, 1.4 / viewport.zoom);
    for (let x = startX; x <= endX; x += step) {
      for (let y = startY; y <= endY; y += step) {
        ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
      }
    }
  } else if (settings.gridStyle === 'blueprint') {
    const majorStep = step * 5;
    ctx.lineWidth = 1 / viewport.zoom;
    ctx.strokeStyle = palette.gridMinor;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (x % majorStep === 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      if (y % majorStep === 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    ctx.strokeStyle = palette.gridMajor;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += step) {
      if (x % majorStep !== 0) continue;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += step) {
      if (y % majorStep !== 0) continue;
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawSlideFrame(
  ctx: CanvasRenderingContext2D,
  palette: ThemePalette,
  zoom: number,
) {
  const { x, y, width, height } = SLIDE_FRAME_BOUNDS;
  ctx.save();
  ctx.strokeStyle = palette.slideFrameStroke;
  ctx.lineWidth = 1.5 / zoom;
  ctx.setLineDash([8 / zoom, 6 / zoom]);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);

  // Corner technical label
  const fontSize = Math.max(10, 11 / Math.min(1, zoom));
  ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
  ctx.fillStyle = palette.slideFrameLabel;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText('16:9 SLIDE FRAME · 1280×720', x + 4, y - 6);
  ctx.restore();
}

function drawZone(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  ctx.save();
  drawRoundedRectPath(ctx, el.x, el.y, el.width, el.height, 10);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = palette.zoneFill;
  ctx.fill();
  ctx.globalAlpha = el.opacity ?? 1;
  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.6;
  setBorderDash(ctx, el.borderStyle, 1.6);
  ctx.stroke();
  ctx.setLineDash([]);

  // Top-left header pill
  if (!isEditing) {
    ctx.font = `600 12px ${FONT_FAMILY}`;
    const labelText = el.label || 'Zone';
    const textW = ctx.measureText(labelText).width;
    const pillW = Math.min(el.width - 20, textW + 22);
    const pillH = 24;
    drawRoundedRectPath(ctx, el.x + 12, el.y + 8, pillW, pillH, 6);
    ctx.fillStyle = palette.zoneHeaderBg;
    ctx.fill();
    ctx.strokeStyle = token.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = token.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(labelText, el.x + 22, el.y + 8 + pillH / 2, Math.max(20, pillW - 16));
  }
  ctx.restore();
}

function drawCenteredLabels(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  sublabel: string | undefined,
  textColor: string,
  subtextColor: string,
  fontSize = 13,
) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxW = Math.max(24, w - 18);
  ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
  const labelLines = wrapTextLines(ctx, label, maxW, sublabel ? 2 : 3);
  const lineH = fontSize * 1.25;
  const subH = sublabel ? 15 : 0;
  const totalH = labelLines.length * lineH + (sublabel ? subH + 3 : 0);
  let cursorY = y + h / 2 - totalH / 2 + lineH / 2;

  ctx.fillStyle = textColor;
  for (const line of labelLines) {
    ctx.fillText(line, x + w / 2, cursorY, maxW);
    cursorY += lineH;
  }

  if (sublabel) {
    ctx.font = `500 11px ${FONT_FAMILY}`;
    ctx.fillStyle = subtextColor;
    ctx.fillText(sublabel, x + w / 2, cursorY + 4, maxW);
  }
  ctx.restore();
}

function drawService(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width, height } = el;
  ctx.save();

  // Subtle card shadow
  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  drawRoundedRectPath(ctx, x, y, width, height, 8);
  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Clip top accent stripe inside rounded shape
  ctx.save();
  drawRoundedRectPath(ctx, x, y, width, height, 8);
  ctx.clip();
  ctx.fillStyle = token.headerBg;
  ctx.fillRect(x, y, width, 4);
  ctx.restore();

  drawRoundedRectPath(ctx, x, y, width, height, 8);
  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.stroke();
  ctx.setLineDash([]);

  if (el.badge && !isEditing) {
    ctx.font = `700 9.5px ${FONT_FAMILY}`;
    const bw = Math.min(width - 20, ctx.measureText(el.badge.toUpperCase()).width + 12);
    const bx = x + width - bw - 8;
    const by = y + 9;
    drawRoundedRectPath(ctx, bx, by, bw, 16, 4);
    ctx.fillStyle = token.badgeBg;
    ctx.fill();
    ctx.fillStyle = token.badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.badge.toUpperCase(), bx + bw / 2, by + 8.5, bw - 6);
  }

  if (!isEditing) {
    const topOffset = el.badge ? 10 : 4;
    drawCenteredLabels(
      ctx,
      x,
      y + topOffset,
      width,
      height - topOffset,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 13,
    );
  }

  ctx.restore();
}

function drawDatabase(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width, height } = el;
  const ry = Math.min(13, Math.max(8, height * 0.14));
  const rx = width / 2;
  const cx = x + rx;

  ctx.save();
  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.42)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.ellipse(cx, y + ry, rx, ry, 0, Math.PI, 0, false);
  ctx.lineTo(x + width, y + height - ry);
  ctx.ellipse(cx, y + height - ry, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Top cap subtle tint
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = token.badgeBg;
  ctx.fill();
  ctx.restore();

  // Outer cylinder contour
  ctx.beginPath();
  ctx.moveTo(x, y + ry);
  ctx.lineTo(x, y + height - ry);
  ctx.ellipse(cx, y + height - ry, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + width, y + ry);
  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.stroke();

  // Top ellipse rim
  ctx.beginPath();
  ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!isEditing) {
    drawCenteredLabels(
      ctx,
      x,
      y + ry * 1.6,
      width,
      height - ry * 2.2,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 13,
    );
  }

  ctx.restore();
}

function drawQueue(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width, height } = el;
  const rx = Math.min(16, Math.max(10, width * 0.1));
  const ry = height / 2;

  ctx.save();
  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  // Horizontal cylinder body
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + width - rx, y);
  ctx.ellipse(x + width - rx, y + ry, rx, ry, 0, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(x + rx, y + height);
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  ctx.closePath();
  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Right cap accent
  ctx.beginPath();
  ctx.ellipse(x + width - rx, y + ry, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = token.badgeBg;
  ctx.fill();

  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.beginPath();
  ctx.moveTo(x + rx, y);
  ctx.lineTo(x + width - rx, y);
  ctx.ellipse(x + width - rx, y + ry, rx, ry, 0, -Math.PI / 2, Math.PI / 2, false);
  ctx.lineTo(x + rx, y + height);
  ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x + width - rx, y + ry, rx, ry, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
  ctx.stroke();
  ctx.setLineDash([]);

  // Subtle queue partitions on left
  ctx.strokeStyle = token.stroke;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + rx + 10, y + 10);
  ctx.lineTo(x + rx + 10, y + height - 10);
  ctx.moveTo(x + rx + 18, y + 10);
  ctx.lineTo(x + rx + 18, y + height - 10);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!isEditing) {
    drawCenteredLabels(
      ctx,
      x + rx + 12,
      y,
      width - rx * 2 - 14,
      height,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 13,
    );
  }
  ctx.restore();
}

function drawCloud(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width: w, height: h } = el;
  ctx.save();

  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(x + w * 0.24, y + h * 0.84);
  ctx.bezierCurveTo(x + w * 0.04, y + h * 0.84, x + w * 0.02, y + h * 0.56, x + w * 0.16, y + h * 0.48);
  ctx.bezierCurveTo(x + w * 0.14, y + h * 0.22, x + w * 0.36, y + h * 0.10, x + w * 0.52, y + h * 0.22);
  ctx.bezierCurveTo(x + w * 0.64, y + h * 0.08, x + w * 0.86, y + h * 0.20, x + w * 0.84, y + h * 0.44);
  ctx.bezierCurveTo(x + w * 0.99, y + h * 0.50, x + w * 0.96, y + h * 0.84, x + w * 0.78, y + h * 0.84);
  ctx.closePath();

  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!isEditing) {
    drawCenteredLabels(
      ctx,
      x + w * 0.1,
      y + h * 0.2,
      w * 0.8,
      h * 0.66,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 13,
    );
  }
  ctx.restore();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width, height } = el;
  ctx.save();

  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  drawRoundedRectPath(ctx, x, y, width, height, 12);
  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.stroke();
  ctx.setLineDash([]);

  // Minimal persona emblem at top-center
  const cx = x + width / 2;
  const iconY = y + 18;
  ctx.strokeStyle = token.stroke;
  ctx.fillStyle = token.badgeBg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, iconY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, iconY + 16, 10, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  if (!isEditing) {
    drawCenteredLabels(
      ctx,
      x,
      y + 30,
      width,
      height - 32,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 12.5,
    );
  }
  ctx.restore();
}

function drawDecision(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  const { x, y, width: w, height: h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.08)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w, cy);
  ctx.lineTo(cx, y + h);
  ctx.lineTo(x, cy);
  ctx.closePath();

  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.7;
  setBorderDash(ctx, el.borderStyle, 1.7);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!isEditing) {
    drawCenteredLabels(
      ctx,
      x + w * 0.16,
      y + h * 0.14,
      w * 0.68,
      h * 0.72,
      el.label,
      el.sublabel,
      token.text,
      token.subtext,
      el.fontSize ?? 12.5,
    );
  }
  ctx.restore();
}

function drawTextShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isHovered: boolean,
  isSelected: boolean,
  isEditing: boolean,
) {
  const token = palette.tokens[el.color];
  ctx.save();
  if (isHovered || isSelected) {
    drawRoundedRectPath(ctx, el.x, el.y, el.width, el.height, 6);
    ctx.strokeStyle = token.stroke;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (!isEditing) {
    const fontSize = el.fontSize ?? 16;
    ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = token.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lines = wrapTextLines(ctx, el.label, Math.max(40, el.width - 10), 4);
    let cy = el.y + 6;
    for (const line of lines) {
      ctx.fillText(line, el.x + 6, cy, el.width - 12);
      cy += fontSize * 1.25;
    }
    if (el.sublabel) {
      ctx.font = `500 12px ${FONT_FAMILY}`;
      ctx.fillStyle = token.subtext;
      ctx.fillText(el.sublabel, el.x + 6, cy + 2, el.width - 12);
    }
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  angle: number,
  kind: ArrowHead,
  color: string,
  fillBg: string,
) {
  if (kind === 'none') return;
  const size = 9.5;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.fillStyle = kind === 'open' ? fillBg : color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);

  if (kind === 'diamond') {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size * 0.85, -size * 0.48);
    ctx.lineTo(-size * 1.7, 0);
    ctx.lineTo(-size * 0.85, size * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.48);
    ctx.lineTo(-size, size * 0.48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawConnector(
  ctx: CanvasRenderingContext2D,
  conn: ConnectorElement,
  elementsMap: Map<string, DiagramElement>,
  palette: ThemePalette,
  isSelected: boolean,
  isHovered: boolean,
  isMarkedErase: boolean,
  isEditing: boolean,
) {
  const path = computeConnectorPath(conn, elementsMap);
  const token = palette.tokens[conn.color];
  const strokeColor = isMarkedErase
    ? '#EF4444'
    : conn.color === 'neutral'
      ? palette.defaultConnectorStroke
      : token.stroke;
  const strokeWidth = (conn.strokeWidth ?? 1.9) + (isSelected || isHovered ? 0.6 : 0);

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  setBorderDash(ctx, conn.borderStyle, strokeWidth);

  ctx.beginPath();
  const pts = path.points;
  if (conn.routeStyle === 'curved' && path.controlPoints && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    ctx.moveTo(start.x, start.y);
    ctx.bezierCurveTo(
      path.controlPoints[0].x,
      path.controlPoints[0].y,
      path.controlPoints[1].x,
      path.controlPoints[1].y,
      end.x,
      end.y,
    );
  } else if (conn.routeStyle === 'orthogonal' && pts.length >= 3) {
    ctx.moveTo(pts[0].x, pts[0].y);
    const cornerRadius = 7;
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const next = pts[i + 1];
      const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      const r = Math.min(cornerRadius, d1 / 2, d2 / 2);
      if (r < 1) {
        ctx.lineTo(curr.x, curr.y);
      } else {
        const u1x = (curr.x - prev.x) / d1;
        const u1y = (curr.y - prev.y) / d1;
        const u2x = (next.x - curr.x) / d2;
        const u2y = (next.y - curr.y) / d2;
        ctx.lineTo(curr.x - u1x * r, curr.y - u1y * r);
        ctx.quadraticCurveTo(curr.x, curr.y, curr.x + u2x * r, curr.y + u2y * r);
      }
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  } else if (pts.length >= 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (pts.length >= 2) {
    drawArrowHead(ctx, pts[0], path.startAngle, conn.startArrow, strokeColor, palette.canvasBg);
    drawArrowHead(
      ctx,
      pts[pts.length - 1],
      path.endAngle,
      conn.endArrow,
      strokeColor,
      palette.canvasBg,
    );
  }

  // Optional label pill at midpoint
  if (conn.label && conn.label.trim() !== '' && !isEditing) {
    ctx.font = `600 11px ${FONT_FAMILY}`;
    const textW = ctx.measureText(conn.label).width;
    const pw = textW + 14;
    const ph = 20;
    const lx = path.labelPoint.x - pw / 2;
    const ly = path.labelPoint.y - ph / 2;

    drawRoundedRectPath(ctx, lx, ly, pw, ph, 5);
    ctx.fillStyle = palette.connectorLabelBg;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = palette.connectorLabelText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(conn.label, path.labelPoint.x, path.labelPoint.y + 0.5);
  }

  ctx.restore();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  note: NoteElement,
  elementsMap: Map<string, DiagramElement>,
  palette: ThemePalette,
  isEditing: boolean,
) {
  const token = palette.tokens[note.color];
  const noteBounds = note.collapsed
    ? { x: note.x, y: note.y, width: COLLAPSED_NOTE_WIDTH, height: COLLAPSED_NOTE_HEIGHT }
    : { x: note.x, y: note.y, width: note.width, height: note.height };

  ctx.save();

  // Dashed leader line to attached element
  if (note.attachedToId) {
    const target = elementsMap.get(note.attachedToId);
    if (target && isBoundedElement(target)) {
      const tb = getElementBounds(target, elementsMap);
      const { startSide, endSide } = resolveBestPorts(noteBounds, tb);
      const p1 = getPortPoint(noteBounds, startSide);
      const p2 = getPortPoint(tb, endSide);
      ctx.save();
      ctx.strokeStyle = token.stroke;
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = token.stroke;
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const { x, y, width, height } = noteBounds;

  if (note.collapsed) {
    ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.4)' : 'rgba(15,23,42,0.1)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    drawRoundedRectPath(ctx, x, y, width, height, 8);
    ctx.fillStyle = token.fill;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = token.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Left accent pill bar
    drawRoundedRectPath(ctx, x + 6, y + 7, 4, height - 14, 2);
    ctx.fillStyle = token.headerBg;
    ctx.fill();

    if (!isEditing) {
      ctx.font = `700 10px ${FONT_FAMILY}`;
      ctx.fillStyle = token.badgeText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('NOTE', x + 16, y + height / 2);

      ctx.font = `600 11.5px ${FONT_FAMILY}`;
      ctx.fillStyle = token.text;
      ctx.fillText(note.title || 'Consultant Note', x + 50, y + height / 2, width - 58);
    }

    ctx.restore();
    return;
  }

  // Expanded callout card with folded corner accent
  const fold = 14;
  ctx.shadowColor = palette.isDark ? 'rgba(0,0,0,0.42)' : 'rgba(15,23,42,0.1)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(x + 8, y);
  ctx.lineTo(x + width - fold, y);
  ctx.lineTo(x + width, y + fold);
  ctx.lineTo(x + width, y + height - 8);
  ctx.quadraticCurveTo(x + width, y + height, x + width - 8, y + height);
  ctx.lineTo(x + 8, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - 8);
  ctx.lineTo(x, y + 8);
  ctx.quadraticCurveTo(x, y, x + 8, y);
  ctx.closePath();

  ctx.fillStyle = token.fill;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = token.stroke;
  ctx.lineWidth = 1.6;
  setBorderDash(ctx, note.borderStyle, 1.6);
  ctx.stroke();
  ctx.setLineDash([]);

  // Folded corner flap
  ctx.beginPath();
  ctx.moveTo(x + width - fold, y);
  ctx.lineTo(x + width - fold, y + fold);
  ctx.lineTo(x + width, y + fold);
  ctx.closePath();
  ctx.fillStyle = token.badgeBg;
  ctx.fill();
  ctx.stroke();

  // Header divider line
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 27);
  ctx.lineTo(x + width - 10, y + 27);
  ctx.strokeStyle = token.stroke;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!isEditing) {
    // Badge + Title
    ctx.font = `700 9.5px ${FONT_FAMILY}`;
    drawRoundedRectPath(ctx, x + 10, y + 7, 36, 15, 4);
    ctx.fillStyle = token.badgeBg;
    ctx.fill();
    ctx.fillStyle = token.badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NOTE', x + 28, y + 15);

    ctx.font = `700 12px ${FONT_FAMILY}`;
    ctx.fillStyle = token.text;
    ctx.textAlign = 'left';
    ctx.fillText(note.title || 'Consultant Note', x + 52, y + 15, width - 70);

    // Body lines
    ctx.font = `400 11.5px ${FONT_FAMILY}`;
    ctx.fillStyle = token.subtext;
    ctx.textBaseline = 'top';
    const maxBodyLines = Math.max(1, Math.floor((height - 40) / 16));
    const bodyLines = wrapTextLines(ctx, note.body, Math.max(40, width - 22), maxBodyLines);
    let cy = y + 34;
    for (const line of bodyLines) {
      ctx.fillText(line, x + 11, cy, width - 22);
      cy += 16;
    }
  }

  ctx.restore();
}

function drawShapeElement(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  palette: ThemePalette,
  isHovered: boolean,
  isSelected: boolean,
  isEditing: boolean,
) {
  switch (el.type) {
    case 'zone':
      drawZone(ctx, el, palette, isEditing);
      break;
    case 'service':
      drawService(ctx, el, palette, isEditing);
      break;
    case 'database':
      drawDatabase(ctx, el, palette, isEditing);
      break;
    case 'queue':
      drawQueue(ctx, el, palette, isEditing);
      break;
    case 'cloud':
      drawCloud(ctx, el, palette, isEditing);
      break;
    case 'actor':
      drawActor(ctx, el, palette, isEditing);
      break;
    case 'decision':
      drawDecision(ctx, el, palette, isEditing);
      break;
    case 'text':
      drawTextShape(ctx, el, palette, isHovered, isSelected, isEditing);
      break;
  }
}

export function renderScene(ctx: CanvasRenderingContext2D, opts: RenderSceneOptions) {
  const {
    width,
    height,
    dpr,
    viewport,
    elements,
    themeId,
    settings,
    interactive,
    includeBackground = true,
    selectedIds = [],
    hoveredId = null,
    hoveredQuickPort = null,
    marqueeRect = null,
    draftShape = null,
    draftConnector = null,
    snapTarget = null,
    smartGuides = [],
    eraserIds = new Set<string>(),
    eraserTrail = [],
    editingId = null,
  } = opts;

  const palette = PALETTES[themeId];
  const selectedSet = new Set(selectedIds);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (includeBackground) {
    ctx.fillStyle = palette.canvasBg;
    ctx.fillRect(0, 0, width, height);
  }

  if (interactive) {
    drawGrid(ctx, width, height, viewport, settings, palette);
  }

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(viewport.zoom, viewport.zoom);

  if (interactive && settings.showSlideFrame) {
    drawSlideFrame(ctx, palette, viewport.zoom);
  }

  const allElements = [...elements];
  if (draftShape) allElements.push(draftShape);
  if (draftConnector) allElements.push(draftConnector);

  const elementsMap = buildElementsMap(allElements);
  const sorted = [...allElements].sort((a, b) => a.zIndex - b.zIndex);

  const zones: ShapeElement[] = [];
  const connectors: ConnectorElement[] = [];
  const shapes: ShapeElement[] = [];
  const notes: NoteElement[] = [];

  for (const el of sorted) {
    if (isNoteElement(el)) {
      if (settings.showNotes) notes.push(el);
    } else if (isConnectorElement(el)) {
      connectors.push(el);
    } else if (el.type === 'zone') {
      zones.push(el);
    } else {
      shapes.push(el);
    }
  }

  const applyEraseVisual = (id: string, fn: () => void) => {
    const marked = eraserIds.has(id);
    if (marked) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      fn();
      ctx.restore();
    } else {
      fn();
    }
  };

  for (const z of zones) {
    applyEraseVisual(z.id, () => drawZone(ctx, z, palette, editingId === z.id));
  }

  for (const c of connectors) {
    applyEraseVisual(c.id, () =>
      drawConnector(
        ctx,
        c,
        elementsMap,
        palette,
        selectedSet.has(c.id),
        hoveredId === c.id,
        eraserIds.has(c.id),
        editingId === c.id,
      ),
    );
  }

  for (const s of shapes) {
    applyEraseVisual(s.id, () =>
      drawShapeElement(
        ctx,
        s,
        palette,
        hoveredId === s.id,
        selectedSet.has(s.id),
        editingId === s.id,
      ),
    );
  }

  for (const n of notes) {
    applyEraseVisual(n.id, () => drawNote(ctx, n, elementsMap, palette, editingId === n.id));
  }

  if (interactive) {
    // Smart alignment guides
    if (smartGuides.length > 0) {
      ctx.save();
      ctx.strokeStyle = palette.smartGuide;
      ctx.lineWidth = 1.2 / viewport.zoom;
      ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom]);
      for (const g of smartGuides) {
        ctx.beginPath();
        if (g.axis === 'x') {
          ctx.moveTo(g.position, g.start);
          ctx.lineTo(g.position, g.end);
        } else {
          ctx.moveTo(g.start, g.position);
          ctx.lineTo(g.end, g.position);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Hover outline
    if (hoveredId && !selectedSet.has(hoveredId)) {
      const hovered = elementsMap.get(hoveredId);
      if (hovered && !(isNoteElement(hovered) && !settings.showNotes) && !isConnectorElement(hovered)) {
        const hb = getElementBounds(hovered, elementsMap);
        ctx.save();
        ctx.strokeStyle = palette.selectionAccent;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5 / viewport.zoom;
        ctx.strokeRect(hb.x - 3, hb.y - 3, hb.width + 6, hb.height + 6);
        ctx.restore();
      }
    }

    // Selection boxes & handles
    const invZoom = 1 / viewport.zoom;
    for (const id of selectedIds) {
      const el = elementsMap.get(id);
      if (!el || (isNoteElement(el) && !settings.showNotes)) continue;

      if (isConnectorElement(el)) {
        if (selectedIds.length === 1) {
          const path = computeConnectorPath(el, elementsMap);
          const endpoints = [path.points[0], path.points[path.points.length - 1]];
          for (const ep of endpoints) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(ep.x, ep.y, 5.5 * invZoom, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = palette.selectionAccent;
            ctx.lineWidth = 2 * invZoom;
            ctx.stroke();
            ctx.restore();
          }
        }
        continue;
      }

      const b = getElementBounds(el, elementsMap);
      ctx.save();
      ctx.strokeStyle = eraserIds.has(el.id) ? '#EF4444' : palette.selectionAccent;
      ctx.lineWidth = 1.8 * invZoom;
      ctx.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6);

      if (selectedIds.length === 1 && isShapeResizable(el)) {
        const handles = getResizeHandles(b);
        const handleSize = 7.5 * invZoom;
        for (const pt of Object.values(handles)) {
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = palette.selectionAccent;
          ctx.lineWidth = 1.6 * invZoom;
          ctx.fillRect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
        }
      }
      ctx.restore();
    }

    // Quick-connect '+' port circles
    const quickTargetId =
      selectedIds.length === 1 ? selectedIds[0] : hoveredId;
    if (quickTargetId) {
      const qEl = elementsMap.get(quickTargetId);
      if (qEl && supportsQuickConnect(qEl) && !draftConnector) {
        const ports = getQuickConnectPorts(getElementBounds(qEl, elementsMap));
        const r = Math.max(7, 8 * invZoom);
        (['top', 'right', 'bottom', 'left'] as CardinalSide[]).forEach((side) => {
          const p = ports[side];
          const isHot =
            hoveredQuickPort?.elementId === qEl.id && hoveredQuickPort.side === side;
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isHot ? palette.selectionAccent : '#FFFFFF';
          ctx.fill();
          ctx.strokeStyle = palette.selectionAccent;
          ctx.lineWidth = 1.5 * invZoom;
          ctx.stroke();

          // Crisp '+' sign
          ctx.strokeStyle = isHot ? '#FFFFFF' : palette.selectionAccent;
          ctx.lineWidth = 1.6 * invZoom;
          const arm = r * 0.48;
          ctx.beginPath();
          ctx.moveTo(p.x - arm, p.y);
          ctx.lineTo(p.x + arm, p.y);
          ctx.moveTo(p.x, p.y - arm);
          ctx.lineTo(p.x, p.y + arm);
          ctx.stroke();
          ctx.restore();
        });
      }
    }

    // Snap target highlight when drawing/rewiring a connector
    if (snapTarget) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(snapTarget.point.x, snapTarget.point.y, 9 * invZoom, 0, Math.PI * 2);
      ctx.fillStyle = palette.selectionAccent;
      ctx.globalAlpha = 0.25;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(snapTarget.point.x, snapTarget.point.y, 5 * invZoom, 0, Math.PI * 2);
      ctx.fillStyle = palette.selectionAccent;
      ctx.fill();
      ctx.restore();
    }

    // Marquee selection box
    if (marqueeRect) {
      ctx.save();
      ctx.fillStyle = palette.selectionAccent;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = palette.selectionAccent;
      ctx.lineWidth = 1.3 * invZoom;
      ctx.setLineDash([5 * invZoom, 4 * invZoom]);
      ctx.strokeRect(marqueeRect.x, marqueeRect.y, marqueeRect.width, marqueeRect.height);
      ctx.restore();
    }

    // Eraser trail
    if (eraserTrail.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 6 * invZoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.moveTo(eraserTrail[0].x, eraserTrail[0].y);
      for (let i = 1; i < eraserTrail.length; i++) {
        ctx.lineTo(eraserTrail[i].x, eraserTrail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
  ctx.restore();
}
