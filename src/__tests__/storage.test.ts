import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBlankProject,
  deleteProject,
  duplicateProject,
  listProjects,
  loadProject,
  parseImportedProjects,
  saveProject,
  serializeAllProjectsBackup,
  serializeProject,
} from '../store/storage';

describe('localStorage project store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates blank untitled projects by default without polluting storage', () => {
    const blank = createBlankProject();
    expect(blank.format).toBe('archdoddle');
    expect(blank.name).toBe('Untitled Architecture');
    expect(blank.elements).toHaveLength(0);
    expect(listProjects()).toHaveLength(0);
  });

  it('saves, lists, loads, duplicates, and deletes multiple projects', () => {
    const p1 = createBlankProject('executive-slate');
    p1.name = 'Payments Core';
    p1.elements.push({
      id: 's1',
      type: 'service',
      x: 100,
      y: 100,
      width: 160,
      height: 80,
      label: 'Gateway',
      color: 'primary',
      borderStyle: 'solid',
      zIndex: 1,
    });

    const p2 = createBlankProject('blueprint-navy');
    p2.name = 'Data Mesh';

    expect(saveProject(p1)).toEqual({ ok: true });
    expect(saveProject(p2)).toEqual({ ok: true });

    const list = listProjects();
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.name)).toContain('Payments Core');
    expect(list.map((m) => m.name)).toContain('Data Mesh');

    const loaded = loadProject(p1.id);
    expect(loaded?.elements).toHaveLength(1);
    expect(loaded?.themeId).toBe('executive-slate');

    const copy = duplicateProject(p1.id);
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(p1.id);
    expect(copy?.name).toBe('Payments Core (Copy)');
    expect(listProjects()).toHaveLength(3);

    deleteProject(p2.id);
    expect(listProjects()).toHaveLength(2);
    expect(loadProject(p2.id)).toBeNull();
  });

  it('serializes and imports single projects and backups safely without ID collisions', () => {
    const p1 = createBlankProject();
    p1.name = 'Cloud Topology';
    saveProject(p1);

    const singleJson = serializeProject(p1);
    const importedSingle = parseImportedProjects(singleJson);
    expect(importedSingle.ok).toBe(true);
    if (importedSingle.ok) {
      expect(importedSingle.projects).toHaveLength(1);
      // Should receive a fresh UUID & deduped name so existing saved project is never overwritten
      expect(importedSingle.projects[0].id).not.toBe(p1.id);
      expect(importedSingle.projects[0].name).toContain('Cloud Topology');
    }

    const backupJson = serializeAllProjectsBackup(p1);
    const importedBackup = parseImportedProjects(backupJson);
    expect(importedBackup.ok).toBe(true);
    if (importedBackup.ok) {
      expect(importedBackup.projects).toHaveLength(1);
    }

    const badImport = parseImportedProjects('{"foo":"bar"}');
    expect(badImport.ok).toBe(false);
  });
});
