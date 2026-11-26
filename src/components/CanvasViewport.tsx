import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DIMENSIONS,
  SLIDE_FRAME_BOUNDS,
  applyResize,
  buildElementsMap,
  computeSmartGuides,
  getClosestPortSide,
  getElementBounds,
  getPortPoint,
  snapValue,
  screenToWorld,
  worldToScreen,
} from '../engine/geometry';
import {
  HitTarget,
  findContainedNodeIds,
  findElementsInRect,
  hitTestCanvas,
  supportsQuickConnect,
} from '../engine/hitTest';
import { renderScene } from '../engine/renderer';
import { computeConnectorPath } from '../engine/routing';
import { PALETTES } from '../themes/palettes';
import {
  Bounds,
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  NoteElement,
  Point,
  ProjectDocument,
  ResizeHandle,
  ShapeElement,
  SmartGuide,
  ToolType,
  Viewport,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
  isShapeElement,
} from '../types/diagram';
import { ContextMenuState } from './ContextMenu';
import { SelectionFloatingBar } from './SelectionFloatingBar';

interface CanvasViewportProps {
  doc: ProjectDocument;
  tool: ToolType;
  selectedIds: string[];
  viewport: Viewport;
  canvasSize: { width: number; height: number };
  editingId: string | null;
  spacePressed: boolean;
  onResizeCanvas: (size: { width: number; height: number }) => void;
  onSetViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  onZoomAtPoint: (factor: number, screenPt: Point) => void;
  onSelectIds: (ids: string[]) => void;
  onSetTool: (tool: ToolType) => void;
  onSetEditingId: (id: string | null) => void;
  onCreateNode: (
    kind: Exclude<ToolType, 'select' | 'hand' | 'eraser' | 'connector'>,
    worldPos: Point,
    customSize?: { width: number; height: number },
    startEditing?: boolean,
  ) => DiagramElement;
  onAddConnector: (conn: Omit<ConnectorElement, 'id' | 'type' | 'zIndex'>) => ConnectorElement;
  onQuickConnectPort: (sourceId: string, side: CardinalSide) => void;
  onSetElementsPreview: (updater: (prev: DiagramElement[]) => DiagramElement[]) => void;
  onCommitSnapshotFromBefore: (before: DiagramElement[]) => void;
  onCommitElements: (updater: (prev: DiagramElement[]) => DiagramElement[]) => void;
  onDeleteIds: (ids: string[]) => void;
  onUpdateElement: (id: string, patch: Partial<DiagramElement>) => void;
  onSetSelectedColor: (color: DiagramElement['color']) => void;
  onAttachNote: () => void;
  onToggleCollapseNote: (id: string) => void;
  onDuplicateSelected: () => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  onImportJsonFile: (rawJson: string) => void;
}

type DragSession =
  | {
      kind: 'pan';
      startScreen: Point;
      startViewport: Viewport;
      isRightButton: boolean;
      moved: boolean;
      hitOnDown: HitTarget;
    }
  | {
      kind: 'move';
      startWorld: Point;
      beforeElements: DiagramElement[];
      movingIds: string[];
      initialPositions: Map<string, { x: number; y: number; startPt?: Point; endPt?: Point }>;
    }
  | {
      kind: 'resize';
      elementId: string;
      handle: ResizeHandle;
      startWorld: Point;
      initialBounds: Bounds;
      beforeElements: DiagramElement[];
    }
  | {
      kind: 'marquee';
      startWorld: Point;
      additive: boolean;
      initialSelected: string[];
    }
  | {
      kind: 'create-shape';
      shapeKind: Exclude<ToolType, 'select' | 'hand' | 'eraser' | 'connector'>;
      startWorld: Point;
      currentWorld: Point;
    }
  | {
      kind: 'connect';
      mode: 'new-tool' | 'quick-port' | 'rewire-start' | 'rewire-end';
      startWorld: Point;
      sourceId: string | null;
      sourceSide: CardinalSide | null;
      rewireConnId: string | null;
      beforeElements: DiagramElement[] | null;
      moved: boolean;
      currentWorld: Point;
    }
  | {
      kind: 'eraser';
      markedIds: Set<string>;
      trail: Point[];
    };

function getCursorForResize(handle: ResizeHandle): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
  }
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  doc,
  tool,
  selectedIds,
  viewport,
  canvasSize,
  editingId,
  spacePressed,
  onResizeCanvas,
  onSetViewport,
  onZoomAtPoint,
  onSelectIds,
  onSetTool,
  onSetEditingId,
  onCreateNode,
  onAddConnector,
  onQuickConnectPort,
  onSetElementsPreview,
  onCommitSnapshotFromBefore,
  onCommitElements,
  onDeleteIds,
  onUpdateElement,
  onSetSelectedColor,
  onAttachNote,
  onToggleCollapseNote,
  onDuplicateSelected,
  onOpenContextMenu,
  onImportJsonFile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const hasCenteredInitialRef = useRef(false);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredQuickPort, setHoveredQuickPort] = useState<{
    elementId: string;
    side: CardinalSide;
  } | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>('default');
  const [marqueeRect, setMarqueeRect] = useState<Bounds | null>(null);
  const [draftShape, setDraftShape] = useState<ShapeElement | NoteElement | null>(null);
  const [draftConnector, setDraftConnector] = useState<ConnectorElement | null>(null);
  const [snapTarget, setSnapTarget] = useState<{
    elementId: string;
    side: CardinalSide;
    point: Point;
  } | null>(null);
  const [smartGuides, setSmartGuides] = useState<SmartGuide[]>([]);
  const [eraserIds, setEraserIds] = useState<Set<string>>(new Set());
  const [eraserTrail, setEraserTrail] = useState<Point[]>([]);

  // Inline editor drafts
  const [editText, setEditText] = useState('');
  const [editSubText, setEditSubText] = useState('');
  const noteTitleInputRef = useRef<HTMLInputElement>(null);
  const shapeTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPopulatedEditIdRef = useRef<string | null>(null);

  // Measure container with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.round(entry.contentRect.width));
        const h = Math.max(200, Math.round(entry.contentRect.height));
        onResizeCanvas({ width: w, height: h });
        if (!hasCenteredInitialRef.current) {
          hasCenteredInitialRef.current = true;
          onSetViewport({
            x: Math.round((w - SLIDE_FRAME_BOUNDS.width) / 2),
            y: Math.round((h - SLIDE_FRAME_BOUNDS.height) / 2),
            zoom: 1,
          });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [onResizeCanvas, onSetViewport]);

  // Populate inline edit draft when editingId changes and defer focus until keystroke completes
  useEffect(() => {
    if (!editingId) {
      lastPopulatedEditIdRef.current = null;
      return;
    }
    if (lastPopulatedEditIdRef.current === editingId) return;
    const target = doc.elements.find((e) => e.id === editingId);
    if (!target) {
      onSetEditingId(null);
      return;
    }
    lastPopulatedEditIdRef.current = editingId;
    if (isNoteElement(target)) {
      setEditText(target.title);
      setEditSubText(target.body);
    } else if (isConnectorElement(target)) {
      setEditText(target.label ?? '');
      setEditSubText('');
    } else {
      setEditText(target.label);
      setEditSubText(target.sublabel ?? '');
    }
    const raf = window.requestAnimationFrame(() => {
      if (isNoteElement(target)) {
        noteTitleInputRef.current?.focus();
        noteTitleInputRef.current?.select();
      } else {
        shapeTextareaRef.current?.focus();
        shapeTextareaRef.current?.select();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [editingId, doc.elements, onSetEditingId]);

  const commitInlineEdit = useCallback(() => {
    if (!editingId) return;
    const target = doc.elements.find((e) => e.id === editingId);
    if (target) {
      if (isNoteElement(target)) {
        if (editText !== target.title || editSubText !== target.body) {
          onUpdateElement(target.id, {
            title: editText.trim() || 'Consultant Note',
            body: editSubText,
          });
        }
      } else if (isConnectorElement(target)) {
        if (editText !== (target.label ?? '')) {
          onUpdateElement(target.id, { label: editText.trim() });
        }
      } else {
        if (editText !== target.label) {
          onUpdateElement(target.id, { label: editText.trim() || target.label });
        }
      }
    }
    onSetEditingId(null);
  }, [doc.elements, editSubText, editText, editingId, onSetEditingId, onUpdateElement]);

  // Render scene on animation frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvasSize.width * dpr));
    canvas.height = Math.max(1, Math.round(canvasSize.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const raf = requestAnimationFrame(() => {
      renderScene(ctx, {
        width: canvasSize.width,
        height: canvasSize.height,
        dpr,
        viewport,
        elements: doc.elements,
        themeId: doc.themeId,
        settings: doc.settings,
        interactive: true,
        includeBackground: true,
        selectedIds,
        hoveredId,
        hoveredQuickPort,
        marqueeRect,
        draftShape,
        draftConnector,
        snapTarget,
        smartGuides,
        eraserIds,
        eraserTrail,
        editingId,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [
    canvasSize,
    doc,
    draftConnector,
    draftShape,
    editingId,
    eraserIds,
    eraserTrail,
    hoveredId,
    hoveredQuickPort,
    marqueeRect,
    selectedIds,
    smartGuides,
    snapTarget,
    viewport,
  ]);

  const getLocalPoint = (clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const findSnapTargetPort = useCallback(
    (worldPt: Point, excludeId: string | null) => {
      const maxDist = Math.max(24, 30 / viewport.zoom);
      let best: { elementId: string; side: CardinalSide; point: Point; dist: number } | null = null;

      for (const el of doc.elements) {
        if (el.id === excludeId || isConnectorElement(el) || el.type === 'zone') continue;
        if (isNoteElement(el) && !doc.settings.showNotes) continue;
        const b = getElementBounds(el);
        const side = getClosestPortSide(b, worldPt);
        const pt = getPortPoint(b, side);
        const dist = Math.hypot(pt.x - worldPt.x, pt.y - worldPt.y);
        const inside =
          worldPt.x >= b.x - 10 &&
          worldPt.x <= b.x + b.width + 10 &&
          worldPt.y >= b.y - 10 &&
          worldPt.y <= b.y + b.height + 10;

        if (dist <= maxDist || inside) {
          const score = inside ? dist * 0.5 : dist;
          if (!best || score < best.dist) {
            best = { elementId: el.id, side, point: pt, dist: score };
          }
        }
      }

      return best ? { elementId: best.elementId, side: best.side, point: best.point } : null;
    },
    [doc.elements, doc.settings.showNotes, viewport.zoom],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (editingId) {
      commitInlineEdit();
    }
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, viewport);
    const hit = hitTestCanvas(
      worldPt,
      doc.elements,
      selectedIds,
      hoveredId,
      viewport,
      doc.settings.showNotes,
    );

    e.currentTarget.setPointerCapture(e.pointerId);

    // Middle click, Right click, Space+Left, or Hand tool => Pan (short right-click opens context menu)
    if (
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && (spacePressed || tool === 'hand'))
    ) {
      dragRef.current = {
        kind: 'pan',
        startScreen: screenPt,
        startViewport: viewport,
        isRightButton: e.button === 2,
        moved: false,
        hitOnDown: hit,
      };
      setCursorStyle('grabbing');
      return;
    }

    if (e.button !== 0) return;

    // Eraser tool
    if (tool === 'eraser') {
      const marked = new Set<string>();
      if (hit?.kind === 'element') marked.add(hit.elementId);
      setEraserIds(marked);
      setEraserTrail([worldPt]);
      dragRef.current = { kind: 'eraser', markedIds: marked, trail: [worldPt] };
      return;
    }

    // Connector tool
    if (tool === 'connector') {
      const snap = findSnapTargetPort(worldPt, null);
      const startPt = snap ? snap.point : worldPt;
      dragRef.current = {
        kind: 'connect',
        mode: 'new-tool',
        startWorld: startPt,
        sourceId: snap?.elementId ?? null,
        sourceSide: snap?.side ?? null,
        rewireConnId: null,
        beforeElements: null,
        moved: false,
        currentWorld: startPt,
      };
      return;
    }

    // Shape/Note creation tool
    if (tool === 'hand') return;
    if (tool !== 'select') {
      dragRef.current = {
        kind: 'create-shape',
        shapeKind: tool,
        startWorld: worldPt,
        currentWorld: worldPt,
      };
      return;
    }

    // Select tool interactions
    if (hit?.kind === 'resize-handle') {
      const el = doc.elements.find((item) => item.id === hit.elementId);
      if (el && isBoundedElement(el)) {
        dragRef.current = {
          kind: 'resize',
          elementId: el.id,
          handle: hit.handle,
          startWorld: worldPt,
          initialBounds: getElementBounds(el),
          beforeElements: doc.elements,
        };
      }
      return;
    }

    if (hit?.kind === 'connector-handle') {
      const conn = doc.elements.find((item) => item.id === hit.elementId);
      if (conn && isConnectorElement(conn)) {
        dragRef.current = {
          kind: 'connect',
          mode: hit.endpoint === 'start' ? 'rewire-start' : 'rewire-end',
          startWorld: worldPt,
          sourceId: null,
          sourceSide: null,
          rewireConnId: conn.id,
          beforeElements: doc.elements,
          moved: false,
          currentWorld: worldPt,
        };
      }
      return;
    }

    if (hit?.kind === 'quick-port') {
      const source = doc.elements.find((item) => item.id === hit.elementId);
      if (source && isBoundedElement(source)) {
        const portPt = getPortPoint(getElementBounds(source), hit.side);
        dragRef.current = {
          kind: 'connect',
          mode: 'quick-port',
          startWorld: portPt,
          sourceId: source.id,
          sourceSide: hit.side,
          rewireConnId: null,
          beforeElements: null,
          moved: false,
          currentWorld: portPt,
        };
      }
      return;
    }

    if (hit?.kind === 'element') {
      let nextSelected = selectedIds;
      if (e.shiftKey) {
        nextSelected = selectedIds.includes(hit.elementId)
          ? selectedIds.filter((id) => id !== hit.elementId)
          : [...selectedIds, hit.elementId];
        onSelectIds(nextSelected);
      } else if (!selectedIds.includes(hit.elementId)) {
        nextSelected = [hit.elementId];
        onSelectIds(nextSelected);
      }

      // Compute moving IDs (if dragging a single zone without Alt, also move contained elements)
      const movingSet = new Set(nextSelected);
      for (const id of nextSelected) {
        const el = doc.elements.find((item) => item.id === id);
        if (el && isShapeElement(el) && el.type === 'zone' && !e.altKey) {
          for (const cid of findContainedNodeIds(el, doc.elements)) {
            movingSet.add(cid);
          }
        }
      }

      const initialPositions = new Map<
        string,
        { x: number; y: number; startPt?: Point; endPt?: Point }
      >();
      for (const el of doc.elements) {
        if (!movingSet.has(el.id)) continue;
        if (isConnectorElement(el)) {
          initialPositions.set(el.id, {
            x: 0,
            y: 0,
            startPt: { ...el.startPoint },
            endPt: { ...el.endPoint },
          });
        } else {
          initialPositions.set(el.id, { x: el.x, y: el.y });
        }
      }

      dragRef.current = {
        kind: 'move',
        startWorld: worldPt,
        beforeElements: doc.elements,
        movingIds: Array.from(movingSet),
        initialPositions,
      };
      return;
    }

    // Clicked empty space -> marquee selection
    if (!e.shiftKey) onSelectIds([]);
    dragRef.current = {
      kind: 'marquee',
      startWorld: worldPt,
      additive: e.shiftKey,
      initialSelected: selectedIds,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, viewport);
    const session = dragRef.current;

    if (!session) {
      // Hover detection & cursor updates
      if (spacePressed || tool === 'hand') {
        setCursorStyle('grab');
        setHoveredId(null);
        setHoveredQuickPort(null);
        return;
      }
      if (tool === 'eraser') {
        setCursorStyle('crosshair');
        const hit = hitTestCanvas(
          worldPt,
          doc.elements,
          [],
          null,
          viewport,
          doc.settings.showNotes,
        );
        setHoveredId(hit?.kind === 'element' ? hit.elementId : null);
        setHoveredQuickPort(null);
        return;
      }
      if (tool !== 'select') {
        setCursorStyle('crosshair');
        setHoveredQuickPort(null);
        if (tool === 'connector') {
          setSnapTarget(findSnapTargetPort(worldPt, null));
        } else {
          setSnapTarget(null);
        }
        return;
      }

      setSnapTarget(null);
      const hit = hitTestCanvas(
        worldPt,
        doc.elements,
        selectedIds,
        hoveredId,
        viewport,
        doc.settings.showNotes,
      );
      if (hit?.kind === 'resize-handle') {
        setCursorStyle(getCursorForResize(hit.handle));
        setHoveredQuickPort(null);
      } else if (hit?.kind === 'connector-handle') {
        setCursorStyle('grab');
        setHoveredQuickPort(null);
      } else if (hit?.kind === 'quick-port') {
        setCursorStyle('pointer');
        setHoveredQuickPort({ elementId: hit.elementId, side: hit.side });
      } else if (hit?.kind === 'element') {
        setCursorStyle('move');
        setHoveredId(hit.elementId);
        setHoveredQuickPort(null);
      } else {
        setCursorStyle('default');
        setHoveredId(null);
        setHoveredQuickPort(null);
      }
      return;
    }

    if (session.kind === 'pan') {
      const dx = screenPt.x - session.startScreen.x;
      const dy = screenPt.y - session.startScreen.y;
      if (Math.hypot(dx, dy) > 4) session.moved = true;
      onSetViewport({
        ...session.startViewport,
        x: session.startViewport.x + dx,
        y: session.startViewport.y + dy,
      });
      return;
    }

    if (session.kind === 'move') {
      let dx = worldPt.x - session.startWorld.x;
      let dy = worldPt.y - session.startWorld.y;

      const movingSet = new Set(session.movingIds);
      const boundedMoving = doc.elements.filter(
        (el) => movingSet.has(el.id) && isBoundedElement(el),
      );

      // Grid snap on primary dragged node
      if (doc.settings.snapToGrid && !e.ctrlKey && boundedMoving.length > 0) {
        const lead = boundedMoving[0];
        const init = session.initialPositions.get(lead.id);
        if (init) {
          dx = snapValue(init.x + dx, doc.settings.gridSize) - init.x;
          dy = snapValue(init.y + dy, doc.settings.gridSize) - init.y;
        }
      }

      // Smart alignment guides when dragging non-zone elements
      if (!e.ctrlKey && boundedMoving.length > 0 && boundedMoving.length <= 4) {
        const map = buildElementsMap(
          session.beforeElements.map((el) => {
            const init = session.initialPositions.get(el.id);
            if (!init || isConnectorElement(el)) return el;
            return { ...el, x: init.x + dx, y: init.y + dy };
          }),
        );
        const movingBounds = boundedMoving
          .map((el) => map.get(el.id))
          .filter((el): el is ShapeElement | NoteElement => !!el && isBoundedElement(el));

        if (movingBounds.length > 0) {
          const minX = Math.min(...movingBounds.map((m) => m.x));
          const minY = Math.min(...movingBounds.map((m) => m.y));
          const maxX = Math.max(...movingBounds.map((m) => m.x + getElementBounds(m).width));
          const maxY = Math.max(...movingBounds.map((m) => m.y + getElementBounds(m).height));
          const others = session.beforeElements.filter(
            (el) =>
              !movingSet.has(el.id) &&
              !(isNoteElement(el) && !doc.settings.showNotes) &&
              !isConnectorElement(el),
          );
          const smart = computeSmartGuides(
            { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
            others,
            6 / viewport.zoom,
          );
          dx += smart.dx;
          dy += smart.dy;
          setSmartGuides(smart.guides);
        }
      } else {
        setSmartGuides([]);
      }

      onSetElementsPreview((prev) =>
        prev.map((el) => {
          const init = session.initialPositions.get(el.id);
          if (!init) return el;
          if (isConnectorElement(el)) {
            return {
              ...el,
              startPoint: el.startBinding
                ? el.startPoint
                : { x: (init.startPt?.x ?? 0) + dx, y: (init.startPt?.y ?? 0) + dy },
              endPoint: el.endBinding
                ? el.endPoint
                : { x: (init.endPt?.x ?? 0) + dx, y: (init.endPt?.y ?? 0) + dy },
            };
          }
          return { ...el, x: Math.round(init.x + dx), y: Math.round(init.y + dy) };
        }),
      );
      return;
    }

    if (session.kind === 'resize') {
      let dx = worldPt.x - session.startWorld.x;
      let dy = worldPt.y - session.startWorld.y;
      if (doc.settings.snapToGrid && !e.ctrlKey) {
        dx = snapValue(dx, doc.settings.gridSize);
        dy = snapValue(dy, doc.settings.gridSize);
      }
      const nextB = applyResize(session.initialBounds, session.handle, dx, dy, 64, 34);
      onSetElementsPreview((prev) =>
        prev.map((el) =>
          el.id === session.elementId && isBoundedElement(el)
            ? { ...el, x: nextB.x, y: nextB.y, width: nextB.width, height: nextB.height }
            : el,
        ),
      );
      return;
    }

    if (session.kind === 'marquee') {
      const rect: Bounds = {
        x: Math.min(session.startWorld.x, worldPt.x),
        y: Math.min(session.startWorld.y, worldPt.y),
        width: Math.abs(worldPt.x - session.startWorld.x),
        height: Math.abs(worldPt.y - session.startWorld.y),
      };
      setMarqueeRect(rect);
      const hits = findElementsInRect(rect, doc.elements, doc.settings.showNotes);
      if (session.additive) {
        const merged = Array.from(new Set([...session.initialSelected, ...hits]));
        onSelectIds(merged);
      } else {
        onSelectIds(hits);
      }
      return;
    }

    if (session.kind === 'create-shape') {
      session.currentWorld = worldPt;
      const x = Math.min(session.startWorld.x, worldPt.x);
      const y = Math.min(session.startWorld.y, worldPt.y);
      const w = Math.abs(worldPt.x - session.startWorld.x);
      const h = Math.abs(worldPt.y - session.startWorld.y);
      if (w > 10 || h > 10) {
        const dims = DEFAULT_DIMENSIONS[session.shapeKind];
        const preview: ShapeElement | NoteElement =
          session.shapeKind === 'note'
            ? {
                id: '__draft__',
                type: 'note',
                x,
                y,
                width: Math.max(120, w),
                height: Math.max(70, h),
                title: 'Consultant Note',
                body: '',
                collapsed: false,
                color: 'note',
                borderStyle: 'solid',
                zIndex: 9999,
              }
            : {
                id: '__draft__',
                type: session.shapeKind,
                x,
                y,
                width: Math.max(80, w),
                height: Math.max(44, h),
                label: dims.label,
                sublabel: dims.sublabel,
                badge: dims.badge,
                color: session.shapeKind === 'database' ? 'data' : 'primary',
                borderStyle: session.shapeKind === 'zone' ? 'dashed' : 'solid',
                zIndex: 9999,
              };
        setDraftShape(preview);
      }
      return;
    }

    if (session.kind === 'connect') {
      if (Math.hypot(worldPt.x - session.startWorld.x, worldPt.y - session.startWorld.y) > 8) {
        session.moved = true;
      }
      session.currentWorld = worldPt;
      const excludeId =
        session.mode === 'quick-port' || session.mode === 'new-tool' ? session.sourceId : null;
      const snap = findSnapTargetPort(worldPt, excludeId);
      setSnapTarget(snap);

      if (session.mode === 'rewire-start' || session.mode === 'rewire-end') {
        onSetElementsPreview((prev) =>
          prev.map((el) => {
            if (el.id !== session.rewireConnId || !isConnectorElement(el)) return el;
            const binding = snap ? { elementId: snap.elementId, port: snap.side } : null;
            const pt = snap ? snap.point : worldPt;
            if (session.mode === 'rewire-start') {
              return { ...el, startPoint: pt, startBinding: binding };
            }
            return { ...el, endPoint: pt, endBinding: binding };
          }),
        );
      } else if (session.moved) {
        setDraftConnector({
          id: '__draft_conn__',
          type: 'connector',
          startPoint: session.startWorld,
          endPoint: snap ? snap.point : worldPt,
          startBinding: session.sourceId
            ? { elementId: session.sourceId, port: session.sourceSide ?? 'auto' }
            : null,
          endBinding: snap ? { elementId: snap.elementId, port: snap.side } : null,
          routeStyle: 'orthogonal',
          startArrow: 'none',
          endArrow: 'arrow',
          color: 'primary',
          borderStyle: 'solid',
          zIndex: 9999,
        });
      }
      return;
    }

    if (session.kind === 'eraser') {
      session.trail.push(worldPt);
      if (session.trail.length > 24) session.trail.shift();
      setEraserTrail([...session.trail]);
      const hit = hitTestCanvas(
        worldPt,
        doc.elements,
        [],
        null,
        viewport,
        doc.settings.showNotes,
      );
      if (hit?.kind === 'element' && !session.markedIds.has(hit.elementId)) {
        session.markedIds.add(hit.elementId);
        setEraserIds(new Set(session.markedIds));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    if (!session) return;

    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, viewport);

    if (session.kind === 'pan') {
      setCursorStyle(spacePressed || tool === 'hand' ? 'grab' : 'default');
      if (session.isRightButton && !session.moved) {
        const hitId = session.hitOnDown?.kind === 'element' ? session.hitOnDown.elementId : null;
        if (hitId && !selectedIds.includes(hitId)) {
          onSelectIds([hitId]);
        }
        onOpenContextMenu({
          screenPt: { x: e.clientX, y: e.clientY },
          worldPt,
          targetId: hitId,
        });
      }
      return;
    }

    if (session.kind === 'move') {
      setSmartGuides([]);
      const movedDist = Math.hypot(
        worldPt.x - session.startWorld.x,
        worldPt.y - session.startWorld.y,
      );
      if (movedDist > 1) {
        onCommitSnapshotFromBefore(session.beforeElements);
      }
      return;
    }

    if (session.kind === 'resize') {
      onCommitSnapshotFromBefore(session.beforeElements);
      return;
    }

    if (session.kind === 'marquee') {
      setMarqueeRect(null);
      return;
    }

    if (session.kind === 'create-shape') {
      setDraftShape(null);
      const dims = DEFAULT_DIMENSIONS[session.shapeKind];
      const w = Math.abs(worldPt.x - session.startWorld.x);
      const h = Math.abs(worldPt.y - session.startWorld.y);
      if (w > 18 || h > 18) {
        onCreateNode(
          session.shapeKind,
          {
            x: Math.min(session.startWorld.x, worldPt.x),
            y: Math.min(session.startWorld.y, worldPt.y),
          },
          { width: Math.max(80, Math.round(w)), height: Math.max(44, Math.round(h)) },
          true,
        );
      } else {
        onCreateNode(
          session.shapeKind,
          { x: worldPt.x - dims.width / 2, y: worldPt.y - dims.height / 2 },
          undefined,
          true,
        );
      }
      return;
    }

    if (session.kind === 'connect') {
      setDraftConnector(null);
      const snap = snapTarget;
      setSnapTarget(null);

      if (session.mode === 'rewire-start' || session.mode === 'rewire-end') {
        if (session.beforeElements && session.moved) {
          onCommitSnapshotFromBefore(session.beforeElements);
        }
        return;
      }

      if (session.mode === 'quick-port' && !session.moved && session.sourceId && session.sourceSide) {
        onQuickConnectPort(session.sourceId, session.sourceSide);
        return;
      }

      if (session.mode === 'quick-port' && session.moved && session.sourceId && !snap) {
        // Dragged from quick-connect '+' port into empty space -> spawn Service node & bind!
        const dims = DEFAULT_DIMENSIONS.service;
        const maxZ = doc.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
        const targetId = crypto.randomUUID();
        const connId = crypto.randomUUID();
        const gx = doc.settings.snapToGrid
          ? snapValue(worldPt.x - dims.width / 2, doc.settings.gridSize)
          : Math.round(worldPt.x - dims.width / 2);
        const gy = doc.settings.snapToGrid
          ? snapValue(worldPt.y - dims.height / 2, doc.settings.gridSize)
          : Math.round(worldPt.y - dims.height / 2);

        const newNode: ShapeElement = {
          id: targetId,
          type: 'service',
          x: gx,
          y: gy,
          width: dims.width,
          height: dims.height,
          label: dims.label,
          sublabel: dims.sublabel,
          badge: dims.badge,
          color: 'primary',
          borderStyle: 'solid',
          zIndex: maxZ + 1,
        };
        const newConn: ConnectorElement = {
          id: connId,
          type: 'connector',
          startPoint: session.startWorld,
          endPoint: { x: gx + dims.width / 2, y: gy + dims.height / 2 },
          startBinding: { elementId: session.sourceId, port: session.sourceSide ?? 'auto' },
          endBinding: { elementId: targetId, port: 'auto' },
          routeStyle: 'orthogonal',
          startArrow: 'none',
          endArrow: 'arrow',
          color: 'neutral',
          borderStyle: 'solid',
          zIndex: maxZ + 2,
        };
        onCommitElements((prev) => [...prev, newNode, newConn]);
        onSelectIds([targetId]);
        onSetEditingId(targetId);
        return;
      }

      if (session.moved) {
        onAddConnector({
          startPoint: session.startWorld,
          endPoint: snap ? snap.point : worldPt,
          startBinding: session.sourceId
            ? { elementId: session.sourceId, port: session.sourceSide ?? 'auto' }
            : null,
          endBinding: snap ? { elementId: snap.elementId, port: snap.side } : null,
          routeStyle: 'orthogonal',
          startArrow: 'none',
          endArrow: 'arrow',
          color: 'neutral',
          borderStyle: 'solid',
        });
      } else if (tool === 'connector') {
        onSetTool('select');
      }
      return;
    }

    if (session.kind === 'eraser') {
      const ids = Array.from(session.markedIds);
      setEraserIds(new Set());
      setEraserTrail([]);
      if (ids.length > 0) {
        onDeleteIds(ids);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const worldPt = screenToWorld(screenPt, viewport);
    const hit = hitTestCanvas(
      worldPt,
      doc.elements,
      selectedIds,
      hoveredId,
      viewport,
      doc.settings.showNotes,
    );

    if (hit?.kind === 'element') {
      onSelectIds([hit.elementId]);
      onSetEditingId(hit.elementId);
      return;
    }

    // Double-click empty space -> instant Service node + inline edit
    if (tool === 'select') {
      const dims = DEFAULT_DIMENSIONS.service;
      onCreateNode(
        'service',
        { x: worldPt.x - dims.width / 2, y: worldPt.y - dims.height / 2 },
        undefined,
        true,
      );
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const screenPt = getLocalPoint(e.clientX, e.clientY);
    const factor = Math.exp(-e.deltaY * 0.0014);
    onZoomAtPoint(factor, screenPt);
  };

  const handleDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.json') || file.type.includes('json')) {
      const text = await file.text();
      onImportJsonFile(text);
    }
  };

  // Compute screen coordinates for inline editor overlay
  const inlineEditorBox = useMemo(() => {
    if (!editingId) return null;
    const target = doc.elements.find((e) => e.id === editingId);
    if (!target) return null;
    const map = buildElementsMap(doc.elements);

    if (isConnectorElement(target)) {
      const path = computeConnectorPath(target, map);
      const sp = worldToScreen(path.labelPoint, viewport);
      return {
        kind: 'connector' as const,
        left: Math.max(8, sp.x - 95),
        top: Math.max(8, sp.y - 18),
        width: 190,
        height: 36,
      };
    }

    const b = getElementBounds(target, map);
    const tl = worldToScreen({ x: b.x, y: b.y }, viewport);
    const w = Math.max(150, b.width * viewport.zoom);
    const h = Math.max(44, b.height * viewport.zoom);

    if (isNoteElement(target)) {
      return {
        kind: 'note' as const,
        left: Math.max(8, Math.min(canvasSize.width - Math.max(220, w) - 8, tl.x)),
        top: Math.max(8, Math.min(canvasSize.height - Math.max(130, h) - 8, tl.y)),
        width: Math.max(220, w),
        height: Math.max(130, h),
      };
    }

    return {
      kind: 'shape' as const,
      left: Math.max(8, Math.min(canvasSize.width - w - 8, tl.x)),
      top: Math.max(8, Math.min(canvasSize.height - h - 8, tl.y)),
      width: w,
      height: h,
      isZone: target.type === 'zone',
    };
  }, [canvasSize.height, canvasSize.width, doc.elements, editingId, viewport]);

  const palette = PALETTES[doc.themeId];
  const canQuickConnectCount = doc.elements.some((el) => supportsQuickConnect(el));

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropFile}
      className="relative flex-1 h-full overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full h-full block touch-none"
      />

      {/* Quick subtle empty canvas prompt */}
      {doc.elements.length === 0 && (
        <div
          className={`pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full border text-[11.5px] font-medium shadow-sm backdrop-blur-md ${
            palette.isDark
              ? 'bg-slate-900/75 border-slate-700/80 text-slate-300'
              : 'bg-white/80 border-slate-200/90 text-slate-600'
          }`}
        >
          Double-click anywhere to drop a <span className="font-semibold">Service</span> · Press{' '}
          <kbd className="font-mono px-1 rounded bg-slate-500/15">Shift+S/D/Q/N</kbd> for
          keyboard-only · <kbd className="font-mono px-1 rounded bg-slate-500/15">Ctrl+O</kbd> for
          saved projects & templates
        </div>
      )}

      {/* Subtle quick-flow hint when 1 node selected & user just started */}
      {selectedIds.length === 1 && canQuickConnectCount && doc.elements.length <= 2 && !editingId && (
        <div
          className={`pointer-events-none absolute bottom-3 left-3 px-2.5 py-1 rounded-lg border text-[11px] backdrop-blur-md ${
            palette.isDark
              ? 'bg-slate-900/75 border-slate-700 text-slate-300'
              : 'bg-white/85 border-slate-200 text-slate-600'
          }`}
        >
          Tip: Click a <span className="text-sky-500 font-bold">+</span> port or press{' '}
          <kbd className="font-mono px-1 rounded bg-slate-500/15">Ctrl+→/↓</kbd> to spawn & connect
          next node · <kbd className="font-mono px-1 rounded bg-slate-500/15">M</kbd> attaches a
          hideable note
        </div>
      )}

      {/* Floating selection bar */}
      <SelectionFloatingBar
        elements={doc.elements}
        selectedIds={selectedIds}
        viewport={viewport}
        canvasSize={canvasSize}
        themeId={doc.themeId}
        editingId={editingId}
        onSetColor={onSetSelectedColor}
        onAttachNote={onAttachNote}
        onToggleCollapseNote={onToggleCollapseNote}
        onDuplicate={onDuplicateSelected}
        onDelete={() => onDeleteIds(selectedIds)}
      />

      {/* Inline canvas text editor overlay */}
      {inlineEditorBox && inlineEditorBox.kind === 'note' && (
        <div
          style={{
            left: inlineEditorBox.left,
            top: inlineEditorBox.top,
            width: inlineEditorBox.width,
            minHeight: inlineEditorBox.height,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopPropagation();
          }}
          className={`absolute z-30 rounded-xl border-2 border-amber-500 shadow-2xl p-2 flex flex-col gap-1.5 ${
            palette.isDark ? 'bg-amber-950 text-amber-100' : 'bg-amber-50 text-amber-950'
          }`}
        >
          <input
            ref={noteTitleInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                commitInlineEdit();
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitInlineEdit();
              }
            }}
            placeholder="Note title…"
            className="w-full bg-transparent text-xs font-bold outline-none border-b border-amber-500/30 pb-1"
          />
          <textarea
            rows={3}
            value={editSubText}
            onChange={(e) => setEditSubText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopPropagation();
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                commitInlineEdit();
              }
            }}
            placeholder="Consultant details…"
            className="w-full flex-1 bg-transparent text-xs outline-none resize-none leading-snug"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={commitInlineEdit}
              className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-semibold cursor-pointer"
            >
              Done (Esc)
            </button>
          </div>
        </div>
      )}

      {inlineEditorBox && inlineEditorBox.kind !== 'note' && (
        <textarea
          ref={shapeTextareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitInlineEdit}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              commitInlineEdit();
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitInlineEdit();
            }
          }}
          style={{
            left: inlineEditorBox.left,
            top: inlineEditorBox.top,
            width: inlineEditorBox.width,
            height:
              inlineEditorBox.kind === 'shape' && inlineEditorBox.isZone
                ? 34
                : inlineEditorBox.height,
          }}
          className={`absolute z-30 rounded-lg border-2 border-sky-500 shadow-xl px-2 py-1.5 text-xs font-semibold outline-none resize-none ${
            inlineEditorBox.kind === 'connector' ||
            (inlineEditorBox.kind === 'shape' && !inlineEditorBox.isZone)
              ? 'text-center'
              : 'text-left'
          } ${
            palette.isDark
              ? 'bg-slate-900 text-slate-100'
              : 'bg-white text-slate-900'
          }`}
        />
      )}
    </div>
  );
};
