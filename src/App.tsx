import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CanvasViewport } from './components/CanvasViewport';
import { CommandPalette } from './components/CommandPalette';
import { ContextMenu, ContextMenuState } from './components/ContextMenu';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { ProjectDrawer } from './components/ProjectDrawer';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ToastContainer } from './components/ToastContainer';
import { ToolRail } from './components/ToolRail';
import { TopBar } from './components/TopBar';
import { ZoomControls } from './components/ZoomControls';
import { computeQuickFlowPlacement, sortElementsForTabOrder } from './engine/layout';
import { downloadText, sanitizeFilename } from './exporters/pngExporter';
import {
  loadProject,
  serializeAllProjectsBackup,
  serializeProject,
} from './store/storage';
import { useDiagramStore } from './store/useDiagramStore';
import { PALETTES } from './themes/palettes';
import {
  CardinalSide,
  NodeKind,
  ShapeKind,
  isBoundedElement,
  isConnectorElement,
  isNoteElement,
  isShapeElement,
} from './types/diagram';

const TOOL_HOTKEYS: Record<string, NodeKind> = {
  s: 'service',
  d: 'database',
  q: 'queue',
  c: 'cloud',
  u: 'actor',
  g: 'decision',
  z: 'zone',
  t: 'text',
  n: 'note',
};

const CONVERT_HOTKEYS: Record<string, ShapeKind> = {
  '1': 'service',
  '2': 'database',
  '3': 'queue',
  '4': 'cloud',
  '5': 'actor',
  '6': 'decision',
};

export function App() {
  const store = useDiagramStore();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;

  const palette = PALETTES[store.doc.themeId];
  const isDark = palette.isDark;

  const handleQuickConnectPort = useCallback((sourceId: string, side: CardinalSide) => {
    const cur = storeRef.current;
    const source = cur.doc.elements.find((el) => el.id === sourceId);
    if (!source || !isShapeElement(source) || source.type === 'zone' || source.type === 'text') {
      return;
    }
    const { node, connector } = computeQuickFlowPlacement(
      source,
      side,
      cur.doc.elements,
      'service',
      cur.doc.settings.snapToGrid ? cur.doc.settings.gridSize : 1,
    );
    cur.commitElements((prev) => [...prev, node, connector]);
    cur.setSelectedIds([node.id]);
    cur.setEditingId(node.id);
  }, []);

  const canConvertContextTarget = useMemo(() => {
    if (!contextMenu?.targetId) return false;
    const el = store.doc.elements.find((item) => item.id === contextMenu.targetId);
    return Boolean(el && isShapeElement(el) && el.type !== 'zone' && el.type !== 'text');
  }, [contextMenu, store.doc.elements]);

  // Global keyboard power-user handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cur = storeRef.current;
      const activeTag = (document.activeElement?.tagName ?? '').toUpperCase();
      const targetTag = ((e.target as HTMLElement | null)?.tagName ?? '').toUpperCase();
      const inTextField =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        activeTag === 'SELECT' ||
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        targetTag === 'SELECT' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable === true;

      const mod = e.ctrlKey || e.metaKey;
      const keyLower = e.key.toLowerCase();

      if (mod && keyLower === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (mod && keyLower === 'o') {
        e.preventDefault();
        setProjectsOpen((v) => !v);
        return;
      }
      if (mod && keyLower === 'e') {
        e.preventDefault();
        setExportOpen((v) => !v);
        return;
      }
      if (mod && keyLower === 's') {
        e.preventDefault();
        cur.saveNow();
        return;
      }

      if (inTextField || cur.editingId) return;

      const modalOpen = projectsOpen || exportOpen || paletteOpen || shortcutsOpen;
      if (modalOpen) {
        if (e.key === 'Escape') {
          setProjectsOpen(false);
          setExportOpen(false);
          setPaletteOpen(false);
          setShortcutsOpen(false);
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === '/' || e.key === '?') {
        e.preventDefault();
        if (e.key === '?') setShortcutsOpen(true);
        else setPaletteOpen(true);
        return;
      }

      if (mod && keyLower === 'z' && !e.shiftKey) {
        e.preventDefault();
        cur.undo();
        return;
      }
      if ((mod && keyLower === 'y') || (mod && e.shiftKey && keyLower === 'z')) {
        e.preventDefault();
        cur.redo();
        return;
      }
      if (mod && keyLower === 'd') {
        e.preventDefault();
        cur.duplicateSelected();
        return;
      }
      if (mod && keyLower === 'c') {
        e.preventDefault();
        cur.copySelected();
        return;
      }
      if (mod && keyLower === 'v') {
        e.preventDefault();
        cur.pasteClipboard();
        return;
      }
      if (mod && keyLower === 'a') {
        e.preventDefault();
        cur.selectAllVisible();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        cur.resetZoom();
        return;
      }

      // Ctrl + Arrow -> Quick-Flow connected node in direction + inline edit
      if (mod && e.key.startsWith('Arrow')) {
        const dirMap: Record<string, CardinalSide> = {
          ArrowRight: 'right',
          ArrowLeft: 'left',
          ArrowDown: 'bottom',
          ArrowUp: 'top',
        };
        const dir = dirMap[e.key];
        if (dir) {
          e.preventDefault();
          cur.quickFlowFromSelected(dir);
        }
        return;
      }

      // Alt + 1..6 -> Convert selected shape type
      if (e.altKey && CONVERT_HOTKEYS[e.key]) {
        e.preventDefault();
        cur.convertSelectedShapeType(CONVERT_HOTKEYS[e.key]);
        return;
      }

      // Alt + N -> Toggle notes
      if (e.altKey && keyLower === 'n') {
        e.preventDefault();
        cur.toggleNotesVisibility();
        return;
      }

      // Tab / Shift+Tab -> Cycle visible elements
      if (e.key === 'Tab') {
        e.preventDefault();
        const ordered = sortElementsForTabOrder(cur.doc.elements, cur.doc.settings.showNotes);
        if (ordered.length === 0) return;
        const currIdx =
          cur.selectedIds.length === 1
            ? ordered.findIndex((el) => el.id === cur.selectedIds[0])
            : -1;
        const nextIdx = e.shiftKey
          ? currIdx <= 0
            ? ordered.length - 1
            : currIdx - 1
          : (currIdx + 1) % ordered.length;
        cur.focusElement(ordered[nextIdx].id);
        return;
      }

      // Arrow keys -> Nudge selected elements OR pan canvas
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const delta = e.shiftKey ? 20 : 5;
        const panStep = e.shiftKey ? 120 : 48;
        const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;

        if (e.altKey || cur.selectedIds.length === 0) {
          cur.panBy(-dx * panStep, -dy * panStep);
          return;
        }

        const selSet = new Set(cur.selectedIds);
        cur.commitElements((prev) =>
          prev.map((el) => {
            if (!selSet.has(el.id)) return el;
            if (isConnectorElement(el)) {
              return {
                ...el,
                startPoint: !el.startBinding
                  ? { x: el.startPoint.x + dx * delta, y: el.startPoint.y + dy * delta }
                  : el.startPoint,
                endPoint: !el.endBinding
                  ? { x: el.endPoint.x + dx * delta, y: el.endPoint.y + dy * delta }
                  : el.endPoint,
              };
            }
            if (isBoundedElement(el)) {
              return { ...el, x: el.x + dx * delta, y: el.y + dy * delta };
            }
            return el;
          }),
        );
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (cur.selectedIds.length > 0) {
          e.preventDefault();
          cur.deleteSelected();
        }
        return;
      }

      if ((e.key === 'Enter' || e.key === 'F2') && cur.selectedIds.length === 1) {
        e.preventDefault();
        cur.setEditingId(cur.selectedIds[0]);
        return;
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        if (cur.selectedIds.length > 0) {
          cur.setSelectedIds([]);
        } else if (cur.tool !== 'select') {
          cur.setTool('select');
        }
        return;
      }

      if (mod || e.altKey) return;

      // Shift + Shape key -> Immediate keyboard-only drop at focal point
      if (e.shiftKey && TOOL_HOTKEYS[keyLower]) {
        e.preventDefault();
        cur.dropElementAtFocalPoint(TOOL_HOTKEYS[keyLower]);
        return;
      }

      // Single-key tool & view shortcuts
      if (keyLower === 'v') {
        cur.setTool('select');
      } else if (keyLower === 'h') {
        cur.setTool('hand');
      } else if (keyLower === 'x') {
        cur.setTool('eraser');
      } else if (keyLower === 'a') {
        cur.setTool('connector');
      } else if (TOOL_HOTKEYS[keyLower]) {
        cur.setTool(TOOL_HOTKEYS[keyLower]);
      } else if (keyLower === 'm') {
        e.preventDefault();
        cur.attachNoteToSelected();
      } else if (keyLower === 'p') {
        e.preventDefault();
        cur.toggleNotesVisibility();
      } else if (keyLower === 'f') {
        e.preventDefault();
        cur.toggleSlideFrame();
      } else if (keyLower === 'i') {
        e.preventDefault();
        setInspectorOpen((v) => !v);
      } else if (e.key === '[') {
        cur.reorderLayer('backward');
      } else if (e.key === ']') {
        cur.reorderLayer('forward');
      } else if (e.key === '=' || e.key === '+') {
        cur.zoomAtPoint(1.18, { x: cur.canvasSize.width / 2, y: cur.canvasSize.height / 2 });
      } else if (e.key === '-') {
        cur.zoomAtPoint(1 / 1.18, { x: cur.canvasSize.width / 2, y: cur.canvasSize.height / 2 });
      } else if (e.key === '0') {
        cur.resetZoom();
      } else if (e.key === '1') {
        cur.fitToContent();
      } else if (e.key === '2') {
        cur.zoomToSelection();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [exportOpen, paletteOpen, projectsOpen, shortcutsOpen]);

  const handleExportActiveJson = useCallback(() => {
    const json = serializeProject(store.doc);
    downloadText(
      json,
      `${sanitizeFilename(store.doc.name)}.archdoddle.json`,
      'application/json;charset=utf-8',
    );
  }, [store.doc]);

  const handleExportAllBackup = useCallback(() => {
    const json = serializeAllProjectsBackup(store.doc);
    downloadText(json, 'archdoddle-workspace-backup.json', 'application/json;charset=utf-8');
  }, [store.doc]);

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: palette.canvasBg }}
    >
      <TopBar
        projectName={store.doc.name}
        saveStatus={store.saveStatus}
        savedCount={store.savedProjects.length}
        themeId={store.doc.themeId}
        showNotes={store.doc.settings.showNotes}
        noteCount={store.noteCount}
        showSlideFrame={store.doc.settings.showSlideFrame}
        inspectorOpen={inspectorOpen}
        canUndo={store.canUndo}
        canRedo={store.canRedo}
        onRenameProject={store.renameActiveProject}
        onOpenProjectDrawer={() => setProjectsOpen(true)}
        onUndo={store.undo}
        onRedo={store.redo}
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleNotes={store.toggleNotesVisibility}
        onToggleSlideFrame={store.toggleSlideFrame}
        onSetTheme={store.setTheme}
        onOpenExport={() => setExportOpen(true)}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onSaveNow={store.saveNow}
      />

      <div className="relative flex-1 flex overflow-hidden">
        <ToolRail activeTool={store.tool} isDark={isDark} onSelectTool={store.setTool} />

        <div className="relative flex-1 h-full flex overflow-hidden">
          <CanvasViewport
            doc={store.doc}
            tool={store.tool}
            selectedIds={store.selectedIds}
            viewport={store.viewport}
            canvasSize={store.canvasSize}
            editingId={store.editingId}
            spacePressed={spaceHeld}
            onResizeCanvas={store.setCanvasSize}
            onSetViewport={store.setViewport}
            onZoomAtPoint={store.zoomAtPoint}
            onSelectIds={store.setSelectedIds}
            onSetTool={store.setTool}
            onSetEditingId={store.setEditingId}
            onCreateNode={store.createNode}
            onAddConnector={store.addConnector}
            onQuickConnectPort={handleQuickConnectPort}
            onSetElementsPreview={store.setElementsPreview}
            onCommitSnapshotFromBefore={store.commitSnapshotFromBefore}
            onCommitElements={store.commitElements}
            onDeleteIds={store.deleteIds}
            onUpdateElement={(id, patch) => store.updateElements([id], patch)}
            onSetSelectedColor={(color) => store.updateElements(store.selectedIds, { color })}
            onAttachNote={store.attachNoteToSelected}
            onToggleCollapseNote={store.toggleNoteCollapsed}
            onDuplicateSelected={store.duplicateSelected}
            onOpenContextMenu={setContextMenu}
            onImportJsonFile={(raw) => {
              store.importJsonString(raw);
            }}
          />

          <ZoomControls
            zoom={store.viewport.zoom}
            elementCount={
              store.doc.elements.filter(
                (el) => !(isNoteElement(el) && !store.doc.settings.showNotes),
              ).length
            }
            noteCount={store.noteCount}
            showNotes={store.doc.settings.showNotes}
            isDark={isDark}
            onZoomIn={() =>
              store.zoomAtPoint(1.2, {
                x: store.canvasSize.width / 2,
                y: store.canvasSize.height / 2,
              })
            }
            onZoomOut={() =>
              store.zoomAtPoint(1 / 1.2, {
                x: store.canvasSize.width / 2,
                y: store.canvasSize.height / 2,
              })
            }
            onResetZoom={store.resetZoom}
            onFitToContent={store.fitToContent}
          />
        </div>

        {inspectorOpen && (
          <InspectorPanel
            elements={store.doc.elements}
            selectedIds={store.selectedIds}
            themeId={store.doc.themeId}
            settings={store.doc.settings}
            onUpdateElement={(id, patch) => store.updateElements([id], patch)}
            onSetSelectedColor={(color) => store.updateElements(store.selectedIds, { color })}
            onConvertShape={store.convertSelectedShapeType}
            onAlign={store.alignSelected}
            onDistribute={store.distributeSelected}
            onReorderLayer={store.reorderLayer}
            onDeleteSelected={store.deleteSelected}
            onSetTheme={store.setTheme}
            onSetGridStyle={store.setGridStyle}
            onToggleSnap={store.toggleSnap}
            onToggleNotes={store.toggleNotesVisibility}
            onToggleSlideFrame={store.toggleSlideFrame}
            onFocusElement={store.focusElement}
          />
        )}
      </div>

      <ContextMenu
        state={contextMenu}
        isDark={isDark}
        showNotes={store.doc.settings.showNotes}
        canConvertShape={canConvertContextTarget}
        onClose={() => setContextMenu(null)}
        onEditTarget={store.setEditingId}
        onAttachNote={store.attachNoteToSelected}
        onDuplicate={store.duplicateSelected}
        onConvertShape={store.convertSelectedShapeType}
        onReorderLayer={store.reorderLayer}
        onDelete={store.deleteSelected}
        onDropAtWorld={(kind, worldPt) => {
          store.createNode(kind, worldPt, undefined, true);
        }}
        onPaste={store.pasteClipboard}
        onFitToScreen={store.fitToContent}
        onToggleNotes={store.toggleNotesVisibility}
        onOpenExport={() => setExportOpen(true)}
      />

      <ProjectDrawer
        open={projectsOpen}
        activeProjectId={store.doc.id}
        savedProjects={store.savedProjects}
        isDark={isDark}
        onClose={() => setProjectsOpen(false)}
        onNewProject={store.newProject}
        onOpenProject={store.openProject}
        onOpenTemplate={store.openTemplate}
        onRenameProject={store.renameSavedProject}
        onDuplicateProject={store.duplicateSavedProject}
        onDeleteProject={store.deleteSavedProject}
        onExportSingleJson={(id, name) => {
          const loaded = id === store.doc.id ? store.doc : loadProject(id);
          if (loaded) {
            downloadText(
              serializeProject(loaded),
              `${sanitizeFilename(name)}.archdoddle.json`,
              'application/json;charset=utf-8',
            );
          }
        }}
        onExportAllBackup={handleExportAllBackup}
        onImportJsonFile={(raw) => {
          store.importJsonString(raw);
        }}
      />

      <ExportModal
        open={exportOpen}
        doc={store.doc}
        isDark={isDark}
        onClose={() => setExportOpen(false)}
        onExportJson={handleExportActiveJson}
        onExportBackup={handleExportAllBackup}
      />

      <CommandPalette
        open={paletteOpen}
        isDark={isDark}
        elements={store.doc.elements}
        savedProjects={store.savedProjects}
        showNotes={store.doc.settings.showNotes}
        onClose={() => setPaletteOpen(false)}
        onDropElement={(kind) => store.dropElementAtFocalPoint(kind)}
        onFocusElement={store.focusElement}
        onOpenProject={store.openProject}
        onNewProject={store.newProject}
        onSetTheme={store.setTheme}
        onToggleNotes={store.toggleNotesVisibility}
        onToggleSlideFrame={store.toggleSlideFrame}
        onFitToContent={store.fitToContent}
        onOpenExport={() => setExportOpen(true)}
        onOpenProjectsDrawer={() => setProjectsOpen(true)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        isDark={isDark}
        onClose={() => setShortcutsOpen(false)}
      />

      <ToastContainer toasts={store.toasts} />
    </div>
  );
}

export default App;
