import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Plugin, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function collectDistFiles(dir: string, baseDir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDistFiles(full, baseDir, acc);
    } else {
      const rel = path.relative(baseDir, full).split(path.sep).join('/');
      if (rel !== 'sw.js') {
        acc.push(`./${rel}`);
      }
    }
  }
  return acc;
}

function archdoddlePwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'archdoddle-pwa-sw',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!fs.existsSync(outDir)) return;
      const assets = Array.from(new Set(['./', ...collectDistFiles(outDir, outDir)])).sort();
      const hash = crypto
        .createHash('sha256')
        .update(assets.join('\n'))
        .digest('hex')
        .slice(0, 8);
      const cacheName = `archdoddle-v-${hash}`;

      const swSource = `const CACHE_NAME = '${cacheName}';
const PRECACHE_ASSETS = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('archdoddle-') && k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;
      fs.writeFileSync(path.join(outDir, 'sw.js'), swSource, 'utf8');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), archdoddlePwaPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
