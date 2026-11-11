#!/usr/bin/env node
// Build the site: resume.json -> dist/ (index.html, resume.pdf, resume.txt, contact.vcf, og.png).
//
//   node scripts/build.mjs                 build everything (PDF + og.png need Chrome/Edge)
//   node scripts/build.mjs --no-render     skip the PDF and image (fast; the PDF button prints instead)
//   node scripts/build.mjs --input other.json --out public-site

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, pdfPageCount, printPdf, screenshot } from './lib/chrome.mjs';
import { renderSite } from './lib/render.mjs';
import { scoreResume } from './lib/score.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function loadResume(file) {
  const raw = await readFile(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    const pos = Number(/position (\d+)/.exec(err.message)?.[1]);
    if (Number.isFinite(pos)) {
      const before = raw.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      throw new Error(`${path.basename(file)} is not valid JSON (line ${line}, column ${col}): ${err.message}`);
    }
    throw new Error(`${path.basename(file)} is not valid JSON: ${err.message}`);
  }
}

const DEMO_URL = 'https://anshumaansinghh.github.io/resume-template/';
const DEMO_REPO = 'anshumaansinghh/resume-template';

/**
 * The public address of the site, used for the QR code, canonical link and social card.
 * Order: SITE_URL env (custom domains) > meta.canonical > the GitHub Pages address of the
 * repo being built. A copy of the template that still carries the demo URL gets its own.
 */
export function resolveSiteUrl(resume, env = process.env) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/?$/, '/');
  const set = resume.meta?.canonical;
  const repo = env.GITHUB_REPOSITORY?.toLowerCase();
  const isDemoCopy = set === DEMO_URL && repo && repo !== DEMO_REPO;
  if (set && !isDemoCopy) return set;
  if (!repo) return set ?? null;
  const [owner, name] = repo.split('/');
  const host = `${owner}.github.io`;
  return name === host ? `https://${host}/` : `https://${host}/${name}/`;
}

export async function build({
  input = path.join(ROOT, 'resume.json'),
  out = path.join(ROOT, 'dist'),
  render = true,
  now = new Date(),
  log = (msg) => console.log(msg),
} = {}) {
  const started = Date.now();
  const resume = await loadResume(input);
  const siteUrl = resolveSiteUrl(resume);
  if (siteUrl !== (resume.meta?.canonical ?? null)) {
    resume.meta = { ...resume.meta, canonical: siteUrl ?? undefined };
    if (siteUrl) log(`• Site URL: ${siteUrl}`);
  }
  const [css, js] = await Promise.all([readFile(path.join(ROOT, 'src/style.css'), 'utf8'), readFile(path.join(ROOT, 'src/app.js'), 'utf8')]);
  const chrome = render ? findChrome() : null;

  const write = async (pdf) => {
    const files = renderSite(resume, { now, css, js, pdf });
    await Promise.all(Object.entries(files).map(([name, body]) => writeFile(path.join(out, name), body)));
    return files;
  };

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(path.join(ROOT, 'public'), out, { recursive: true });
  await write(Boolean(chrome));

  const report = { out, pdf: false, pages: 0, og: false };
  if (chrome) {
    try {
      await printPdf(chrome, path.join(out, 'index.html'), path.join(out, 'resume.pdf'));
      report.pdf = true;
      report.pages = pdfPageCount(await readFile(path.join(out, 'resume.pdf')));
    } catch (err) {
      log(`! PDF skipped: ${err.message.split('\n')[0]}`);
      await write(false); // the PDF button falls back to the print dialog
    }
    try {
      await screenshot(chrome, path.join(out, 'og.html'), path.join(out, 'og.png'), { width: 1200, height: 630 });
      report.og = true;
    } catch (err) {
      log(`! og.png skipped: ${err.message.split('\n')[0]}`);
    }
  } else if (render) {
    log('! Chrome, Edge or Chromium not found (set CHROME_PATH): skipping resume.pdf and og.png. The PDF button will open the print dialog.');
  }
  await rm(path.join(out, 'og.html'), { force: true });

  const s = scoreResume(resume);
  report.score = s;
  log(
    `✓ Built ${path.relative(process.cwd(), out) || '.'}/ in ${Date.now() - started} ms` +
      (report.pdf ? ` · resume.pdf ${report.pages} page${report.pages === 1 ? '' : 's'}` : '') +
      ` · resume score ${s.score}/${s.max}` +
      (s.score < s.max ? ' (run "npm run check" for fixes)' : ''),
  );
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  build({
    input: opt('--input') ? path.resolve(opt('--input')) : undefined,
    out: opt('--out') ? path.resolve(opt('--out')) : undefined,
    render: !args.includes('--no-render'),
  }).catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
