import {
  Bounds,
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  NoteElement,
  Point,
  PortSide,
  ResizeHandle,
  ShapeElement,
  ShapeKind,
  SmartGuide,
  Viewport,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';

export const COLLAPSED_NOTE_WIDTH = 168;
export const COLLAPSED_NOTE_HEIGHT = 34;
export const SLIDE_FRAME_BOUNDS: Bounds = { x: 0, y: 0, width: 1280, height: 720 };
export const QUICK_PORT_OFFSET = 16;

export const DEFAULT_DIMENSIONS: Record<
  ShapeKind | 'note',
  { width: number; height: number; label: string; sublabel?: string; badge?: string }
> = {
  service: { width: 168, height: 84, label: 'Service', sublabel: 'REST / gRPC', badge: 'SVC' },
  database: { width: 152, height: 88, label: 'Database', sublabel: 'PostgreSQL' },
  queue: { width: 172, height: 74, label: 'Event Queue', sublabel: 'Kafka / SQS' },
  cloud: { width: 174, height: 92, label: 'External Cloud', sublabel: 'SaaS / Third-Party' },
  actor: { width: 146, height: 88, label: 'User / Actor', sublabel: 'Client Persona' },
  decision: { width: 152, height: 98, label: 'Decision?' },
  zone: { width: 420, height: 280, label: 'VPC / Boundary Zone' },
  text: { width: 220, height: 40, label: 'Architecture Heading' },
  note: { width: 230, height: 110, label: 'Consultant Note' },
};

export function screenToWorld(pt: Point, viewport: Viewport): Point {
  return {
    x: (pt.x - viewport.x) / viewport.zoom,
    y: (pt.y - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(pt: Point, viewport: Viewport): Point {
  return {
    x: pt.x * viewport.zoom + viewport.x,
    y: pt.y * viewport.zoom + viewport.y,
  };
}

export function snapValue(value: number, gridSize: number): number {
  if (gridSize <= 1) return Math.round(value);
  return Math.round(value / gridSize) * gridSize;
}

export function getNoteEffectiveBounds(note: NoteElement): Bounds {
  if (note.collapsed) {
    return {
      x: note.x,
      y: note.y,
      width: COLLAPSED_NOTE_WIDTH,
      height: COLLAPSED_NOTE_HEIGHT,
    };
  }
  return {
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
  };
}

export function getElementBounds(
  el: DiagramElement,
  elementsMap?: Map<string, DiagramElement>,
): Bounds {
  if (isNoteElement(el)) {
    return getNoteEffectiveBounds(el);
  }
  if (!isConnectorElement(el)) {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }
  const { start, end } = resolveConnectorEndpoints(el, elementsMap);
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxX = Math.max(start.x, end.x);
  const maxY = Math.max(start.y, end.y);
  return {
    x: minX,
    y: minY,
    width: Math.max(4, maxX - minX),
    height: Math.max(4, maxY - minY),
  };
}

export function getSelectionBounds(
  elements: DiagramElement[],
  elementsMap?: Map<string, DiagramElement>,
): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = getElementBounds(el, elementsMap);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function getBoundsCenter(b: Bounds): Point {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function getPortPoint(bounds: Bounds, side: CardinalSide): Point {
  switch (side) {
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }
}

export function getPortNormal(side: CardinalSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
  }
}

export function resolveBestPorts(
  sourceBounds: Bounds,
  targetBounds: Bounds,
): { startSide: CardinalSide; endSide: CardinalSide } {
  const sc = getBoundsCenter(sourceBounds);
  const tc = getBoundsCenter(targetBounds);
  const dx = tc.x - sc.x;
  const dy = tc.y - sc.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { startSide: 'right', endSide: 'left' }
      : { startSide: 'left', endSide: 'right' };
  }
  return dy >= 0
    ? { startSide: 'bottom', endSide: 'top' }
    : { startSide: 'top', endSide: 'bottom' };
}

export function resolveSideForPoint(sourceBounds: Bounds, targetPoint: Point): CardinalSide {
  const sc = getBoundsCenter(sourceBounds);
  const dx = targetPoint.x - sc.x;
  const dy = targetPoint.y - sc.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

export function getClosestPortSide(bounds: Bounds, pt: Point): CardinalSide {
  const sides: CardinalSide[] = ['top', 'right', 'bottom', 'left'];
  let best: CardinalSide = 'left';
  let bestDist = Infinity;
  for (const side of sides) {
    const p = getPortPoint(bounds, side);
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = side;
    }
  }
  return best;
}

export function resolveConnectorEndpoints(
  conn: ConnectorElement,
  elementsMap?: Map<string, DiagramElement>,
): {
  start: Point;
  end: Point;
  startSide: CardinalSide | null;
  endSide: CardinalSide | null;
} {
  const startEl =
    conn.startBinding && elementsMap ? elementsMap.get(conn.startBinding.elementId) : undefined;
  const endEl =
    conn.endBinding && elementsMap ? elementsMap.get(conn.endBinding.elementId) : undefined;

  const startBounds = startEl && isBoundedElement(startEl) ? getElementBounds(startEl) : null;
  const endBounds = endEl && isBoundedElement(endEl) ? getElementBounds(endEl) : null;

  let startSide: CardinalSide | null = null;
  let endSide: CardinalSide | null = null;

  const resolvePort = (port: PortSide): CardinalSide | null => (port === 'auto' ? null : port);

  if (startBounds && endBounds) {
    const best = resolveBestPorts(startBounds, endBounds);
    startSide = resolvePort(conn.startBinding!.port) ?? best.startSide;
    endSide = resolvePort(conn.endBinding!.port) ?? best.endSide;
  } else if (startBounds) {
    startSide =
      resolvePort(conn.startBinding!.port) ?? resolveSideForPoint(startBounds, conn.endPoint);
  } else if (endBounds) {
    endSide = resolvePort(conn.endBinding!.port) ?? resolveSideForPoint(endBounds, conn.startPoint);
  }

  const start = startBounds && startSide ? getPortPoint(startBounds, startSide) : conn.startPoint;
  const end = endBounds && endSide ? getPortPoint(endBounds, endSide) : conn.endPoint;

  return { start, end, startSide, endSide };
}

export function getResizeHandles(bounds: Bounds): Record<ResizeHandle, Point> {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const r = bounds.x + bounds.width;
  const b = bounds.y + bounds.height;
  return {
    nw: { x: bounds.x, y: bounds.y },
    n: { x: cx, y: bounds.y },
    ne: { x: r, y: bounds.y },
    e: { x: r, y: cy },
    se: { x: r, y: b },
    s: { x: cx, y: b },
    sw: { x: bounds.x, y: b },
    w: { x: bounds.x, y: cy },
  };
}

export function applyResize(
  bounds: Bounds,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minWidth = 60,
  minHeight = 36,
): Bounds {
  let { x, y, width, height } = bounds;

  if (handle.includes('w')) {
    const maxDx = width - minWidth;
    const clampedDx = Math.min(dx, maxDx);
    x += clampedDx;
    width -= clampedDx;
  }
  if (handle.includes('e')) {
    width = Math.max(minWidth, width + dx);
  }
  if (handle.includes('n')) {
    const maxDy = height - minHeight;
    const clampedDy = Math.min(dy, maxDy);
    y += clampedDy;
    height -= clampedDy;
  }
  if (handle.includes('s')) {
    height = Math.max(minHeight, height + dy);
  }

  return { x, y, width, height };
}

export function getQuickConnectPorts(
  bounds: Bounds,
  offset = QUICK_PORT_OFFSET,
): Record<CardinalSide, Point> {
  return {
    top: { x: bounds.x + bounds.width / 2, y: bounds.y - offset },
    right: { x: bounds.x + bounds.width + offset, y: bounds.y + bounds.height / 2 },
    bottom: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height + offset },
    left: { x: bounds.x - offset, y: bounds.y + bounds.height / 2 },
  };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

export function boundsContain(outer: Bounds, inner: Bounds): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function computeSmartGuides(
  movingBounds: Bounds,
  otherElements: DiagramElement[],
  threshold = 6,
): { dx: number; dy: number; guides: SmartGuide[] } {
  const mLeft = movingBounds.x;
  const mCenterX = movingBounds.x + movingBounds.width / 2;
  const mRight = movingBounds.x + movingBounds.width;
  const mTop = movingBounds.y;
  const mCenterY = movingBounds.y + movingBounds.height / 2;
  const mBottom = movingBounds.y + movingBounds.height;

  let bestDx = 0;
  let bestDistX = threshold + 0.001;
  let matchedX: { pos: number; targetBounds: Bounds } | null = null;

  let bestDy = 0;
  let bestDistY = threshold + 0.001;
  let matchedY: { pos: number; targetBounds: Bounds } | null = null;

  for (const el of otherElements) {
    if (isConnectorElement(el)) continue;
    const tb = getElementBounds(el);
    const tXs = [tb.x, tb.x + tb.width / 2, tb.x + tb.width];
    const mXs = [mLeft, mCenterX, mRight];

    for (const mx of mXs) {
      for (const tx of tXs) {
        const diff = tx - mx;
        const abs = Math.abs(diff);
        if (abs < bestDistX) {
          bestDistX = abs;
          bestDx = diff;
          matchedX = { pos: tx, targetBounds: tb };
        }
      }
    }

    const tYs = [tb.y, tb.y + tb.height / 2, tb.y + tb.height];
    const mYs = [mTop, mCenterY, mBottom];

    for (const my of mYs) {
      for (const ty of tYs) {
        const diff = ty - my;
        const abs = Math.abs(diff);
        if (abs < bestDistY) {
          bestDistY = abs;
          bestDy = diff;
          matchedY = { pos: ty, targetBounds: tb };
        }
      }
    }
  }

  const guides: SmartGuide[] = [];
  if (matchedX) {
    const start = Math.min(mTop + bestDy, matchedX.targetBounds.y) - 16;
    const end =
      Math.max(mBottom + bestDy, matchedX.targetBounds.y + matchedX.targetBounds.height) + 16;
    guides.push({ axis: 'x', position: matchedX.pos, start, end });
  }
  if (matchedY) {
    const start = Math.min(mLeft + bestDx, matchedY.targetBounds.x) - 16;
    const end =
      Math.max(mRight + bestDx, matchedY.targetBounds.x + matchedY.targetBounds.width) + 16;
    guides.push({ axis: 'y', position: matchedY.pos, start, end });
  }

  return { dx: bestDx, dy: bestDy, guides };
}

export function buildElementsMap(elements: DiagramElement[]): Map<string, DiagramElement> {
  const map = new Map<string, DiagramElement>();
  for (const el of elements) {
    map.set(el.id, el);
  }
  return map;
}

export function pointInBounds(pt: Point, b: Bounds, pad = 0): boolean {
  return (
    pt.x >= b.x - pad &&
    pt.x <= b.x + b.width + pad &&
    pt.y >= b.y - pad &&
    pt.y <= b.y + b.height + pad
  );
}

export function isShapeResizable(el: ShapeElement | NoteElement): boolean {
  if (isNoteElement(el) && el.collapsed) return false;
  return true;
}
