# ArchDoddle

**ArchDoddle** is a 100% client-side, local-first software architecture diagramming studio built for technical consultants and engineers who need to externalize system designs faster than PowerPoint — with zero servers, zero logins, and native export directly to GitHub Pages, editable PowerPoint (`.pptx`), SVG, PNG, and portable JSON.

## Why HTML5 Canvas 2D + React + TypeScript?
- **60–120 FPS Vector Engine**: Custom HTML5 Canvas 2D renderer with HiDPI scaling, viewport-culled grids, rounded orthogonal Manhattan routing, curved Bezier edges, smart alignment guides, and instant zoom/pan.
- **Zero-Bridge Browser Exports**: Native client-side rendering to editable **PowerPoint (`.pptx`)** slides via `pptxgenjs`, standalone **SVG**, high-resolution **PNG** (1x/2x/3x + clipboard copy), and portable **`.archdoddle.json`** project files.
- **Distinct Architecture Primitives**: Built specifically for software architecture & consulting decks (`Service`, `Database`, `Event Queue`, `External Cloud`, `User / Actor`, `Decision Gate`, `VPC / Boundary Zone`, and hideable `Consultant Notes`), rather than freehand sketching.

## Key Features
- **Always Starts Fresh**: Opens directly onto a brand-new blank project (`Untitled Architecture`), never cluttering your workspace on startup.
- **Multi-Project LocalStorage**: Auto-saves edited diagrams in browser `localStorage`. Open the **Projects** drawer (`Ctrl+O`) to switch projects, rename, duplicate, delete, load consulting starter templates, or import/backup `.archdoddle.json` files.
- **Hideable Consultant Notes**: Attach callout notes directly to components (`M`) or drop standalone notes (`N`). Collapse individual notes into compact badges or toggle **all notes on/off** globally (`P` or `Alt+N`) before client presentations. When exporting to PowerPoint, place notes directly in **Speaker Notes** so slides stay clean.
- **16:9 Presentation Slide Frame**: Toggle `F` to display a 1280×720 slide guide while designing.
- **4 Executive Palettes**: `Executive Slate`, `Blueprint Navy`, `Warm Consulting`, and `Midnight Ops`.

## Power-User Workflows

### Keyboard-Only Flow
| Shortcut | Action |
|---|---|
| `Shift + S / D / Q / C / U / G / Z / T / N` | Drop component or note at focal point immediately |
| `Ctrl + Arrow` | Spawn & connect next node in that direction + edit label |
| `M` | Attach a hideable Consultant Note to selected element |
| `P` or `Alt + N` | Show / Hide all Consultant Notes |
| `Alt + 1..6` | Convert selected shape (`Service`, `DB`, `Queue`, `Cloud`, `Actor`, `Decision`) |
| `Tab` / `Shift + Tab` | Cycle through visible elements |
| `Arrow` / `Shift + Arrow` | Nudge selected items (or pan canvas when nothing selected) |
| `Enter` / `F2` | Inline edit label/note |
| `Delete` / `Backspace` | Delete selected items & bound connectors |
| `Ctrl + K` or `/` | Open Command Palette |
| `Ctrl + O` / `Ctrl + E` | Open Projects Drawer / Export Modal |

### Mouse-Only Flow
- **Double-click empty canvas**: Drop a `Service` box and edit its name immediately.
- **Hover `+` port circles**: Click to spawn a connected node, or drag to wire to any node.
- **Drag empty space**: Marquee selection (works inside VPC zones too — zones grab on their header/border).
- **Right-click drag / Middle-drag**: Grab & pan canvas; short right-click opens full Context Menu.
- **Scroll wheel**: Smooth cursor-centered zoom.
- **Eraser tool (`X`)**: Sweep across items to delete cleanly in one undoable step.

## Local Development

```bash
npm install
npm run dev
```

Run checks & tests:
```bash
npm run typecheck
npm run test
npm run build
```

## Deploying to GitHub Pages

1. `vite.config.ts` uses `base: './'` so static assets resolve on both root domains and `/<repo>/` subpaths.
2. Push to `main` — the included `.github/workflows/deploy.yml` workflow builds `dist/` and deploys automatically via GitHub Actions Pages.
3. In your GitHub repository settings, set **Settings → Pages → Source** to **GitHub Actions**.
