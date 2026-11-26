export type ShapeKind =
  | 'service'
  | 'database'
  | 'queue'
  | 'cloud'
  | 'actor'
  | 'decision'
  | 'zone'
  | 'text';

export type NodeKind = ShapeKind | 'note';

export type SemanticColor =
  | 'primary'
  | 'neutral'
  | 'compute'
  | 'data'
  | 'external'
  | 'warning'
  | 'success'
  | 'note';

export type BorderStyle = 'solid' | 'dashed' | 'dotted';

export type ConnectorRouteStyle = 'orthogonal' | 'curved' | 'straight';

export type ArrowHead = 'none' | 'arrow' | 'open' | 'diamond';

export type PortSide = 'top' | 'right' | 'bottom' | 'left' | 'auto';

export type CardinalSide = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseElement {
  id: string;
  type: NodeKind | 'connector';
  zIndex: number;
  color: SemanticColor;
  borderStyle: BorderStyle;
  opacity?: number;
}

export interface ShapeElement extends BaseElement {
  type: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sublabel?: string;
  badge?: string;
  fontSize?: number;
}

export interface NoteElement extends BaseElement {
  type: 'note';
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body: string;
  collapsed: boolean;
  attachedToId?: string | null;
}

export interface Binding {
  elementId: string;
  port: PortSide;
}

export interface ConnectorElement extends BaseElement {
  type: 'connector';
  startPoint: Point;
  endPoint: Point;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  routeStyle: ConnectorRouteStyle;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  label?: string;
  strokeWidth?: number;
}

export type DiagramElement = ShapeElement | NoteElement | ConnectorElement;

export type ThemeId =
  | 'executive-slate'
  | 'blueprint-navy'
  | 'warm-consulting'
  | 'midnight-ops';

export type GridStyle = 'dots' | 'blueprint' | 'none';

export type ToolType = 'select' | 'hand' | 'eraser' | NodeKind | 'connector';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectSettings {
  gridStyle: GridStyle;
  snapToGrid: boolean;
  gridSize: number;
  showNotes: boolean;
  showSlideFrame: boolean;
}

export interface ProjectDocument {
  format: 'archdoddle';
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  themeId: ThemeId;
  settings: ProjectSettings;
  elements: DiagramElement[];
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  elementCount: number;
  noteCount: number;
  themeId: ThemeId;
}

export interface SmartGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export type DistributeAxis = 'horizontal' | 'vertical';

export function isShapeElement(el: DiagramElement): el is ShapeElement {
  return el.type !== 'connector' && el.type !== 'note';
}

export function isNoteElement(el: DiagramElement): el is NoteElement {
  return el.type === 'note';
}

export function isConnectorElement(el: DiagramElement): el is ConnectorElement {
  return el.type === 'connector';
}

export function isBoundedElement(el: DiagramElement): el is ShapeElement | NoteElement {
  return el.type !== 'connector';
}
