import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DIMENSIONS,
  buildElementsMap,
  getElementBounds,
  getSelectionBounds,
  snapValue,
} from '../engine/geometry';
import { alignElements, computeQuickFlowPlacement, distributeElements } from '../engine/layout';
import { buildDocumentFromTemplate } from '../templates/starters';
import {
  AlignKind,
  CardinalSide,
  ConnectorElement,
  DiagramElement,
  DistributeAxis,
  GridStyle,
  NodeKind,
  NoteElement,
  Point,
  ProjectDocument,
  ProjectMeta,
  SemanticColor,
  ShapeElement,
  ShapeKind,
  ThemeId,
  ToolType,
  Viewport,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
  isShapeElement,
} from '../types/diagram';
import {
  createBlankProject,
  deleteProject,
  duplicateProject,
  listProjects,
  loadProject,
  parseImportedProjects,
  savePrefs,
  saveProject,
} from './storage';

export interface ToastItem {
  id: string;
  message: string;
  kind: 'info' | 'success' | 'error';
}

export type SaveStatus = 'draft' | 'saving' | 'saved' | 'error';

const MAX_HISTORY = 100;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.0;

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

function defaultColorForKind(kind: NodeKind): SemanticColor {
  switch (kind) {
    case 'database':
      return 'data';
    case 'queue':
      return 'warning';
    case 'cloud':
      return 'external';
    case 'note':
      return 'note';
    case 'actor':
      return 'neutral';
    default:
      return 'primary';
  }
}

export function useDiagramStore() {
  // Always open a fresh blank project on startup (requirement)
  const [doc, setDoc] = useState<ProjectDocument>(() => createBlankProject());
  const [savedProjects, setSavedProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('draft');

  const [tool, setTool] = useState<ToolType>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 40, zoom: 1 });
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 760,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Undo / Redo stacks of element snapshots
  const undoStackRef = useRef<DiagramElement[][]>([]);
  const redoStackRef = useRef<DiagramElement[][]>([]);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  // Clipboard (in-memory)
  const clipboardRef = useRef<DiagramElement[]>([]);

  // Persistence refs
  const hasModifiedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  const pushToast = useCallback((message: string, kind: ToastItem['kind'] = 'info') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const syncHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
    });
  }, []);

  const persistDocumentNow = useCallback(
    (targetDoc: ProjectDocument): boolean => {
      const res = saveProject(targetDoc);
      if (res.ok) {
        setSavedProjects(listProjects());
        setSaveStatus('saved');
        return true;
      }
      setSaveStatus('error');
      pushToast(res.error, 'error');
      return false;
    },
    [pushToast],
  );

  const scheduleAutoSave = useCallback(
    (nextDoc: ProjectDocument) => {
      hasModifiedRef.current = true;
      setSaveStatus('saving');
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        persistDocumentNow(nextDoc);
      }, 420);
    },
    [persistDocumentNow],
  );

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      persistDocumentNow(docRef.current);
    }
  }, [persistDocumentNow]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Commit elements with undo snapshot
  const commitElements = useCallback(
    (updater: (prev: DiagramElement[]) => DiagramElement[]) => {
      setDoc((prev) => {
        const nextElements = updater(prev.elements);
        undoStackRef.current.push(structuredClone(prev.elements));
        if (undoStackRef.current.length > MAX_HISTORY) {
          undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        syncHistoryMeta();
        const nextDoc: ProjectDocument = {
          ...prev,
          elements: nextElements,
          updatedAt: new Date().toISOString(),
        };
        scheduleAutoSave(nextDoc);
        return nextDoc;
      });
    },
    [scheduleAutoSave, syncHistoryMeta],
  );

  // Live drag preview without creating intermediate undo entries
  const setElementsPreview = useCallback(
    (updater: (prev: DiagramElement[]) => DiagramElement[]) => {
      setDoc((prev) => ({
        ...prev,
        elements: updater(prev.elements),
      }));
    },
    [],
  );

  // Commit snapshot recorded before drag started
  const commitSnapshotFromBefore = useCallback(
    (beforeElements: DiagramElement[]) => {
      undoStackRef.current.push(structuredClone(beforeElements));
      if (undoStackRef.current.length > MAX_HISTORY) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      syncHistoryMeta();
      setDoc((prev) => {
        const nextDoc = { ...prev, updatedAt: new Date().toISOString() };
        scheduleAutoSave(nextDoc);
        return nextDoc;
      });
    },
    [scheduleAutoSave, syncHistoryMeta],
  );

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const previous = undoStackRef.current.pop()!;
    redoStackRef.current.push(structuredClone(docRef.current.elements));
    syncHistoryMeta();
    setEditingId(null);
    setDoc((prev) => {
      const nextDoc = { ...prev, elements: previous, updatedAt: new Date().toISOString() };
      scheduleAutoSave(nextDoc);
      return nextDoc;
    });
    setSelectedIds((ids) => ids.filter((id) => previous.some((el) => el.id === id)));
  }, [scheduleAutoSave, syncHistoryMeta]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    undoStackRef.current.push(structuredClone(docRef.current.elements));
    syncHistoryMeta();
    setEditingId(null);
    setDoc((prev) => {
      const nextDoc = { ...prev, elements: next, updatedAt: new Date().toISOString() };
      scheduleAutoSave(nextDoc);
      return nextDoc;
    });
    setSelectedIds((ids) => ids.filter((id) => next.some((el) => el.id === id)));
  }, [scheduleAutoSave, syncHistoryMeta]);

  // Delete elements cleanly (also cleans up bound connectors & note links in 1 atomic undo step)
  const deleteIds = useCallback(
    (idsToDelete: string[]) => {
      if (idsToDelete.length === 0) return;
      const deleteSet = new Set(idsToDelete);
      commitElements((prev) => {
        const filtered = prev.filter((el) => {
          if (deleteSet.has(el.id)) return false;
          if (isConnectorElement(el)) {
            if (el.startBinding && deleteSet.has(el.startBinding.elementId)) return false;
            if (el.endBinding && deleteSet.has(el.endBinding.elementId)) return false;
          }
          return true;
        });
        return filtered.map((el) => {
          if (isNoteElement(el) && el.attachedToId && deleteSet.has(el.attachedToId)) {
            return { ...el, attachedToId: null };
          }
          return el;
        });
      });
      setSelectedIds((prev) => prev.filter((id) => !deleteSet.has(id)));
      setEditingId((prev) => (prev && deleteSet.has(prev) ? null : prev));
    },
    [commitElements],
  );

  const deleteSelected = useCallback(() => {
    deleteIds(selectedIdsRef.current);
  }, [deleteIds]);

  const createNode = useCallback(
    (
      kind: NodeKind,
      worldPos: Point,
      customSize?: { width: number; height: number },
      startEditing = false,
    ): DiagramElement => {
      const dims = DEFAULT_DIMENSIONS[kind];
      const w = customSize?.width ?? dims.width;
      const h = customSize?.height ?? dims.height;
      const maxZ = docRef.current.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
      const id = crypto.randomUUID();
      const gridSize = docRef.current.settings.snapToGrid ? docRef.current.settings.gridSize : 1;
      const x = snapValue(worldPos.x, gridSize);
      const y = snapValue(worldPos.y, gridSize);

      let newEl: DiagramElement;
      if (kind === 'note') {
        const note: NoteElement = {
          id,
          type: 'note',
          x,
          y,
          width: w,
          height: h,
          title: 'Consultant Note',
          body: 'Double-click to add decision rationale, SLA, or risk.',
          collapsed: false,
          attachedToId: null,
          color: 'note',
          borderStyle: 'solid',
          zIndex: maxZ + 1,
        };
        newEl = note;
      } else {
        const shape: ShapeElement = {
          id,
          type: kind,
          x,
          y,
          width: w,
          height: h,
          label: dims.label,
          sublabel: dims.sublabel,
          badge: dims.badge,
          color: defaultColorForKind(kind),
          borderStyle: kind === 'cloud' || kind === 'zone' ? 'dashed' : 'solid',
          zIndex: kind === 'zone' ? 0 : maxZ + 1,
        };
        newEl = shape;
      }

      commitElements((prev) => [...prev, newEl]);

      // Ensure notes are visible if user explicitly creates a note
      if (kind === 'note' && !docRef.current.settings.showNotes) {
        setDoc((prev) => ({
          ...prev,
          settings: { ...prev.settings, showNotes: true },
        }));
      }

      setSelectedIds([id]);
      setTool('select');
      if (startEditing) {
        setEditingId(id);
      }
      return newEl;
    },
    [commitElements],
  );

  const addConnector = useCallback(
    (conn: Omit<ConnectorElement, 'id' | 'type' | 'zIndex'>) => {
      const maxZ = docRef.current.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
      const created: ConnectorElement = {
        ...conn,
        id: crypto.randomUUID(),
        type: 'connector',
        zIndex: maxZ + 1,
      };
      commitElements((prev) => [...prev, created]);
      setSelectedIds([created.id]);
      setTool('select');
      return created;
    },
    [commitElements],
  );

  const updateElements = useCallback(
    (ids: string[], patch: Partial<DiagramElement>) => {
      const idSet = new Set(ids);
      commitElements((prev) =>
        prev.map((el) => (idSet.has(el.id) ? ({ ...el, ...patch } as DiagramElement) : el)),
      );
    },
    [commitElements],
  );

  const convertSelectedShapeType = useCallback(
    (nextKind: ShapeKind) => {
      const selectedSet = new Set(selectedIdsRef.current);
      const targets = docRef.current.elements.filter(
        (el) => selectedSet.has(el.id) && isShapeElement(el) && el.type !== 'zone',
      );
      if (targets.length === 0) return;

      commitElements((prev) =>
        prev.map((el) => {
          if (!selectedSet.has(el.id) || !isShapeElement(el) || el.type === 'zone') return el;
          return {
            ...el,
            type: nextKind,
            badge: nextKind === 'service' ? (el.badge ?? 'SVC') : undefined,
          };
        }),
      );
    },
    [commitElements],
  );

  const quickFlowFromSelected = useCallback(
    (direction: CardinalSide, nextKind: ShapeKind = 'service') => {
      if (selectedIdsRef.current.length !== 1) return;
      const source = docRef.current.elements.find((el) => el.id === selectedIdsRef.current[0]);
      if (!source || !isShapeElement(source) || source.type === 'zone') return;

      const { node, connector } = computeQuickFlowPlacement(
        source,
        direction,
        docRef.current.elements,
        nextKind,
        docRef.current.settings.snapToGrid ? docRef.current.settings.gridSize : 1,
      );

      commitElements((prev) => [...prev, node, connector]);
      setSelectedIds([node.id]);
      setEditingId(node.id);
    },
    [commitElements],
  );

  const attachNoteToSelected = useCallback(() => {
    const firstSelected = docRef.current.elements.find((el) =>
      selectedIdsRef.current.includes(el.id),
    );
    const map = buildElementsMap(docRef.current.elements);
    let x: number;
    let y: number;
    let attachedToId: string | null = null;

    if (firstSelected && isBoundedElement(firstSelected)) {
      const b = getElementBounds(firstSelected, map);
      x = b.x + b.width + 34;
      y = b.y;
      attachedToId = firstSelected.id;
    } else {
      const vp = viewportRef.current;
      const cs = canvasSizeRef.current;
      x = Math.round((cs.width / 2 - vp.x) / vp.zoom - 115);
      y = Math.round((cs.height / 2 - vp.y) / vp.zoom - 55);
    }

    const maxZ = docRef.current.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);
    const note: NoteElement = {
      id: crypto.randomUUID(),
      type: 'note',
      x,
      y,
      width: 230,
      height: 112,
      title: attachedToId ? 'Component Note' : 'Consultant Note',
      body: 'Add rationale, assumption, or risk...',
      collapsed: false,
      attachedToId,
      color: 'note',
      borderStyle: 'solid',
      zIndex: maxZ + 1,
    };

    setDoc((prev) => {
      undoStackRef.current.push(structuredClone(prev.elements));
      if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
      redoStackRef.current = [];
      syncHistoryMeta();
      const nextDoc: ProjectDocument = {
        ...prev,
        settings: { ...prev.settings, showNotes: true },
        elements: [...prev.elements, note],
        updatedAt: new Date().toISOString(),
      };
      scheduleAutoSave(nextDoc);
      return nextDoc;
    });

    setSelectedIds([note.id]);
    setEditingId(note.id);
  }, [scheduleAutoSave, syncHistoryMeta]);

  const dropElementAtFocalPoint = useCallback(
    (kind: NodeKind) => {
      const vp = viewportRef.current;
      const cs = canvasSizeRef.current;
      const dims = DEFAULT_DIMENSIONS[kind];
      const sel = docRef.current.elements.filter((el) => selectedIdsRef.current.includes(el.id));

      let x = (cs.width / 2 - vp.x) / vp.zoom - dims.width / 2;
      let y = (cs.height / 2 - vp.y) / vp.zoom - dims.height / 2;

      if (sel.length === 1 && isBoundedElement(sel[0])) {
        const b = getElementBounds(sel[0]);
        x = b.x + b.width + 60;
        y = b.y;
      }

      createNode(kind, { x, y }, undefined, true);
    },
    [createNode],
  );

  const toggleNotesVisibility = useCallback(() => {
    setDoc((prev) => {
      const nextShow = !prev.settings.showNotes;
      const nextDoc: ProjectDocument = {
        ...prev,
        settings: { ...prev.settings, showNotes: nextShow },
        updatedAt: new Date().toISOString(),
      };
      if (hasModifiedRef.current) {
        scheduleAutoSave(nextDoc);
      }
      if (!nextShow) {
        setSelectedIds((ids) =>
          ids.filter((id) => {
            const found = prev.elements.find((el) => el.id === id);
            return found ? !isNoteElement(found) : false;
          }),
        );
        setEditingId((eid) => {
          const found = prev.elements.find((el) => el.id === eid);
          return found && isNoteElement(found) ? null : eid;
        });
      }
      pushToast(nextShow ? 'Consultant notes shown' : 'Consultant notes hidden', 'info');
      return nextDoc;
    });
  }, [pushToast, scheduleAutoSave]);

  const toggleNoteCollapsed = useCallback(
    (noteId: string) => {
      commitElements((prev) =>
        prev.map((el) =>
          el.id === noteId && isNoteElement(el) ? { ...el, collapsed: !el.collapsed } : el,
        ),
      );
    },
    [commitElements],
  );

  const toggleSlideFrame = useCallback(() => {
    setDoc((prev) => {
      const nextDoc: ProjectDocument = {
        ...prev,
        settings: { ...prev.settings, showSlideFrame: !prev.settings.showSlideFrame },
        updatedAt: new Date().toISOString(),
      };
      if (hasModifiedRef.current) scheduleAutoSave(nextDoc);
      return nextDoc;
    });
  }, [scheduleAutoSave]);

  const setTheme = useCallback(
    (themeId: ThemeId) => {
      savePrefs({ themeId });
      setDoc((prev) => {
        const nextDoc: ProjectDocument = {
          ...prev,
          themeId,
          updatedAt: new Date().toISOString(),
        };
        if (hasModifiedRef.current) scheduleAutoSave(nextDoc);
        return nextDoc;
      });
    },
    [scheduleAutoSave],
  );

  const setGridStyle = useCallback(
    (gridStyle: GridStyle) => {
      savePrefs({ gridStyle });
      setDoc((prev) => {
        const nextDoc: ProjectDocument = {
          ...prev,
          settings: { ...prev.settings, gridStyle },
          updatedAt: new Date().toISOString(),
        };
        if (hasModifiedRef.current) scheduleAutoSave(nextDoc);
        return nextDoc;
      });
    },
    [scheduleAutoSave],
  );

  const toggleSnap = useCallback(() => {
    setDoc((prev) => {
      const nextSnap = !prev.settings.snapToGrid;
      savePrefs({ snapToGrid: nextSnap });
      const nextDoc: ProjectDocument = {
        ...prev,
        settings: { ...prev.settings, snapToGrid: nextSnap },
        updatedAt: new Date().toISOString(),
      };
      if (hasModifiedRef.current) scheduleAutoSave(nextDoc);
      return nextDoc;
    });
  }, [scheduleAutoSave]);

  const alignSelected = useCallback(
    (alignment: AlignKind) => {
      commitElements((prev) => alignElements(prev, selectedIdsRef.current, alignment));
    },
    [commitElements],
  );

  const distributeSelected = useCallback(
    (axis: DistributeAxis) => {
      commitElements((prev) => distributeElements(prev, selectedIdsRef.current, axis));
    },
    [commitElements],
  );

  const reorderLayer = useCallback(
    (direction: 'front' | 'forward' | 'backward' | 'back') => {
      const selSet = new Set(selectedIdsRef.current);
      if (selSet.size === 0) return;

      commitElements((prev) => {
        const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
        if (direction === 'front') {
          const rest = sorted.filter((el) => !selSet.has(el.id));
          const sel = sorted.filter((el) => selSet.has(el.id));
          return [...rest, ...sel].map((el, idx) => ({ ...el, zIndex: idx + 1 }));
        }
        if (direction === 'back') {
          const rest = sorted.filter((el) => !selSet.has(el.id));
          const sel = sorted.filter((el) => selSet.has(el.id));
          return [...sel, ...rest].map((el, idx) => ({ ...el, zIndex: idx + 1 }));
        }
        if (direction === 'forward') {
          for (let i = sorted.length - 2; i >= 0; i--) {
            if (selSet.has(sorted[i].id) && !selSet.has(sorted[i + 1].id)) {
              [sorted[i], sorted[i + 1]] = [sorted[i + 1], sorted[i]];
            }
          }
          return sorted.map((el, idx) => ({ ...el, zIndex: idx + 1 }));
        }
        // backward
        for (let i = 1; i < sorted.length; i++) {
          if (selSet.has(sorted[i].id) && !selSet.has(sorted[i - 1].id)) {
            [sorted[i], sorted[i - 1]] = [sorted[i - 1], sorted[i]];
          }
        }
        return sorted.map((el, idx) => ({ ...el, zIndex: idx + 1 }));
      });
    },
    [commitElements],
  );

  const cloneElementsList = useCallback(
    (sourceElements: DiagramElement[], offset = 28): DiagramElement[] => {
      const idMap = new Map<string, string>();
      for (const el of sourceElements) {
        idMap.set(el.id, crypto.randomUUID());
      }
      const maxZ = docRef.current.elements.reduce((m, el) => Math.max(m, el.zIndex), 0);

      return sourceElements.map((el, idx) => {
        const newId = idMap.get(el.id)!;
        if (isConnectorElement(el)) {
          return {
            ...structuredClone(el),
            id: newId,
            zIndex: maxZ + idx + 1,
            startPoint: { x: el.startPoint.x + offset, y: el.startPoint.y + offset },
            endPoint: { x: el.endPoint.x + offset, y: el.endPoint.y + offset },
            startBinding:
              el.startBinding && idMap.has(el.startBinding.elementId)
                ? { ...el.startBinding, elementId: idMap.get(el.startBinding.elementId)! }
                : null,
            endBinding:
              el.endBinding && idMap.has(el.endBinding.elementId)
                ? { ...el.endBinding, elementId: idMap.get(el.endBinding.elementId)! }
                : null,
          };
        }
        if (isNoteElement(el)) {
          return {
            ...structuredClone(el),
            id: newId,
            x: el.x + offset,
            y: el.y + offset,
            zIndex: maxZ + idx + 1,
            attachedToId:
              el.attachedToId && idMap.has(el.attachedToId)
                ? idMap.get(el.attachedToId)!
                : el.attachedToId,
          };
        }
        return {
          ...structuredClone(el),
          id: newId,
          x: el.x + offset,
          y: el.y + offset,
          zIndex: maxZ + idx + 1,
        };
      });
    },
    [],
  );

  const copySelected = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    if (selSet.size === 0) return;
    clipboardRef.current = structuredClone(
      docRef.current.elements.filter((el) => selSet.has(el.id)),
    );
    pushToast(`Copied ${clipboardRef.current.length} item(s)`, 'info');
  }, [pushToast]);

  const pasteClipboard = useCallback(() => {
    if (clipboardRef.current.length === 0) return;
    const clones = cloneElementsList(clipboardRef.current, 30);
    clipboardRef.current = structuredClone(clones);
    commitElements((prev) => [...prev, ...clones]);
    setSelectedIds(clones.map((c) => c.id));
  }, [cloneElementsList, commitElements]);

  const duplicateSelected = useCallback(() => {
    const selSet = new Set(selectedIdsRef.current);
    const items = docRef.current.elements.filter((el) => selSet.has(el.id));
    if (items.length === 0) return;
    const clones = cloneElementsList(items, 28);
    commitElements((prev) => [...prev, ...clones]);
    setSelectedIds(clones.map((c) => c.id));
  }, [cloneElementsList, commitElements]);

  const selectAllVisible = useCallback(() => {
    const showNotes = docRef.current.settings.showNotes;
    setSelectedIds(
      docRef.current.elements
        .filter((el) => !(isNoteElement(el) && !showNotes))
        .map((el) => el.id),
    );
  }, []);

  // Viewport & zoom helpers
  const zoomAtPoint = useCallback((factor: number, screenPt?: Point) => {
    setViewport((prev) => {
      const nextZoom = clampZoom(prev.zoom * factor);
      const anchor = screenPt ?? {
        x: canvasSizeRef.current.width / 2,
        y: canvasSizeRef.current.height / 2,
      };
      const worldX = (anchor.x - prev.x) / prev.zoom;
      const worldY = (anchor.y - prev.y) / prev.zoom;
      return {
        zoom: nextZoom,
        x: anchor.x - worldX * nextZoom,
        y: anchor.y - worldY * nextZoom,
      };
    });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const resetZoom = useCallback(() => {
    setViewport((prev) => {
      const cx = canvasSizeRef.current.width / 2;
      const cy = canvasSizeRef.current.height / 2;
      const worldX = (cx - prev.x) / prev.zoom;
      const worldY = (cy - prev.y) / prev.zoom;
      return {
        zoom: 1,
        x: cx - worldX,
        y: cy - worldY,
      };
    });
  }, []);

  const fitElementsInView = useCallback(
    (targetElements: DiagramElement[], width?: number, height?: number) => {
      const w = width ?? canvasSizeRef.current.width;
      const h = height ?? canvasSizeRef.current.height;
      const map = buildElementsMap(docRef.current.elements);
      const bounds = getSelectionBounds(targetElements, map);
      if (!bounds) {
        setViewport({ x: Math.round((w - 1280) / 2), y: Math.round((h - 720) / 2), zoom: 1 });
        return;
      }
      const padding = 72;
      const availW = Math.max(200, w - padding * 2);
      const availH = Math.max(160, h - padding * 2);
      const nextZoom = clampZoom(
        Math.min(1.25, availW / Math.max(40, bounds.width), availH / Math.max(40, bounds.height)),
      );
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      setViewport({
        zoom: nextZoom,
        x: w / 2 - cx * nextZoom,
        y: h / 2 - cy * nextZoom,
      });
    },
    [],
  );

  const fitToContent = useCallback(() => {
    const visible = docRef.current.elements.filter(
      (el) => !(isNoteElement(el) && !docRef.current.settings.showNotes),
    );
    fitElementsInView(visible);
  }, [fitElementsInView]);

  const zoomToSelection = useCallback(() => {
    const sel = docRef.current.elements.filter((el) => selectedIdsRef.current.includes(el.id));
    if (sel.length > 0) {
      fitElementsInView(sel);
    } else {
      fitToContent();
    }
  }, [fitElementsInView, fitToContent]);

  const focusElement = useCallback((id: string) => {
    const el = docRef.current.elements.find((item) => item.id === id);
    if (!el) return;
    if (isNoteElement(el) && !docRef.current.settings.showNotes) {
      setDoc((prev) => ({
        ...prev,
        settings: { ...prev.settings, showNotes: true },
      }));
    }
    const map = buildElementsMap(docRef.current.elements);
    const b = getElementBounds(el, map);
    const w = canvasSizeRef.current.width;
    const h = canvasSizeRef.current.height;
    const z = Math.max(0.85, Math.min(1.25, viewportRef.current.zoom));
    setViewport({
      zoom: z,
      x: w / 2 - (b.x + b.width / 2) * z,
      y: h / 2 - (b.y + b.height / 2) * z,
    });
    setSelectedIds([id]);
  }, []);

  // Project Management
  const resetWorkspaceForDoc = useCallback(
    (nextDoc: ProjectDocument, persisted: boolean) => {
      undoStackRef.current = [];
      redoStackRef.current = [];
      syncHistoryMeta();
      hasModifiedRef.current = persisted;
      setSaveStatus(persisted ? 'saved' : 'draft');
      setSelectedIds([]);
      setEditingId(null);
      setTool('select');
      setDoc(nextDoc);
      fitElementsInView(
        nextDoc.elements.filter((el) => !(isNoteElement(el) && !nextDoc.settings.showNotes)),
      );
    },
    [fitElementsInView, syncHistoryMeta],
  );

  const newProject = useCallback(() => {
    flushPendingSave();
    const blank = createBlankProject(docRef.current.themeId);
    resetWorkspaceForDoc(blank, false);
    pushToast('Started new blank architecture', 'info');
  }, [flushPendingSave, pushToast, resetWorkspaceForDoc]);

  const openProject = useCallback(
    (id: string) => {
      flushPendingSave();
      const loaded = loadProject(id);
      if (!loaded) {
        pushToast('Project could not be loaded from local storage.', 'error');
        return;
      }
      resetWorkspaceForDoc(loaded, true);
      pushToast(`Opened "${loaded.name}"`, 'info');
    },
    [flushPendingSave, pushToast, resetWorkspaceForDoc],
  );

  const openTemplate = useCallback(
    (templateId: string) => {
      flushPendingSave();
      const templated = buildDocumentFromTemplate(templateId);
      if (!templated) return;
      persistDocumentNow(templated);
      resetWorkspaceForDoc(templated, true);
      pushToast(`Loaded template "${templated.name}"`, 'success');
    },
    [flushPendingSave, persistDocumentNow, pushToast, resetWorkspaceForDoc],
  );

  const renameActiveProject = useCallback(
    (name: string) => {
      const clean = name.trim() || 'Untitled Architecture';
      setDoc((prev) => {
        const nextDoc = { ...prev, name: clean, updatedAt: new Date().toISOString() };
        persistDocumentNow(nextDoc);
        hasModifiedRef.current = true;
        return nextDoc;
      });
    },
    [persistDocumentNow],
  );

  const renameSavedProject = useCallback(
    (id: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      if (id === docRef.current.id) {
        renameActiveProject(clean);
        return;
      }
      const loaded = loadProject(id);
      if (!loaded) return;
      const res = saveProject({ ...loaded, name: clean });
      if (res.ok) {
        setSavedProjects(listProjects());
        pushToast(`Renamed to "${clean}"`, 'info');
      }
    },
    [pushToast, renameActiveProject],
  );

  const deleteSavedProject = useCallback(
    (id: string) => {
      deleteProject(id);
      setSavedProjects(listProjects());
      if (id === docRef.current.id) {
        hasModifiedRef.current = false;
        setSaveStatus('draft');
      }
      pushToast('Removed project from local storage', 'info');
    },
    [pushToast],
  );

  const duplicateSavedProject = useCallback(
    (id: string) => {
      if (id === docRef.current.id && hasModifiedRef.current) {
        flushPendingSave();
      }
      const copy = duplicateProject(id);
      if (copy) {
        setSavedProjects(listProjects());
        pushToast(`Duplicated "${copy.name}"`, 'success');
      }
    },
    [flushPendingSave, pushToast],
  );

  const importJsonString = useCallback(
    (rawJson: string): boolean => {
      const parsed = parseImportedProjects(rawJson);
      if (!parsed.ok) {
        pushToast(parsed.error, 'error');
        return false;
      }
      flushPendingSave();
      for (const project of parsed.projects) {
        saveProject(project);
      }
      setSavedProjects(listProjects());
      const first = parsed.projects[0];
      resetWorkspaceForDoc(first, true);
      pushToast(
        parsed.projects.length === 1
          ? `Imported "${first.name}"`
          : `Imported ${parsed.projects.length} projects`,
        'success',
      );
      return true;
    },
    [flushPendingSave, pushToast, resetWorkspaceForDoc],
  );

  const saveNow = useCallback(() => {
    hasModifiedRef.current = true;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (persistDocumentNow(docRef.current)) {
      pushToast(`Saved "${docRef.current.name}" locally`, 'success');
    }
  }, [persistDocumentNow, pushToast]);

  const noteCount = useMemo(
    () => doc.elements.filter((el) => isNoteElement(el)).length,
    [doc.elements],
  );

  const selectedElements = useMemo(() => {
    const selSet = new Set(selectedIds);
    return doc.elements.filter((el) => selSet.has(el.id));
  }, [doc.elements, selectedIds]);

  return {
    doc,
    savedProjects,
    saveStatus,
    tool,
    setTool,
    selectedIds,
    setSelectedIds,
    selectedElements,
    viewport,
    setViewport,
    canvasSize,
    setCanvasSize,
    editingId,
    setEditingId,
    toasts,
    pushToast,
    canUndo: historyMeta.canUndo,
    canRedo: historyMeta.canRedo,
    noteCount,
    commitElements,
    setElementsPreview,
    commitSnapshotFromBefore,
    undo,
    redo,
    deleteIds,
    deleteSelected,
    createNode,
    addConnector,
    updateElements,
    convertSelectedShapeType,
    quickFlowFromSelected,
    attachNoteToSelected,
    dropElementAtFocalPoint,
    toggleNotesVisibility,
    toggleNoteCollapsed,
    toggleSlideFrame,
    setTheme,
    setGridStyle,
    toggleSnap,
    alignSelected,
    distributeSelected,
    reorderLayer,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    selectAllVisible,
    zoomAtPoint,
    panBy,
    resetZoom,
    fitToContent,
    zoomToSelection,
    focusElement,
    newProject,
    openProject,
    openTemplate,
    renameActiveProject,
    renameSavedProject,
    deleteSavedProject,
    duplicateSavedProject,
    importJsonString,
    saveNow,
  };
}

export type DiagramStore = ReturnType<typeof useDiagramStore>;
