import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolveSiteUrl } from '../scripts/build.mjs';
import { toPlainText } from '../scripts/lib/plaintext.mjs';
import { renderSite } from '../scripts/lib/render.mjs';
import { isActionVerb, scoreResume } from '../scripts/lib/score.mjs';
import { toVCard } from '../scripts/lib/vcard.mjs';

const root = new URL('../', import.meta.url);
const load = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const NOW = new Date(Date.UTC(2026, 10, 11));
const css = await readFile(new URL('src/style.css', root), 'utf8');
const js = await readFile(new URL('src/app.js', root), 'utf8');

test('the demo resume scores 100 with no fixes', async () => {
  const r = scoreResume(await load('test/fixtures/demo.json'));
  assert.equal(r.score, 100, JSON.stringify(r.categories.filter((c) => c.score < c.max), null, 2));
  assert.deepEqual(r.categories.flatMap((c) => c.notes), []);
});

test('the original v1 template content scores low, with concrete fixes', async () => {
  const r = scoreResume(await load('test/fixtures/v1-template.json'));
  assert.ok(r.score < 60, `expected < 60, got ${r.score}`);
  const notes = r.categories.flatMap((c) => c.notes).join('\n');
  assert.match(notes, /first-person/);
  assert.match(notes, /"passionate"/);
  assert.match(notes, /has no number/);
  assert.match(notes, /startDate/);
});

test('action verbs: past, present and weak openers', () => {
  for (const w of ['led', 'built', 'shipped', 'lead', 'builds', 'containerized', 'cut']) assert.ok(isActionVerb(w), w);
  for (const w of ['responsible', 'worked', 'helped', 'was', 'utilized', 'the']) assert.ok(!isActionVerb(w), w);
});

test('render: complete page with sections, receipts and metadata', async () => {
  const resume = await load('test/fixtures/demo.json');
  const files = renderSite(resume, { now: NOW, css, js, pdf: true });
  const html = files['index.html'];
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<h1 id="name" class="name">Aarav <em>Mehta<\/em><\/h1>/);
  for (const id of ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'awards', 'languages', 'interests']) {
    assert.match(html, new RegExp(`<section id="${id}"`), id);
  }
  assert.match(html, /<button type="button" class="chip" data-sk="sk-typescript"[^>]*data-count="3"/);
  assert.match(html, /<strong class="metric">820 ms<\/strong>/);
  assert.match(html, /data-pdf="true"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/anshumaansinghh\.github\.io\/resume-template\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/anshumaansinghh\.github\.io\/resume-template\/og\.png">/);
  assert.match(html, /<figure class="qr print-only"><svg/);
  assert.match(html, /<p class="print-only sg-print"><b>Languages:<\/b> TypeScript, Python, Java, SQL<\/p>/);
  // no external requests: every src/href that is not a link-out stays relative
  for (const m of html.matchAll(/<(?:script|link|img)[^>]+(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(https?:)?\/\//.test(m[1]) || /rel="canonical"/.test(m[0]), `external asset: ${m[1]}`);
  }
});

test('render: JSON-LD is valid ProfilePage data', async () => {
  const html = renderSite(await load('test/fixtures/demo.json'), { now: NOW, css, js })['index.html'];
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  assert.equal(ld['@type'], 'ProfilePage');
  assert.equal(ld.mainEntity['@type'], 'Person');
  assert.equal(ld.mainEntity.name, 'Aarav Mehta');
  assert.equal(ld.mainEntity.worksFor.name, 'Contoso Pay');
  assert.ok(ld.mainEntity.knowsAbout.includes('Kubernetes'));
});

test('render: CSP hashes match the inline script and style exactly', async () => {
  const html = renderSite(await load('test/fixtures/demo.json'), { now: NOW, css, js })['index.html'];
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const hash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
  const scripts = [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((m) => m[1]);
  const styles = [...html.matchAll(/<style>(.*?)<\/style>/gs)].map((m) => m[1]);
  assert.equal(scripts.length, 2);
  assert.equal(styles.length, 1);
  for (const s of scripts) assert.ok(csp.includes(hash(s)), 'script hash missing');
  assert.ok(csp.includes(hash(styles[0])), 'style hash missing');
  assert.doesNotMatch(html, / style="/, 'inline style attributes would be blocked by the CSP');
  assert.doesNotMatch(csp, /unsafe-inline/);
});

test('render: hostile input is escaped everywhere', () => {
  const evil = '"><script>alert(1)</script>';
  const resume = {
    basics: { name: `Eve ${evil}`, label: evil, email: 'e@x.io', summary: evil, url: 'javascript:alert(1)', profiles: [{ network: evil, url: 'https://x.io' }] },
    work: [{ name: evil, position: evil, startDate: '2024-01', highlights: [evil], url: 'javascript:alert(2)' }],
    skills: [{ name: evil, keywords: [evil] }],
    meta: { template: { accent: { light: 'red;}body{display:none' }, status: evil } },
  };
  const html = renderSite(resume, { now: NOW, css: '', js: '' })['index.html'];
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /display:none/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('render: works with only a name', () => {
  const files = renderSite({ basics: { name: 'Solo' } }, { now: NOW, css: '', js: '' });
  assert.match(files['index.html'], /<h1 id="name" class="name">Solo<\/h1>/);
  assert.doesNotMatch(files['index.html'], /<section id="experience"/);
  assert.equal(files['resume.txt'], 'Solo\n');
  assert.throws(() => renderSite({ basics: {} }), /basics\.name/);
});

test('plain text: standard headings in reading order', async () => {
  const text = toPlainText(await load('test/fixtures/demo.json'));
  const order = ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'SKILLS', 'EDUCATION', 'CERTIFICATIONS', 'AWARDS', 'LANGUAGES', 'INTERESTS'];
  const at = order.map((h) => text.indexOf(`\n${h}\n`));
  assert.ok(at.every((i) => i > 0), JSON.stringify(at));
  assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(text, /^Aarav Mehta\nSenior Software Engineer · Payments & Platform\naarav@example\.com \| \+44 7700 900461 \| London, UK/);
  assert.match(text, /Senior Software Engineer, Contoso Pay \(London, UK\)\nApr 2024 – Present\n- Rebuilt/);
  // every bullet on its own line
  const resume = await load('test/fixtures/demo.json');
  for (const h of [...resume.work.flatMap((w) => w.highlights), ...resume.projects.flatMap((p) => p.highlights)]) {
    assert.ok(text.includes(`\n- ${h}\n`), `bullet not on its own line: ${h}`);
  }
  assert.doesNotMatch(text, /,- |\.,/);
  assert.doesNotMatch(text, /<|&amp;/);
});

test('site URL: copies of the template never point at the demo', () => {
  const demo = { meta: { canonical: 'https://anshumaansinghh.github.io/resume-template/' } };
  const mine = { meta: { canonical: 'https://me.dev/' } };
  assert.equal(resolveSiteUrl(demo, { GITHUB_REPOSITORY: 'AnshumaanSinghh/resume-template' }), demo.meta.canonical);
  assert.equal(resolveSiteUrl(demo, { GITHUB_REPOSITORY: 'Jane-Doe/cv' }), 'https://jane-doe.github.io/cv/');
  assert.equal(resolveSiteUrl({}, { GITHUB_REPOSITORY: 'jane/jane.github.io' }), 'https://jane.github.io/');
  assert.equal(resolveSiteUrl(mine, { GITHUB_REPOSITORY: 'jane/cv' }), 'https://me.dev/');
  assert.equal(resolveSiteUrl(mine, { SITE_URL: 'https://cv.jane.dev' }), 'https://cv.jane.dev/');
  assert.equal(resolveSiteUrl({}, {}), null);
  assert.equal(resolveSiteUrl(demo, {}), demo.meta.canonical);
});

test('vCard: valid 3.0 card with escaped fields', async () => {
  const card = toVCard(await load('test/fixtures/demo.json'));
  assert.match(card, /^BEGIN:VCARD\r\nVERSION:3\.0\r\nN:Mehta;Aarav;;;\r\nFN:Aarav Mehta\r\n/);
  assert.match(card, /\r\nTEL;TYPE=CELL:\+44 7700 900461\r\n/);
  assert.match(card, /\r\nORG:Contoso Pay\r\n/);
  assert.match(card, /END:VCARD\r\n$/);
  assert.match(toVCard({ basics: { name: 'A, B; C' } }), /FN:A\\, B\\; C/);
});
