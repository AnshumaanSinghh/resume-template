#!/usr/bin/env node
// Live preview: rebuilds when resume.json, src/ or public/ change and reloads the browser.
//
//   node scripts/dev.mjs              http://localhost:4321
//   node scripts/dev.mjs --pdf        also re-render resume.pdf on every change (slower)
//   PORT=8080 node scripts/dev.mjs

import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { build, ROOT } from './build.mjs';

const OUT = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4321;
const RENDER = process.argv.includes('--pdf');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.vcf': 'text/vcard; charset=utf-8',
};

const clients = new Set();
const RELOAD = `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>`;

async function rebuild() {
  try {
    await build({ render: RENDER });
    for (const res of clients) res.write('data: reload\n\n');
  } catch (err) {
    console.error(`✗ ${err.message}`);
  }
}

await rebuild();

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__reload') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = path.join(OUT, decodeURIComponent(url.pathname));
  if (!file.startsWith(OUT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    let body = await readFile(file);
    const ext = path.extname(file);
    if (ext === '.html') {
      // The page's CSP only trusts its own inline scripts; drop it locally so live reload can run.
      body = body
        .toString()
        .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '')
        .replace('</body>', `${RELOAD}</body>`);
    }
    res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Live preview  http://localhost:${PORT}\n  Edit resume.json (or src/) and the page reloads. Ctrl+C to stop.\n`);
});

let timer;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 120);
};
for (const target of ['resume.json', 'src', 'public']) {
  watch(path.join(ROOT, target), { recursive: true }, schedule);
}
