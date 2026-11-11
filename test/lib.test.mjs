import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnnotator, findMetrics, skillGroups, termRegex } from '../scripts/lib/annotate.mjs';
import { formatDate, formatDuration, formatRange, monthsBetween, parseDate, totalExperienceMonths } from '../scripts/lib/dates.mjs';
import { encodeQr, qrSvg } from '../scripts/lib/qr.mjs';
import { escapeHtml, initials, prettyUrl, safeUrl, slug, splitName, wordCount } from '../scripts/lib/text.mjs';

const NOW = new Date(Date.UTC(2026, 10, 11)); // 11 Nov 2026

test('dates: parse, format and ranges', () => {
  assert.deepEqual(parseDate('2024-04'), { year: 2024, month: 4 });
  assert.deepEqual(parseDate('2024'), { year: 2024, month: null });
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('April 2024'), undefined);
  assert.equal(parseDate('2024-13'), undefined);
  assert.equal(formatDate('2024-04-15'), 'Apr 2024');
  assert.equal(formatDate('2024-04', { long: true }), 'April 2024');
  assert.equal(formatRange('2024-04'), 'Apr 2024 – Present');
  assert.equal(formatRange('2022-07', '2024-03'), 'Jul 2022 – Mar 2024');
  assert.equal(formatRange('2022-07', '2022-07'), 'Jul 2022');
  assert.equal(formatRange(undefined, '2022-06'), 'Jun 2022');
});

test('dates: inclusive month counting, like LinkedIn', () => {
  assert.equal(monthsBetween('2022-07', '2024-03'), 21);
  assert.equal(formatDuration(21), '1 yr 9 mos');
  assert.equal(monthsBetween('2024-04', undefined, NOW), 32);
  assert.equal(formatDuration(32), '2 yrs 8 mos');
  assert.equal(formatDuration(12), '1 yr');
  assert.equal(formatDuration(1), '1 mo');
  assert.equal(monthsBetween('2025-01', '2024-01'), 0);
});

test('dates: total experience merges overlaps and skips internships', () => {
  const work = [
    { position: 'Engineer', startDate: '2024-01' },
    { position: 'Contractor', startDate: '2023-06', endDate: '2024-03' }, // overlaps the role above
    { position: 'Software Engineering Intern', startDate: '2021-05', endDate: '2021-07' },
  ];
  assert.equal(totalExperienceMonths(work, { now: NOW }), monthsBetween('2023-06', undefined, NOW));
  assert.equal(totalExperienceMonths(work, { now: NOW, countInternships: true }), monthsBetween('2023-06', undefined, NOW) + 3);
});

test('text helpers', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(slug('Node.js'), 'node-js');
  assert.equal(slug('C++'), 'c-plus-plus');
  assert.equal(slug('C#'), 'c-sharp');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('github.com/me'), 'https://github.com/me');
  assert.equal(prettyUrl('https://www.linkedin.com/in/me/'), 'linkedin.com/in/me');
  assert.deepEqual(splitName('Mary Ann Lee'), ['Mary Ann', 'Lee']);
  assert.equal(initials('Aarav Mehta'), 'AM');
  assert.equal(wordCount('Cut p95 latency by 77% in Node.js.'), 7);
});

test('receipts: whole-term, case-sensitive matching', () => {
  const re = (t) => termRegex(t);
  assert.equal('JavaScript and Java'.match(re('Java')).length, 1);
  assert.equal('Wrote C++ and C'.match(re('C')).length, 1);
  assert.equal('Wrote C++ and C'.match(re('C++')).length, 1);
  assert.ok(re('Node.js').test('Built it in Node.js.'));
  assert.equal('PostgreSQL and SQL'.match(re('SQL')).length, 1);
  assert.equal('React reacted'.match(re('React')).length, 1);
});

test('receipts: annotate marks skills, counts places and escapes text', () => {
  const resume = {
    skills: [{ name: 'Langs', keywords: ['TypeScript', 'Go', 'PostgreSQL'] }, { name: 'Solo' }],
    meta: { template: { aliases: { PostgreSQL: ['Postgres'] } } },
  };
  const ann = createAnnotator(resume);
  const html = ann.annotate('Built <b> with TypeScript and Postgres, cut cost 31%', 'w0-0');
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<mark class="kw" data-sk="sk-typescript">TypeScript<\/mark>/);
  assert.match(html, /<mark class="kw" data-sk="sk-postgresql">Postgres<\/mark>/);
  assert.match(html, /<strong class="metric">31%<\/strong>/);
  ann.annotate('More TypeScript', 'w0-1');
  ann.annotate('TypeScript again in the same bullet', 'w0-1');
  assert.equal(ann.count('sk-typescript'), 2);
  assert.equal(ann.count('sk-go'), 0);
  assert.match(ann.tag('typescript', 'p0'), /data-sk="sk-typescript"/);
  assert.equal(ann.count('sk-typescript'), 3);
  assert.deepEqual(
    skillGroups(resume).map((g) => [g.name, g.skills.map((s) => s.name)]),
    [['Langs', ['TypeScript', 'Go', 'PostgreSQL']], ['', ['Solo']]],
  );
});

test('metrics: numbers with units, not years or identifiers', () => {
  const pick = (s) => findMetrics(s).map((r) => s.slice(r.s, r.e));
  assert.deepEqual(pick('cut p95 latency from 820 ms to 190 ms'), ['820 ms', '190 ms']);
  assert.deepEqual(pick('3M+ payments, $18k a month, 1,200+ admins, 99.7% caught'), ['3M+', '$18k', '1,200+', '99.7%']);
  assert.deepEqual(pick('from 2 hours to 15 minutes, 12× faster'), ['2 hours', '15 minutes', '12×']);
  assert.deepEqual(pick('moved to S3 and EC2 in 2023'), []);
  assert.deepEqual(pick('saved 35 hours a week across 14 services'), ['35 hours', '14']);
});

test('qr: structure is valid for every version range we emit', () => {
  for (const text of ['https://example.com/', 'x'.repeat(120), 'https://example.com/' + 'y'.repeat(300)]) {
    const qr = encodeQr(text);
    assert.equal(qr.size, qr.version * 4 + 17);
    const m = qr.modules;
    // three finder patterns: dark 7x7 ring with a dark 3x3 core
    for (const [x, y] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]]) {
      assert.equal(m[y][x], true);
      assert.equal(m[y + 1][x + 1], false);
      assert.equal(m[y + 3][x + 3], true);
    }
    // timing pattern alternates
    for (let i = 8; i < qr.size - 8; i++) assert.equal(m[6][i], i % 2 === 0);
    // dark module
    assert.equal(m[qr.size - 8][8], true);
    // format bits read back (BCH-checked) give the chosen ECC level and mask
    let bits = 0;
    for (let i = 0; i <= 5; i++) bits |= (m[i][8] ? 1 : 0) << i;
    bits |= (m[7][8] ? 1 : 0) << 6;
    bits |= (m[8][8] ? 1 : 0) << 7;
    bits |= (m[8][7] ? 1 : 0) << 8;
    for (let i = 9; i < 15; i++) bits |= (m[8][14 - i] ? 1 : 0) << i;
    const data = (bits ^ 0x5412) >>> 10;
    assert.equal(data & 7, qr.mask);
    assert.equal(['M', 'L', 'H', 'Q'][data >>> 3], qr.ecl);
  }
  assert.match(qrSvg('https://example.com/'), /^<svg[^>]+viewBox="0 0 33 33"/);
  assert.throws(() => encodeQr('z'.repeat(5000)), /too long/);
});
