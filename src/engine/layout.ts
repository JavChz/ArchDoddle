import {
  AlignKind,
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  DistributeAxis,
  NoteElement,
  ShapeElement,
  ShapeKind,
  isBoundedElement,
  isNoteElement,
} from '../types/diagram';
import {
  DEFAULT_DIMENSIONS,
  boundsIntersect,
  buildElementsMap,
  getElementBounds,
  snapValue,
} from './geometry';

export function computeQuickFlowPlacement(
  source: ShapeElement,
  direction: CardinalSide,
  existingElements: DiagramElement[],
  nextKind: ShapeKind = 'service',
  gridSize = 20,
): { node: ShapeElement; connector: ConnectorElement } {
  const dims = DEFAULT_DIMENSIONS[nextKind];
  const gap = 100;
  let x = source.x;
  let y = source.y;

  switch (direction) {
    case 'right':
      x = source.x + source.width + gap;
      y = source.y + (source.height - dims.height) / 2;
      break;
    case 'left':
      x = source.x - dims.width - gap;
      y = source.y + (source.height - dims.height) / 2;
      break;
    case 'bottom':
      x = source.x + (source.width - dims.width) / 2;
      y = source.y + source.height + gap;
      break;
    case 'top':
      x = source.x + (source.width - dims.width) / 2;
      y = source.y - dims.height - gap;
      break;
  }

  x = snapValue(x, gridSize);
  y = snapValue(y, gridSize);

  // Nudge perpendicularly if overlapping an existing non-zone node
  const obstacles = existingElements.filter(
    (el) => isBoundedElement(el) && el.id !== source.id && el.type !== 'zone',
  );
  const step = 100;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidateBounds = { x, y, width: dims.width, height: dims.height };
    const collides = obstacles.some((obs) => boundsIntersect(candidateBounds, getElementBounds(obs)));
    if (!collides) break;
    if (direction === 'left' || direction === 'right') {
      y += step;
    } else {
      x += step;
    }
  }

  const maxZ = existingElements.reduce((m, el) => Math.max(m, el.zIndex), 0);
  const nodeId = crypto.randomUUID();
  const connId = crypto.randomUUID();

  const node: ShapeElement = {
    id: nodeId,
    type: nextKind,
    x,
    y,
    width: dims.width,
    height: dims.height,
    label: dims.label,
    sublabel: dims.sublabel,
    badge: dims.badge,
    color: source.color === 'external' ? 'primary' : source.color,
    borderStyle: 'solid',
    zIndex: maxZ + 1,
  };

  const opposite: Record<CardinalSide, CardinalSide> = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  };

  const connector: ConnectorElement = {
    id: connId,
    type: 'connector',
    startPoint: { x: source.x + source.width / 2, y: source.y + source.height / 2 },
    endPoint: { x: x + dims.width / 2, y: y + dims.height / 2 },
    startBinding: { elementId: source.id, port: direction },
    endBinding: { elementId: nodeId, port: opposite[direction] },
    routeStyle: 'orthogonal',
    startArrow: 'none',
    endArrow: 'arrow',
    color: 'neutral',
    borderStyle: 'solid',
    zIndex: maxZ + 2,
  };

  return { node, connector };
}

export function alignElements(
  elements: DiagramElement[],
  selectedIds: string[],
  alignment: AlignKind,
): DiagramElement[] {
  const selectedSet = new Set(selectedIds);
  const map = buildElementsMap(elements);
  const targets = elements.filter(
    (el): el is ShapeElement | NoteElement => selectedSet.has(el.id) && isBoundedElement(el),
  );
  if (targets.length < 2) return elements;

  const boundsList = targets.map((el) => ({ el, b: getElementBounds(el, map) }));
  const minX = Math.min(...boundsList.map((item) => item.b.x));
  const maxX = Math.max(...boundsList.map((item) => item.b.x + item.b.width));
  const minY = Math.min(...boundsList.map((item) => item.b.y));
  const maxY = Math.max(...boundsList.map((item) => item.b.y + item.b.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const updates = new Map<string, { x: number; y: number }>();
  for (const { el, b } of boundsList) {
    let nx = el.x;
    let ny = el.y;
    switch (alignment) {
      case 'left':
        nx = minX;
        break;
      case 'center':
        nx = midX - b.width / 2;
        break;
      case 'right':
        nx = maxX - b.width;
        break;
      case 'top':
        ny = minY;
        break;
      case 'middle':
        ny = midY - b.height / 2;
        break;
      case 'bottom':
        ny = maxY - b.height;
        break;
    }
    updates.set(el.id, { x: Math.round(nx), y: Math.round(ny) });
  }

  return elements.map((el) => {
    const u = updates.get(el.id);
    if (!u || !isBoundedElement(el)) return el;
    return { ...el, x: u.x, y: u.y };
  });
}

export function distributeElements(
  elements: DiagramElement[],
  selectedIds: string[],
  axis: DistributeAxis,
): DiagramElement[] {
  const selectedSet = new Set(selectedIds);
  const map = buildElementsMap(elements);
  const targets = elements.filter(
    (el): el is ShapeElement | NoteElement => selectedSet.has(el.id) && isBoundedElement(el),
  );
  if (targets.length < 3) return elements;

  const items = targets.map((el) => ({ el, b: getElementBounds(el, map) }));
  const updates = new Map<string, { x: number; y: number }>();

  if (axis === 'horizontal') {
    items.sort((a, b) => a.b.x - b.b.x);
    const first = items[0];
    const last = items[items.length - 1];
    const totalWidth = items.reduce((s, item) => s + item.b.width, 0);
    const span = last.b.x + last.b.width - first.b.x;
    const gap = (span - totalWidth) / (items.length - 1);
    let cursor = first.b.x;
    for (const item of items) {
      updates.set(item.el.id, { x: Math.round(cursor), y: item.el.y });
      cursor += item.b.width + gap;
    }
  } else {
    items.sort((a, b) => a.b.y - b.b.y);
    const first = items[0];
    const last = items[items.length - 1];
    const totalHeight = items.reduce((s, item) => s + item.b.height, 0);
    const span = last.b.y + last.b.height - first.b.y;
    const gap = (span - totalHeight) / (items.length - 1);
    let cursor = first.b.y;
    for (const item of items) {
      updates.set(item.el.id, { x: item.el.x, y: Math.round(cursor) });
      cursor += item.b.height + gap;
    }
  }

  return elements.map((el) => {
    const u = updates.get(el.id);
    if (!u || !isBoundedElement(el)) return el;
    return { ...el, x: u.x, y: u.y };
  });
}

export function sortElementsForTabOrder(
  elements: DiagramElement[],
  showNotes: boolean,
): DiagramElement[] {
  const map = buildElementsMap(elements);
  const visible = elements.filter((el) => !(isNoteElement(el) && !showNotes));
  return [...visible].sort((a, b) => {
    const ba = getElementBounds(a, map);
    const bb = getElementBounds(b, map);
    const rowDiff = Math.round(ba.y / 60) - Math.round(bb.y / 60);
    if (rowDiff !== 0) return rowDiff;
    return ba.x - bb.x;
  });
}
