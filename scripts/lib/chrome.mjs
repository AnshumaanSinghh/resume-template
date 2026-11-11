// Headless Chrome (or Edge / Chromium / Brave) renders the PDF and the social image.
// No Puppeteer: we only need two command-line flags that every Chromium ships with.

import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ],
    win32: [
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
  }[process.platform] ?? [];
  for (const c of candidates) if (c && existsSync(c)) return c;
  if (process.platform !== 'win32') {
    for (const bin of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try {
        const found = execFileSync('which', [bin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (found) return found;
      } catch {
        /* not installed */
      }
    }
  }
  return null;
}

async function run(chrome, args, { timeout = 90_000 } = {}) {
  const profile = await mkdtemp(path.join(tmpdir(), 'resume-chrome-'));
  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    // GitHub's Ubuntu runners restrict user namespaces, which Chrome's sandbox needs.
    ...(process.env.CI || process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    ...args,
  ];
  try {
    await new Promise((resolve, reject) => {
      execFile(chrome, flags, { timeout }, (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve()));
    });
  } finally {
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

const fileUrl = (file, query = '') => `${pathToFileURL(path.resolve(file)).href}${query}`;

export async function printPdf(chrome, htmlFile, pdfFile) {
  await rm(pdfFile, { force: true });
  await run(chrome, ['--no-pdf-header-footer', '--virtual-time-budget=4000', `--print-to-pdf=${path.resolve(pdfFile)}`, fileUrl(htmlFile)]);
  const info = await stat(pdfFile).catch(() => null);
  if (!info?.size) throw new Error('Chrome did not write the PDF');
}

export async function screenshot(chrome, htmlFile, pngFile, { width = 1200, height = 630, scale = 1, query = '', budget = 3000 } = {}) {
  await rm(pngFile, { force: true });
  await run(chrome, [
    `--screenshot=${path.resolve(pngFile)}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    `--virtual-time-budget=${budget}`,
    fileUrl(htmlFile, query),
  ]);
  const info = await stat(pngFile).catch(() => null);
  if (!info?.size) throw new Error('Chrome did not write the screenshot');
}

/** Page count straight from the PDF bytes (Chrome writes plain /Type /Page objects). */
export function pdfPageCount(buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}
