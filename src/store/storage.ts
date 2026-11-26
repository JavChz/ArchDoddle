import {
  DiagramElement,
  GridStyle,
  ProjectDocument,
  ProjectMeta,
  ThemeId,
  isNoteElement,
} from '../types/diagram';

const INDEX_KEY = 'archdoddle:projects:index';
const PROJECT_PREFIX = 'archdoddle:project:';
const PREFS_KEY = 'archdoddle:prefs';

export interface UserPrefs {
  themeId: ThemeId;
  gridStyle: GridStyle;
  snapToGrid: boolean;
  gridSize: number;
}

const DEFAULT_PREFS: UserPrefs = {
  themeId: 'executive-slate',
  gridStyle: 'dots',
  snapToGrid: true,
  gridSize: 20,
};

const VALID_THEMES: ReadonlySet<string> = new Set([
  'executive-slate',
  'blueprint-navy',
  'warm-consulting',
  'midnight-ops',
]);

const VALID_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  'service',
  'database',
  'queue',
  'cloud',
  'actor',
  'decision',
  'zone',
  'text',
  'note',
  'connector',
]);

export function loadPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      themeId:
        parsed.themeId && VALID_THEMES.has(parsed.themeId)
          ? parsed.themeId
          : DEFAULT_PREFS.themeId,
      gridStyle:
        parsed.gridStyle === 'dots' ||
        parsed.gridStyle === 'blueprint' ||
        parsed.gridStyle === 'none'
          ? parsed.gridStyle
          : DEFAULT_PREFS.gridStyle,
      snapToGrid:
        typeof parsed.snapToGrid === 'boolean' ? parsed.snapToGrid : DEFAULT_PREFS.snapToGrid,
      gridSize:
        typeof parsed.gridSize === 'number' && parsed.gridSize >= 8
          ? parsed.gridSize
          : DEFAULT_PREFS.gridSize,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Partial<UserPrefs>): void {
  try {
    const merged = { ...loadPrefs(), ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors for prefs
  }
}

export function createBlankProject(themeId?: ThemeId): ProjectDocument {
  const prefs = loadPrefs();
  const now = new Date().toISOString();
  return {
    format: 'archdoddle',
    version: 1,
    id: crypto.randomUUID(),
    name: 'Untitled Architecture',
    createdAt: now,
    updatedAt: now,
    themeId: themeId ?? prefs.themeId,
    settings: {
      gridStyle: prefs.gridStyle,
      snapToGrid: prefs.snapToGrid,
      gridSize: prefs.gridSize,
      showNotes: true,
      showSlideFrame: false,
    },
    elements: [],
  };
}

export function toProjectMeta(doc: ProjectDocument): ProjectMeta {
  const noteCount = doc.elements.filter((el) => isNoteElement(el)).length;
  return {
    id: doc.id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    elementCount: doc.elements.length,
    noteCount,
    themeId: doc.themeId,
  };
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectMeta[];
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
}

function writeIndex(metas: ProjectMeta[]): void {
  const sorted = [...metas].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  localStorage.setItem(INDEX_KEY, JSON.stringify(sorted));
}

export function loadProject(id: string): ProjectDocument | null {
  try {
    const raw = localStorage.getItem(`${PROJECT_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return validateProjectDocument(parsed);
  } catch {
    return null;
  }
}

export function saveProject(doc: ProjectDocument): { ok: true } | { ok: false; error: string } {
  try {
    const updated: ProjectDocument = {
      ...doc,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${PROJECT_PREFIX}${updated.id}`, JSON.stringify(updated));
    const existing = listProjects().filter((m) => m.id !== updated.id);
    existing.unshift(toProjectMeta(updated));
    writeIndex(existing);
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'QuotaExceededError'
        ? 'Local storage is full. Export a JSON backup and delete old projects to free space.'
        : err instanceof Error
          ? err.message
          : 'Failed to save project locally.';
    return { ok: false, error: message };
  }
}

export function deleteProject(id: string): void {
  try {
    localStorage.removeItem(`${PROJECT_PREFIX}${id}`);
    const remaining = listProjects().filter((m) => m.id !== id);
    writeIndex(remaining);
  } catch {
    // Ignore errors during delete
  }
}

export function duplicateProject(id: string): ProjectDocument | null {
  const source = loadProject(id);
  if (!source) return null;
  const now = new Date().toISOString();
  const copy: ProjectDocument = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
  const res = saveProject(copy);
  return res.ok ? copy : null;
}

export function serializeProject(doc: ProjectDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function serializeAllProjectsBackup(activeDoc?: ProjectDocument): string {
  const metas = listProjects();
  const docs: ProjectDocument[] = [];
  const seen = new Set<string>();

  for (const m of metas) {
    const loaded = loadProject(m.id);
    if (loaded) {
      docs.push(loaded);
      seen.add(loaded.id);
    }
  }
  if (activeDoc && activeDoc.elements.length > 0 && !seen.has(activeDoc.id)) {
    docs.unshift(activeDoc);
  }

  return JSON.stringify(
    {
      format: 'archdoddle-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: docs,
    },
    null,
    2,
  );
}

function isValidElement(raw: unknown): raw is DiagramElement {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) return false;
  if (typeof obj.type !== 'string' || !VALID_ELEMENT_TYPES.has(obj.type)) return false;

  if (obj.type === 'connector') {
    const sp = obj.startPoint as Record<string, unknown> | undefined;
    const ep = obj.endPoint as Record<string, unknown> | undefined;
    return (
      !!sp &&
      typeof sp.x === 'number' &&
      typeof sp.y === 'number' &&
      !!ep &&
      typeof ep.x === 'number' &&
      typeof ep.y === 'number'
    );
  }

  return (
    typeof obj.x === 'number' &&
    typeof obj.y === 'number' &&
    typeof obj.width === 'number' &&
    typeof obj.height === 'number'
  );
}

export function validateProjectDocument(raw: unknown): ProjectDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== 'archdoddle') return null;
  if (!Array.isArray(obj.elements)) return null;

  const validElements = obj.elements.filter(isValidElement);
  const now = new Date().toISOString();
  const themeId: ThemeId =
    typeof obj.themeId === 'string' && VALID_THEMES.has(obj.themeId)
      ? (obj.themeId as ThemeId)
      : 'executive-slate';

  const rawSettings = (obj.settings ?? {}) as Record<string, unknown>;
  const settings = {
    gridStyle:
      rawSettings.gridStyle === 'dots' ||
      rawSettings.gridStyle === 'blueprint' ||
      rawSettings.gridStyle === 'none'
        ? rawSettings.gridStyle
        : ('dots' as GridStyle),
    snapToGrid: typeof rawSettings.snapToGrid === 'boolean' ? rawSettings.snapToGrid : true,
    gridSize:
      typeof rawSettings.gridSize === 'number' && rawSettings.gridSize >= 8
        ? rawSettings.gridSize
        : 20,
    showNotes: typeof rawSettings.showNotes === 'boolean' ? rawSettings.showNotes : true,
    showSlideFrame:
      typeof rawSettings.showSlideFrame === 'boolean' ? rawSettings.showSlideFrame : false,
  };

  return {
    format: 'archdoddle',
    version: 1,
    id: typeof obj.id === 'string' && obj.id ? obj.id : crypto.randomUUID(),
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Imported Project',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : now,
    themeId,
    settings,
    elements: validElements,
  };
}

export function parseImportedProjects(
  rawJson: string,
): { ok: true; projects: ProjectDocument[] } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Invalid JSON file: expected an ArchDoddle project object.' };
    }
    const obj = parsed as Record<string, unknown>;
    const existingMetas = listProjects();
    const existingIds = new Set(existingMetas.map((m) => m.id));
    const existingNames = new Set(existingMetas.map((m) => m.name.toLowerCase()));

    const dedupeDoc = (doc: ProjectDocument): ProjectDocument => {
      let id = doc.id;
      let name = doc.name;
      if (existingIds.has(id)) {
        id = crypto.randomUUID();
      }
      if (existingNames.has(name.toLowerCase())) {
        name = `${name} (Imported)`;
      }
      existingIds.add(id);
      existingNames.add(name.toLowerCase());
      return {
        ...doc,
        id,
        name,
        updatedAt: new Date().toISOString(),
      };
    };

    if (obj.format === 'archdoddle-backup' && Array.isArray(obj.projects)) {
      const valid = obj.projects
        .map(validateProjectDocument)
        .filter((d): d is ProjectDocument => d !== null)
        .map(dedupeDoc);
      if (valid.length === 0) {
        return { ok: false, error: 'Backup file contains no valid ArchDoddle projects.' };
      }
      return { ok: true, projects: valid };
    }

    const single = validateProjectDocument(parsed);
    if (!single) {
      return {
        ok: false,
        error: 'Unrecognized file format. Please import an .archdoddle.json file.',
      };
    }
    return { ok: true, projects: [dedupeDoc(single)] };
  } catch {
    return { ok: false, error: 'Could not parse JSON file. Check that the file is valid JSON.' };
  }
}
