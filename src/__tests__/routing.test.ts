import { describe, expect, it } from 'vitest';
import { buildElementsMap } from '../engine/geometry';
import { computeConnectorPath } from '../engine/routing';
import { ConnectorElement, ShapeElement } from '../types/diagram';

function makeBox(id: string, x: number, y: number): ShapeElement {
  return {
    id,
    type: 'service',
    x,
    y,
    width: 160,
    height: 80,
    label: id,
    color: 'primary',
    borderStyle: 'solid',
    zIndex: 1,
  };
}

describe('connector routing', () => {
  it('routes orthogonal elbow paths between auto-resolved ports', () => {
    const a = makeBox('a', 100, 100);
    const b = makeBox('b', 420, 240);
    const conn: ConnectorElement = {
      id: 'c1',
      type: 'connector',
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
      startBinding: { elementId: 'a', port: 'auto' },
      endBinding: { elementId: 'b', port: 'auto' },
      routeStyle: 'orthogonal',
      startArrow: 'none',
      endArrow: 'arrow',
      color: 'neutral',
      borderStyle: 'solid',
      zIndex: 2,
    };

    const res = computeConnectorPath(conn, buildElementsMap([a, b, conn]));
    expect(res.startSide).toBe('right');
    expect(res.endSide).toBe('left');
    // Right edge of a (100+160=260, 140) -> Left edge of b (420, 280)
    expect(res.points[0]).toEqual({ x: 260, y: 140 });
    expect(res.points[res.points.length - 1]).toEqual({ x: 420, y: 280 });
    expect(res.points.length).toBeGreaterThanOrEqual(3);
  });

  it('re-routes dynamically when a bound shape moves', () => {
    const a = makeBox('a', 100, 100);
    const b = makeBox('b', 400, 100);
    const conn: ConnectorElement = {
      id: 'c1',
      type: 'connector',
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
      startBinding: { elementId: 'a', port: 'auto' },
      endBinding: { elementId: 'b', port: 'auto' },
      routeStyle: 'straight',
      startArrow: 'none',
      endArrow: 'arrow',
      color: 'primary',
      borderStyle: 'solid',
      zIndex: 2,
    };

    const first = computeConnectorPath(conn, buildElementsMap([a, b, conn]));
    expect(first.points[0]).toEqual({ x: 260, y: 140 });
    expect(first.points[1]).toEqual({ x: 400, y: 140 });

    // Move b below a
    const bMoved = makeBox('b', 100, 340);
    const second = computeConnectorPath(conn, buildElementsMap([a, bMoved, conn]));
    expect(second.startSide).toBe('bottom');
    expect(second.endSide).toBe('top');
    expect(second.points[0]).toEqual({ x: 180, y: 180 });
    expect(second.points[1]).toEqual({ x: 180, y: 340 });
  });

  it('computes cubic bezier control points for curved connectors', () => {
    const a = makeBox('a', 0, 0);
    const b = makeBox('b', 300, 120);
    const conn: ConnectorElement = {
      id: 'c-curved',
      type: 'connector',
      startPoint: { x: 0, y: 0 },
      endPoint: { x: 0, y: 0 },
      startBinding: { elementId: 'a', port: 'right' },
      endBinding: { elementId: 'b', port: 'left' },
      routeStyle: 'curved',
      startArrow: 'none',
      endArrow: 'arrow',
      color: 'compute',
      borderStyle: 'solid',
      zIndex: 2,
    };

    const res = computeConnectorPath(conn, buildElementsMap([a, b, conn]));
    expect(res.controlPoints).toBeDefined();
    expect(res.points.length).toBeGreaterThan(10);
    expect(res.points[0]).toEqual({ x: 160, y: 40 });
    expect(res.points[res.points.length - 1]).toEqual({ x: 300, y: 160 });
  });
});
