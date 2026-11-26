import { describe, expect, it } from 'vitest';
import {
  computeSmartGuides,
  screenToWorld,
  snapValue,
  worldToScreen,
} from '../engine/geometry';
import { findElementsInRect, hitTestCanvas } from '../engine/hitTest';
import { NoteElement, ShapeElement, Viewport } from '../types/diagram';

function makeShape(partial: Partial<ShapeElement> & { id: string }): ShapeElement {
  return {
    type: 'service',
    x: 100,
    y: 100,
    width: 160,
    height: 80,
    label: 'Service',
    color: 'primary',
    borderStyle: 'solid',
    zIndex: 1,
    ...partial,
  };
}

function makeNote(partial: Partial<NoteElement> & { id: string }): NoteElement {
  return {
    type: 'note',
    x: 320,
    y: 100,
    width: 220,
    height: 110,
    title: 'Risk Note',
    body: 'Check SLA',
    collapsed: false,
    attachedToId: null,
    color: 'note',
    borderStyle: 'solid',
    zIndex: 5,
    ...partial,
  };
}

describe('geometry & hitTest', () => {
  it('round-trips screenToWorld and worldToScreen accurately', () => {
    const vp: Viewport = { x: 140, y: -60, zoom: 1.5 };
    const world = { x: 320, y: 180 };
    const screen = worldToScreen(world, vp);
    const back = screenToWorld(screen, vp);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it('snaps coordinates to grid increments', () => {
    expect(snapValue(29, 20)).toBe(20);
    expect(snapValue(31, 20)).toBe(40);
    expect(snapValue(-14, 20)).toBe(-20);
  });

  it('computes smart alignment guides when aligning centers or edges', () => {
    const stationary = makeShape({ id: 's1', x: 200, y: 100, width: 160, height: 80 });
    const moving = { x: 204, y: 300, width: 160, height: 80 };
    const res = computeSmartGuides(moving, [stationary], 6);
    expect(res.dx).toBe(-4);
    expect(res.guides.some((g) => g.axis === 'x' && g.position === 200)).toBe(true);
  });

  it('excludes hidden notes from hitTestCanvas and marquee selection', () => {
    const svc = makeShape({ id: 'svc', x: 50, y: 50, width: 140, height: 80 });
    const note = makeNote({ id: 'n1', x: 300, y: 100, width: 200, height: 100 });
    const vp: Viewport = { x: 0, y: 0, zoom: 1 };

    // Visible notes can be hit
    expect(hitTestCanvas({ x: 350, y: 140 }, [svc, note], [], null, vp, true)).toEqual({
      kind: 'element',
      elementId: 'n1',
    });

    // Hidden notes are skipped completely
    expect(hitTestCanvas({ x: 350, y: 140 }, [svc, note], [], null, vp, false)).toBeNull();

    // Marquee skips hidden notes
    const marqueeIds = findElementsInRect(
      { x: 0, y: 0, width: 600, height: 400 },
      [svc, note],
      false,
    );
    expect(marqueeIds).toEqual(['svc']);
  });

  it('hits zones on header/border only and returns null in open interior', () => {
    const zone = makeShape({
      id: 'z1',
      type: 'zone',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      label: 'VPC',
    });
    const vp: Viewport = { x: 0, y: 0, zoom: 1 };

    // Header hit
    expect(hitTestCanvas({ x: 180, y: 115 }, [zone], [], null, vp, true)).toEqual({
      kind: 'element',
      elementId: 'z1',
    });
    // Left border hit
    expect(hitTestCanvas({ x: 104, y: 240 }, [zone], [], null, vp, true)).toEqual({
      kind: 'element',
      elementId: 'z1',
    });
    // Open interior should NOT hit the zone so marquee selection inside zones works
    expect(hitTestCanvas({ x: 260, y: 240 }, [zone], [], null, vp, true)).toBeNull();
  });
});
