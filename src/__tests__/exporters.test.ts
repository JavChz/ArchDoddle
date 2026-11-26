import { describe, expect, it } from 'vitest';
import { generatePptxBlob } from '../exporters/pptxExporter';
import { exportToSvg } from '../exporters/svgExporter';
import { buildDocumentFromTemplate } from '../templates/starters';

describe('diagram exporters (SVG & PPTX)', () => {
  it('exports valid SVG and respects includeNotes flag', () => {
    const doc = buildDocumentFromTemplate('cloud-microservices')!;
    expect(doc).toBeTruthy();

    const svgWithNotes = exportToSvg(doc, {
      includeNotes: true,
      includeBackground: true,
    });
    expect(svgWithNotes.startsWith('<svg ')).toBe(true);
    expect(svgWithNotes).toContain('API Gateway');
    expect(svgWithNotes).toContain('Latency &amp; SLA Target');

    const svgWithoutNotes = exportToSvg(doc, {
      includeNotes: false,
      includeBackground: false,
    });
    expect(svgWithoutNotes).toContain('API Gateway');
    expect(svgWithoutNotes).not.toContain('Latency &amp; SLA Target');
  });

  it('generates a valid non-empty editable PowerPoint (.pptx) Blob with speaker notes', async () => {
    const doc = buildDocumentFromTemplate('event-data-pipeline')!;
    const blob = await generatePptxBlob(doc, {
      mode: 'editable',
      notesMode: 'speaker-notes',
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(5000);

    // .pptx is a ZIP archive starting with 'PK' (0x50, 0x4B)
    const buf = await blob.arrayBuffer();
    const header = new Uint8Array(buf.slice(0, 2));
    expect(header[0]).toBe(0x50);
    expect(header[1]).toBe(0x4b);
  });

  it('generates a valid editable PowerPoint (.pptx) Blob with notes rendered on-slide', async () => {
    const doc = buildDocumentFromTemplate('executive-context')!;
    const blob = await generatePptxBlob(doc, {
      mode: 'editable',
      notesMode: 'on-slide',
    });
    expect(blob.size).toBeGreaterThan(5000);
  });
});
