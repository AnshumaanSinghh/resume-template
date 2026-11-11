#!/usr/bin/env node
// Score resume.json and print what to fix.
//
//   node scripts/check.mjs                 report for resume.json
//   node scripts/check.mjs other.json      report for another file
//   node scripts/check.mjs --min 85        exit 1 when the score is below 85 (for CI)
//   node scripts/check.mjs --json          machine-readable output
//   node scripts/check.mjs --markdown      a table for the GitHub Actions job summary

import path from 'node:path';
import { loadResume, ROOT } from './build.mjs';
import { scoreResume } from './lib/score.mjs';

const args = process.argv.slice(2);
const minIdx = args.indexOf('--min');
const min = minIdx >= 0 ? Number(args[minIdx + 1]) : 0;
const file = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--min') ?? path.join(ROOT, 'resume.json'));

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint('1');
const dim = paint('2');
const green = paint('32');
const yellow = paint('33');
const red = paint('31');

try {
  const resume = await loadResume(file);
  const r = scoreResume(resume);
  if (args.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else if (args.includes('--markdown')) {
    // For the GitHub Actions job summary.
    const esc = (s) => String(s).replace(/\|/g, '\\|');
    console.log(`## Resume score: ${r.score}/${r.max} (${r.grade})\n`);
    console.log('| Check | Score | Notes |\n|---|---:|---|');
    for (const c of r.categories) {
      console.log(`| ${c.score === c.max ? '✅' : '⚠️'} ${esc(c.label)} | ${c.score}/${c.max} | ${c.notes.map(esc).join('<br>')} |`);
    }
    console.log('\n<sub>Heuristic checks from common recruiter and ATS guidance. Run `npm run check` locally for the same report.</sub>');
  } else {
    const tone = r.score >= 85 ? green : r.score >= 70 ? yellow : red;
    const filled = Math.round((r.score / r.max) * 30);
    console.log('');
    console.log(`  ${bold('Resume score')}  ${tone(bold(`${r.score}/${r.max}`))}  ${tone('█'.repeat(filled))}${dim('░'.repeat(30 - filled))}  ${tone(r.grade)}`);
    console.log(dim(`  ${path.relative(process.cwd(), file) || file} · ${r.bullets} bullets checked`));
    console.log('');
    const width = Math.max(...r.categories.map((c) => c.label.length));
    for (const c of r.categories) {
      const ok = c.score === c.max;
      console.log(`  ${ok ? green('✓') : yellow('!')} ${c.label.padEnd(width)}  ${(ok ? green : yellow)(`${String(c.score).padStart(2)}/${c.max}`)}`);
      for (const note of c.notes) console.log(`      ${dim('•')} ${ok ? dim(`tip: ${note}`) : note}`);
    }
    console.log('');
    console.log(dim('  Heuristics from common recruiter and ATS guidance. A high score means clean, scannable,'));
    console.log(dim('  evidence-backed content. It cannot predict how a specific ATS or recruiter will rank you.'));
    console.log('');
  }
  if (r.score < min) {
    console.error(red(`✗ Score ${r.score} is below the minimum of ${min}.`));
    process.exit(1);
  }
} catch (err) {
  console.error(red(`✗ ${err.message}`));
  process.exit(1);
}
