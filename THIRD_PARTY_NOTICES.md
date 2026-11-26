# Third-Party Open-Source Notices

ArchDoddle is licensed under the **MIT License** (see [LICENSE](./LICENSE)). It bundles the following direct runtime libraries under compatible permissive open-source licenses:

| Package | Version | License | Role |
|---|---|---|---|
| `react` | 19.x | MIT | UI component model |
| `react-dom` | 19.x | MIT | Browser DOM rendering |
| `lucide-react` | 1.x | ISC | Crisp vector UI icons |
| `pptxgenjs` | 4.x | MIT | Client-side PowerPoint (`.pptx`) generation |
| `jszip` *(transitive via `pptxgenjs`)* | 3.x | MIT (chosen under `MIT OR GPL-3.0-or-later`) | OOXML `.pptx` zip packaging |
| `pako` *(transitive via `jszip`)* | 1.x | MIT AND Zlib | Deflate compression |

All build and test tooling (`vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `vitest`, `jsdom`) are likewise licensed under MIT or Apache-2.0.
