import {
  Bounds,
  CardinalSide,
  DiagramElement,
  Point,
  ResizeHandle,
  ShapeElement,
  ShapeKind,
  Viewport,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
} from '../types/diagram';
import {
  boundsContain,
  boundsIntersect,
  buildElementsMap,
  getElementBounds,
  getQuickConnectPorts,
  getResizeHandles,
  isShapeResizable,
  pointInBounds,
} from './geometry';
import { computeConnectorPath, distanceToPolyline } from './routing';

export type HitTarget =
  | { kind: 'resize-handle'; elementId: string; handle: ResizeHandle }
  | { kind: 'connector-handle'; elementId: string; endpoint: 'start' | 'end' }
  | { kind: 'quick-port'; elementId: string; side: CardinalSide }
  | { kind: 'element'; elementId: string }
  | null;

const QUICK_CONNECT_KINDS: ReadonlySet<ShapeKind> = new Set([
  'service',
  'database',
  'queue',
  'cloud',
  'actor',
  'decision',
]);

export function supportsQuickConnect(el: DiagramElement): el is ShapeElement {
  return !isConnectorElement(el) && !isNoteElement(el) && QUICK_CONNECT_KINDS.has(el.type);
}

export function isPointInElement(
  worldPt: Point,
  el: DiagramElement,
  elementsMap: Map<string, DiagramElement>,
  zoom: number,
  showNotes: boolean,
): boolean {
  if (isNoteElement(el) && !showNotes) return false;

  if (isConnectorElement(el)) {
    const path = computeConnectorPath(el, elementsMap);
    const threshold = Math.max(8, 10 / zoom);
    return distanceToPolyline(worldPt, path.points) <= threshold;
  }

  const b = getElementBounds(el, elementsMap);

  if (el.type === 'zone') {
    const pad = Math.max(6, 10 / zoom);
    if (!pointInBounds(worldPt, b, pad)) return false;
    // Zone is clickable on its top header bar (34px) or 14px perimeter border
    const headerHeight = Math.min(34, b.height);
    const borderThick = 14;
    const inHeader =
      worldPt.y >= b.y - pad &&
      worldPt.y <= b.y + headerHeight &&
      worldPt.x >= b.x - pad &&
      worldPt.x <= b.x + b.width + pad;
    if (inHeader) return true;

    const innerBody: Bounds = {
      x: b.x + borderThick,
      y: b.y + headerHeight,
      width: Math.max(0, b.width - borderThick * 2),
      height: Math.max(0, b.height - headerHeight - borderThick),
    };
    if (innerBody.width > 0 && innerBody.height > 0 && pointInBounds(worldPt, innerBody, 0)) {
      return false;
    }
    return true;
  }

  if (el.type === 'decision') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = b.width / 2 + 4 / zoom;
    const ry = b.height / 2 + 4 / zoom;
    const norm = Math.abs(worldPt.x - cx) / rx + Math.abs(worldPt.y - cy) / ry;
    return norm <= 1.05;
  }

  return pointInBounds(worldPt, b, 3 / zoom);
}

export function hitTestCanvas(
  worldPt: Point,
  elements: DiagramElement[],
  selectedIds: string[],
  hoveredId: string | null,
  viewport: Viewport,
  showNotes: boolean,
): HitTarget {
  const elementsMap = buildElementsMap(elements);
  const handleRadius = Math.max(8, 10 / viewport.zoom);

  // 1. Active selection resize handles or connector endpoints (when single element selected)
  if (selectedIds.length === 1) {
    const selected = elementsMap.get(selectedIds[0]);
    if (selected && !(isNoteElement(selected) && !showNotes)) {
      if (isConnectorElement(selected)) {
        const path = computeConnectorPath(selected, elementsMap);
        const startPt = path.points[0];
        const endPt = path.points[path.points.length - 1];
        if (Math.hypot(worldPt.x - endPt.x, worldPt.y - endPt.y) <= handleRadius) {
          return { kind: 'connector-handle', elementId: selected.id, endpoint: 'end' };
        }
        if (Math.hypot(worldPt.x - startPt.x, worldPt.y - startPt.y) <= handleRadius) {
          return { kind: 'connector-handle', elementId: selected.id, endpoint: 'start' };
        }
      } else if (isShapeResizable(selected)) {
        const b = getElementBounds(selected, elementsMap);
        const handles = getResizeHandles(b);
        const order: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        for (const h of order) {
          const hp = handles[h];
          if (Math.hypot(worldPt.x - hp.x, worldPt.y - hp.y) <= handleRadius) {
            return { kind: 'resize-handle', elementId: selected.id, handle: h };
          }
        }
      }
    }
  }

  // 2. Quick-connect '+' port circles on hovered or single-selected shape node
  const portCandidateIds: string[] = [];
  if (selectedIds.length === 1) portCandidateIds.push(selectedIds[0]);
  if (hoveredId && !portCandidateIds.includes(hoveredId)) portCandidateIds.push(hoveredId);

  for (const cid of portCandidateIds) {
    const el = elementsMap.get(cid);
    if (!el || !supportsQuickConnect(el)) continue;
    const ports = getQuickConnectPorts(getElementBounds(el, elementsMap));
    const sides: CardinalSide[] = ['top', 'right', 'bottom', 'left'];
    for (const side of sides) {
      const p = ports[side];
      if (Math.hypot(worldPt.x - p.x, worldPt.y - p.y) <= Math.max(10, 12 / viewport.zoom)) {
        return { kind: 'quick-port', elementId: el.id, side };
      }
    }
  }

  // Sort by zIndex descending for front-to-back hit testing
  const sortedDesc = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  // 3. Visible notes (frontmost priority)
  if (showNotes) {
    for (const el of sortedDesc) {
      if (!isNoteElement(el)) continue;
      if (isPointInElement(worldPt, el, elementsMap, viewport.zoom, showNotes)) {
        return { kind: 'element', elementId: el.id };
      }
    }
  }

  // 4. Non-zone shapes & text
  for (const el of sortedDesc) {
    if (isConnectorElement(el) || isNoteElement(el) || el.type === 'zone') continue;
    if (isPointInElement(worldPt, el, elementsMap, viewport.zoom, showNotes)) {
      return { kind: 'element', elementId: el.id };
    }
  }

  // 5. Connectors
  for (const el of sortedDesc) {
    if (!isConnectorElement(el)) continue;
    if (isPointInElement(worldPt, el, elementsMap, viewport.zoom, showNotes)) {
      return { kind: 'element', elementId: el.id };
    }
  }

  // 6. Zones (header or border only)
  for (const el of sortedDesc) {
    if (el.type !== 'zone') continue;
    if (isPointInElement(worldPt, el, elementsMap, viewport.zoom, showNotes)) {
      return { kind: 'element', elementId: el.id };
    }
  }

  return null;
}

export function findElementsInRect(
  rect: Bounds,
  elements: DiagramElement[],
  showNotes: boolean,
): string[] {
  const elementsMap = buildElementsMap(elements);
  const hits: string[] = [];

  for (const el of elements) {
    if (isNoteElement(el) && !showNotes) continue;

    const b = getElementBounds(el, elementsMap);
    if (!boundsIntersect(rect, b)) continue;

    if (el.type === 'zone') {
      const inner: Bounds = {
        x: b.x + 14,
        y: b.y + 34,
        width: Math.max(0, b.width - 28),
        height: Math.max(0, b.height - 48),
      };
      // Do not select a zone when dragging a marquee completely inside its open interior
      if (inner.width > 0 && inner.height > 0 && boundsContain(inner, rect)) {
        continue;
      }
    }

    if (isConnectorElement(el)) {
      const path = computeConnectorPath(el, elementsMap);
      const anyPointInside = path.points.some((p) => pointInBounds(p, rect, 0));
      if (!anyPointInside && !boundsIntersect(rect, b)) continue;
    }

    hits.push(el.id);
  }

  return hits;
}

export function findContainedNodeIds(
  zone: ShapeElement,
  elements: DiagramElement[],
): string[] {
  const zb = getElementBounds(zone);
  const ids: string[] = [];
  for (const el of elements) {
    if (el.id === zone.id || !isBoundedElement(el)) continue;
    if (el.type === 'zone' && el.width * el.height >= zone.width * zone.height) continue;
    const eb = getElementBounds(el);
    const center: Point = { x: eb.x + eb.width / 2, y: eb.y + eb.height / 2 };
    if (pointInBounds(center, zb, 0)) {
      ids.push(el.id);
    }
  }
  return ids;
}
