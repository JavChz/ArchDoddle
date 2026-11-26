import React from 'react';
import {
  ArrowUpRight,
  Box,
  Cloud,
  Database,
  Diamond,
  Eraser,
  Hand,
  Layers,
  MousePointer2,
  SquareDashed,
  StickyNote,
  Type,
  User,
} from 'lucide-react';
import { ToolType } from '../types/diagram';

interface ToolRailProps {
  activeTool: ToolType;
  isDark: boolean;
  onSelectTool: (tool: ToolType) => void;
}

interface ToolItem {
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'nav' | 'arch' | 'annot';
  canQuickDrop?: boolean;
}

const TOOLS: ToolItem[] = [
  { id: 'select', label: 'Select & Move', shortcut: 'V', icon: MousePointer2, group: 'nav' },
  { id: 'hand', label: 'Pan Canvas', shortcut: 'H', icon: Hand, group: 'nav' },
  { id: 'eraser', label: 'Quick Delete / Sweep', shortcut: 'X', icon: Eraser, group: 'nav' },
  {
    id: 'service',
    label: 'Service / Component',
    shortcut: 'S',
    icon: Box,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'database',
    label: 'Database Cylinder',
    shortcut: 'D',
    icon: Database,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'queue',
    label: 'Message Queue / Bus',
    shortcut: 'Q',
    icon: Layers,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'cloud',
    label: 'External / Cloud',
    shortcut: 'C',
    icon: Cloud,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'actor',
    label: 'User / Actor',
    shortcut: 'U',
    icon: User,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'decision',
    label: 'Decision / Gateway',
    shortcut: 'G',
    icon: Diamond,
    group: 'arch',
    canQuickDrop: true,
  },
  {
    id: 'zone',
    label: 'VPC / Boundary Zone',
    shortcut: 'Z',
    icon: SquareDashed,
    group: 'arch',
    canQuickDrop: true,
  },
  { id: 'connector', label: 'Smart Connector', shortcut: 'A', icon: ArrowUpRight, group: 'annot' },
  { id: 'text', label: 'Text Heading', shortcut: 'T', icon: Type, group: 'annot', canQuickDrop: true },
  {
    id: 'note',
    label: 'Hideable Consultant Note',
    shortcut: 'N',
    icon: StickyNote,
    group: 'annot',
    canQuickDrop: true,
  },
];

export const ToolRail: React.FC<ToolRailProps> = ({ activeTool, isDark, onSelectTool }) => {
  const railCls = isDark
    ? 'bg-slate-900/95 border-slate-800 text-slate-300'
    : 'bg-white/95 border-slate-200 text-slate-700';

  const renderGroup = (group: ToolItem['group']) =>
    TOOLS.filter((t) => t.group === group).map((item) => {
      const Icon = item.icon;
      const isActive = activeTool === item.id;
      const isEraser = item.id === 'eraser';
      const activeStyle = isEraser
        ? 'bg-rose-500 text-white shadow-sm'
        : 'bg-sky-600 text-white shadow-sm';
      const idleStyle = isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700';

      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectTool(item.id)}
          title={`${item.label} (${item.shortcut})${item.canQuickDrop ? ' · Hold Shift+key to drop immediately' : ''}`}
          aria-label={item.label}
          className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
            isActive ? activeStyle : idleStyle
          }`}
        >
          <Icon className="w-4 h-4" />
          <span className="absolute bottom-0.5 right-1 text-[8px] font-mono opacity-60 pointer-events-none">
            {item.shortcut.split(' ')[0]}
          </span>
        </button>
      );
    });

  return (
    <aside
      aria-label="Diagram Tools"
      className={`w-12 shrink-0 border-r py-2 flex flex-col items-center gap-1 overflow-y-auto thin-scroll z-20 select-none ${railCls}`}
    >
      <div className="flex flex-col items-center gap-1">{renderGroup('nav')}</div>
      <div className={`w-7 h-px my-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
      <div className="flex flex-col items-center gap-1">{renderGroup('arch')}</div>
      <div className={`w-7 h-px my-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
      <div className="flex flex-col items-center gap-1">{renderGroup('annot')}</div>
    </aside>
  );
};
