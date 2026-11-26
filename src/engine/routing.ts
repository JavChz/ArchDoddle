import {
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  Point,
} from '../types/diagram';
import { getPortNormal, resolveConnectorEndpoints } from './geometry';

export interface ConnectorPathResult {
  points: Point[];
  controlPoints?: [Point, Point];
  labelPoint: Point;
  startAngle: number;
  endAngle: number;
  startSide: CardinalSide | null;
  endSide: CardinalSide | null;
}

const STUB = 24;

function isHorizontal(side: CardinalSide | null): boolean {
  return side === 'left' || side === 'right';
}

function isVertical(side: CardinalSide | null): boolean {
  return side === 'top' || side === 'bottom';
}

function dedupeCollinear(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const curr = pts[i];
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) < 0.5) continue;
    if (out.length >= 2) {
      const p2 = out[out.length - 2];
      const sameX = Math.abs(p2.x - prev.x) < 0.5 && Math.abs(prev.x - curr.x) < 0.5;
      const sameY = Math.abs(p2.y - prev.y) < 0.5 && Math.abs(prev.y - curr.y) < 0.5;
      if (sameX || sameY) {
        out[out.length - 1] = curr;
        continue;
      }
    }
    out.push(curr);
  }
  return out;
}

function computeOrthogonalPoints(
  start: Point,
  end: Point,
  startSide: CardinalSide | null,
  endSide: CardinalSide | null,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    return [start, end];
  }

  const sSide: CardinalSide =
    startSide ?? (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top');
  const eSide: CardinalSide =
    endSide ?? (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom');

  const sNorm = getPortNormal(sSide);
  const eNorm = getPortNormal(eSide);

  const sStub: Point = { x: start.x + sNorm.x * STUB, y: start.y + sNorm.y * STUB };
  const eStub: Point = { x: end.x + eNorm.x * STUB, y: end.y + eNorm.y * STUB };

  // Opposite horizontal ports (e.g. right -> left)
  if (isHorizontal(sSide) && isHorizontal(eSide)) {
    const movingForward = (sNorm.x > 0 && dx > 12) || (sNorm.x < 0 && dx < -12);
    if (sSide !== eSide && movingForward) {
      const midX = (start.x + end.x) / 2;
      return dedupeCollinear([start, { x: midX, y: start.y }, { x: midX, y: end.y }, end]);
    }
    // Same side or backwards routing: route around vertically
    const detourY =
      Math.abs(dy) > 40 ? (sStub.y + eStub.y) / 2 : start.y + (dy >= 0 ? -56 : 56);
    return dedupeCollinear([
      start,
      sStub,
      { x: sStub.x, y: detourY },
      { x: eStub.x, y: detourY },
      eStub,
      end,
    ]);
  }

  // Opposite vertical ports (e.g. bottom -> top)
  if (isVertical(sSide) && isVertical(eSide)) {
    const movingForward = (sNorm.y > 0 && dy > 12) || (sNorm.y < 0 && dy < -12);
    if (sSide !== eSide && movingForward) {
      const midY = (start.y + end.y) / 2;
      return dedupeCollinear([start, { x: start.x, y: midY }, { x: end.x, y: midY }, end]);
    }
    const detourX =
      Math.abs(dx) > 40 ? (sStub.x + eStub.x) / 2 : start.x + (dx >= 0 ? -56 : 56);
    return dedupeCollinear([
      start,
      sStub,
      { x: detourX, y: sStub.y },
      { x: detourX, y: eStub.y },
      eStub,
      end,
    ]);
  }

  // Perpendicular ports (e.g. right -> top, bottom -> left)
  if (isHorizontal(sSide) && isVertical(eSide)) {
    const sOut = sNorm.x * (end.x - start.x) > 8;
    const eInto = eNorm.y * (start.y - end.y) > 8;
    if (sOut && eInto) {
      return dedupeCollinear([start, { x: end.x, y: start.y }, end]);
    }
    return dedupeCollinear([
      start,
      sStub,
      { x: sStub.x, y: eStub.y },
      eStub,
      end,
    ]);
  }

  if (isVertical(sSide) && isHorizontal(eSide)) {
    const sOut = sNorm.y * (end.y - start.y) > 8;
    const eInto = eNorm.x * (start.x - end.x) > 8;
    if (sOut && eInto) {
      return dedupeCollinear([start, { x: start.x, y: end.y }, end]);
    }
    return dedupeCollinear([
      start,
      sStub,
      { x: eStub.x, y: sStub.y },
      eStub,
      end,
    ]);
  }

  return dedupeCollinear([start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]);
}

function polylineMidpoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lengths.push(len);
    total += len;
  }
  if (total === 0) return pts[0];
  let target = total / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : target / lengths[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    target -= lengths[i];
  }
  return pts[pts.length - 1];
}

function sampleBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps = 20): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

export function computeConnectorPath(
  conn: ConnectorElement,
  elementsMap?: Map<string, DiagramElement>,
): ConnectorPathResult {
  const { start, end, startSide, endSide } = resolveConnectorEndpoints(conn, elementsMap);

  if (conn.routeStyle === 'straight') {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    return {
      points: [start, end],
      labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      startAngle: angle + Math.PI,
      endAngle: angle,
      startSide,
      endSide,
    };
  }

  if (conn.routeStyle === 'curved') {
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const handleLen = Math.max(40, Math.min(140, dist * 0.45));
    const sDir = startSide
      ? getPortNormal(startSide)
      : {
          x: Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? Math.sign(end.x - start.x) || 1 : 0,
          y: Math.abs(end.x - start.x) < Math.abs(end.y - start.y) ? Math.sign(end.y - start.y) || 1 : 0,
        };
    const eDir = endSide
      ? getPortNormal(endSide)
      : { x: -sDir.x, y: -sDir.y };

    const cp1: Point = { x: start.x + sDir.x * handleLen, y: start.y + sDir.y * handleLen };
    const cp2: Point = { x: end.x + eDir.x * handleLen, y: end.y + eDir.y * handleLen };
    const sampled = sampleBezier(start, cp1, cp2, end, 24);
    const mid = sampled[Math.floor(sampled.length / 2)];
    const startAngle = Math.atan2(start.y - cp1.y, start.x - cp1.x);
    const endAngle = Math.atan2(end.y - cp2.y, end.x - cp2.x);

    return {
      points: sampled,
      controlPoints: [cp1, cp2],
      labelPoint: mid,
      startAngle,
      endAngle,
      startSide,
      endSide,
    };
  }

  // Default: orthogonal Manhattan routing
  const pts = computeOrthogonalPoints(start, end, startSide, endSide);
  const p0 = pts[0];
  const p1 = pts[1] ?? pts[0];
  const pn = pts[pts.length - 1];
  const pnPrev = pts[pts.length - 2] ?? pn;

  return {
    points: pts,
    labelPoint: polylineMidpoint(pts),
    startAngle: Math.atan2(p0.y - p1.y, p0.x - p1.x),
    endAngle: Math.atan2(pn.y - pnPrev.y, pn.x - pnPrev.x),
    startSide,
    endSide,
  };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export function distanceToPolyline(pt: Point, points: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegment(pt, points[i], points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}
