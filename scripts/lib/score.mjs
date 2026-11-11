// Resume score: a heuristic lint of the *content* against common recruiter and ATS guidance.
// It cannot see your layout or a specific ATS's ranking; it checks the things you can fix in resume.json.

import { createAnnotator, skillGroups } from './annotate.mjs';
import { isValidDate, parseDate, sortKey } from './dates.mjs';
import { formatLocation, isEmail, wordCount } from './text.mjs';

const VERBS = new Set(
  `accelerated achieved acquired adapted added addressed administered advanced advised advocated aligned allocated
  analysed analyzed anchored applied architected arranged assembled assessed audited authored automated balanced
  benchmarked boosted bootstrapped budgeted built calculated captured catalogued centralised centralized championed
  charted clarified coached coded collaborated combined compiled completed composed computed conceived condensed
  conducted configured consolidated constructed consulted containerised containerized contributed converted coordinated
  corrected crafted created curated customised customized cut debugged decreased defined delivered deployed designed
  detected developed devised diagnosed digitised digitized directed discovered documented doubled drafted drove earned
  edited educated eliminated enabled encrypted engineered enhanced established evaluated exceeded executed expanded
  expedited experimented extended extracted facilitated fixed forecasted formalised formalized formed formulated
  fostered founded generated grew guided halved harmonised harmonized headed hired identified implemented improved
  increased influenced initiated innovated inspected installed instituted instrumented integrated interviewed introduced
  invented investigated launched led lifted localised localized lowered maintained managed mapped maximised maximized
  measured mentored merged migrated minimised minimized modeled modelled modernised modernized monitored moved negotiated
  onboarded operated optimised optimized orchestrated organised organized originated outperformed overhauled owned
  partnered patched pioneered planned prioritised prioritized produced profiled programmed promoted prototyped
  provisioned published quantified raised ran rearchitected rebuilt recruited redesigned reduced refactored reengineered
  remodeled removed reorganised reorganized repaired replaced reported researched resolved restored restructured
  revamped reviewed revised rewrote saved scaled scoped secured shipped shortened simplified slashed solved sourced
  spearheaded sped stabilised stabilized standardised standardized steered streamlined strengthened structured
  supervised surpassed synthesised synthesized systematised systematized taught tested tracked trained transformed
  translated tripled troubleshot tuned uncovered unified unlocked upgraded validated verified visualised visualized won wrote`
    .split(/\s+/)
    .filter(Boolean),
);
// Present-tense forms for current roles ("Lead", "Builds", "Own").
const PRESENT = new Set(
  `lead build write drive grow cut run ship own design develop deliver launch scale mentor manage architect automate
  maintain migrate optimise optimize reduce improve increase create implement partner coach plan teach win set speed
  steer head found found shape define`.split(/\s+/).filter(Boolean),
);
for (const v of VERBS) {
  if (v.endsWith('ied')) PRESENT.add(`${v.slice(0, -3)}y`);
  else if (v.endsWith('ed')) {
    PRESENT.add(v.slice(0, -2));
    PRESENT.add(v.slice(0, -1));
  }
}

const WEAK_STARTS = new Set(
  `responsible worked helped assisted participated involved tasked handled did was were am is are have has had duties
  various my i we our the a an in on for with using used utilized utilised leveraged supported`.split(/\s+/).filter(Boolean),
);

const CLICHES = [
  'responsible for', 'worked on', 'helped with', 'helped to', 'assisted with', 'assisted in', 'duties included',
  'tasked with', 'team player', 'hard-working', 'hardworking', 'hard working', 'detail-oriented', 'go-getter',
  'results-driven', 'self-starter', 'self starter', 'synergy', 'think outside the box', 'dynamic', 'passionate',
  'various', 'etc.', 'proven track record', 'fast-paced', 'best of breed', 'guru', 'ninja', 'rockstar',
];

const FIRST_PERSON = /(?<![\p{L}'’])(?:I|I'm|I’m|I've|I’ve|[Mm]e|[Mm]y|[Mm]ine|[Mm]yself)(?![\p{L}'’])/u;
const SPELLED_NUMBER = /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens?|hundreds?|thousands?|millions?|billions?|half|halved|halving|doubled|doubling|tripled|tripling|quadrupled)\b/i;

export function firstWord(text) {
  return (String(text ?? '').trim().match(/^[\p{L}][\p{L}'’-]*/u)?.[0] ?? '').toLowerCase();
}

export function isActionVerb(word) {
  const w = word.toLowerCase();
  if (!w || WEAK_STARTS.has(w)) return false;
  if (VERBS.has(w) || PRESENT.has(w)) return true;
  if (w.endsWith('s') && (PRESENT.has(w.slice(0, -1)) || PRESENT.has(w.slice(0, -2)))) return true;
  return w.length >= 5 && w.endsWith('ed'); // "Hardened", "Containerized"…
}

export function isQuantified(text) {
  const s = String(text ?? '').replace(/\b(?:19|20)\d{2}\b/g, '');
  return /\d/.test(s) || SPELLED_NUMBER.test(s);
}

/** All bullets with a human-readable location, for findings. */
export function collectBullets(resume) {
  const out = [];
  (resume.work ?? []).forEach((job, i) => {
    (job.highlights ?? []).forEach((text, j) => out.push({ text, where: `Experience › ${job.name || `role ${i + 1}`} › bullet ${j + 1}`, id: `w${i}-${j}` }));
  });
  (resume.projects ?? []).forEach((p, i) => {
    (p.highlights ?? []).forEach((text, j) => out.push({ text, where: `Projects › ${p.name || `project ${i + 1}`} › bullet ${j + 1}`, id: `p${i}` }));
  });
  (resume.volunteer ?? []).forEach((v, i) => {
    (v.highlights ?? []).forEach((text, j) => out.push({ text, where: `Volunteering › ${v.organization || `entry ${i + 1}`} › bullet ${j + 1}`, id: `v${i}-${j}` }));
  });
  return out.filter((b) => String(b.text ?? '').trim());
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const quote = (s, n = 48) => {
  const t = String(s).trim();
  return `"${t.length > n ? `${t.slice(0, n - 1)}…` : t}"`;
};

export function scoreResume(resume) {
  const b = resume.basics ?? {};
  const bullets = collectBullets(resume);
  const categories = [];
  const add = (id, label, max, score, notes) => categories.push({ id, label, max, score: Math.round(clamp(score, 0, max)), notes });

  // 1. Contact details
  {
    const notes = [];
    let s = 0;
    const need = (ok, pts, msg) => (ok ? (s += pts) : notes.push(msg));
    need(Boolean(b.name?.trim()), 2, 'Add your name (basics.name).');
    need(isEmail(b.email), 2, b.email ? `basics.email ${quote(b.email)} does not look like an email address.` : 'Add an email address (basics.email).');
    need(String(b.phone ?? '').replace(/\D/g, '').length >= 7, 2, 'Add a phone number with country code (basics.phone).');
    need(Boolean(formatLocation(b.location)), 2, 'Add a city and country (basics.location): recruiters filter by location.');
    need(Boolean(b.url || b.profiles?.some((p) => p.url)), 2, 'Add a link recruiters can check: LinkedIn, GitHub or a portfolio (basics.profiles).');
    add('contact', 'Contact details', 10, s, notes);
  }

  // 2. Headline and summary
  {
    const notes = [];
    let s = 0;
    if (b.label?.trim()) s += 3;
    else notes.push('Add a headline with your target title (basics.label), e.g. "Senior Software Engineer". ATS keyword matching starts here.');
    const words = wordCount(b.summary);
    if (!words) notes.push('Add a 2–4 sentence summary (basics.summary): who you are, your strongest proof, what you want next.');
    else if (words < 25) {
      s += 2;
      notes.push(`Summary is ${words} words; aim for 25–80 so it carries your key skills and one result.`);
    } else if (words > 80) {
      s += 2;
      notes.push(`Summary is ${words} words; trim to 80 or fewer. Recruiters skim it in seconds.`);
    } else s += 4;
    if (words && FIRST_PERSON.test(b.summary)) notes.push('Drop first-person words (I, my, me) from the summary; resumes are written in implied first person.');
    else if (words) s += 3;
    add('summary', 'Headline & summary', 10, s, notes);
  }

  const n = bullets.length;

  // 3. Action verbs
  {
    const notes = [];
    const weak = bullets.filter((x) => !isActionVerb(firstWord(x.text)));
    for (const x of weak.slice(0, 6)) notes.push(`${x.where} starts with ${quote(firstWord(x.text) || x.text, 24)}. Lead with a strong verb: Built, Led, Cut, Shipped…`);
    if (!n) notes.push('Add achievement bullets (work[].highlights). They carry most of a resume’s weight.');
    const ratio = n ? (n - weak.length) / n : 0;
    add('verbs', 'Starts with action verbs', 15, 15 * Math.min(1, ratio / 0.9), notes);
  }

  // 4. Quantified impact
  {
    const notes = [];
    const plain = bullets.filter((x) => !isQuantified(x.text));
    const ratio = n ? (n - plain.length) / n : 0;
    if (n && ratio < 0.6) {
      notes.push(`${Math.round(ratio * 100)}% of bullets have a number. Aim for 60%+: time saved, %, users, money, latency.`);
      for (const x of plain.slice(0, 4)) notes.push(`${x.where} has no number: ${quote(x.text)}`);
    }
    add('metrics', 'Quantified impact', 15, 15 * Math.min(1, ratio / 0.6), notes);
  }

  // 5. Bullet length
  {
    const notes = [];
    const bad = bullets.filter((x) => {
      const w = wordCount(x.text);
      return w < 8 || w > 35;
    });
    for (const x of bad.slice(0, 4)) {
      const w = wordCount(x.text);
      notes.push(`${x.where} is ${w} words; ${w < 8 ? 'add the result or the scale' : 'split it or cut it to under 35'}.`);
    }
    add('length', 'Bullet length (8–35 words)', 10, n ? 10 * ((n - bad.length) / n) : 0, notes);
  }

  // 6. Clichés and weak phrases
  {
    const notes = [];
    const texts = [{ where: 'Summary', text: b.summary }, ...bullets, ...(resume.work ?? []).map((w, i) => ({ where: `Experience › ${w.name || i + 1} › summary`, text: w.summary }))];
    let hits = 0;
    for (const t of texts) {
      const lower = String(t.text ?? '').toLowerCase();
      for (const phrase of CLICHES) {
        const re = new RegExp(`(?<![\\p{L}])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
        if (re.test(lower)) {
          hits++;
          if (notes.length < 6) notes.push(`${t.where} uses ${quote(phrase)}. Show it with a result instead.`);
        }
      }
    }
    add('cliches', 'No clichés or filler', 10, 10 - hits * 2, notes);
  }

  // 7. Skills backed by evidence
  {
    const notes = [];
    const ann = createAnnotator(resume, { metrics: false });
    (resume.work ?? []).forEach((job, i) => {
      ann.scan(job.summary, `w${i}-s`);
      (job.highlights ?? []).forEach((h, j) => ann.scan(h, `w${i}-${j}`));
    });
    (resume.projects ?? []).forEach((p, i) => {
      [p.description, ...(p.highlights ?? [])].forEach((t) => ann.scan(t, `p${i}`));
      (p.keywords ?? []).forEach((k) => ann.tag(k, `p${i}`));
    });
    (resume.volunteer ?? []).forEach((v, i) => (v.highlights ?? []).forEach((h, j) => ann.scan(h, `v${i}-${j}`)));
    const all = skillGroups(resume).flatMap((g) => g.skills);
    const orphans = all.filter((s) => ann.count(s.id) === 0);
    if (!all.length) notes.push('List your skills (skills[].keywords). ATS keyword matching depends on them.');
    else if (all.length < 6) notes.push(`Only ${all.length} skills listed; most job posts match on 8–25.`);
    if (orphans.length) notes.push(`No receipts for: ${orphans.map((s) => s.name).join(', ')}. Mention each in a bullet or project, or drop it.`);
    const ratio = all.length ? (all.length - orphans.length) / all.length : 0;
    add('skills', 'Skills backed by evidence', 10, (all.length >= 6 ? 10 : 7) * Math.min(1, ratio / 0.9), notes);
  }

  // 8. Dates and order
  {
    const notes = [];
    let problems = 0;
    (resume.work ?? []).forEach((job, i) => {
      const name = job.name || `role ${i + 1}`;
      if (!isValidDate(job.startDate)) {
        problems++;
        notes.push(`Experience › ${name}: startDate ${job.startDate ? quote(job.startDate) : 'is missing'}; use "YYYY-MM".`);
      } else if (!parseDate(job.startDate).month) notes.push(`Experience › ${name}: add the month to startDate ("YYYY-MM"); year-only dates hide gaps and look evasive.`);
      if (job.endDate && !isValidDate(job.endDate)) {
        problems++;
        notes.push(`Experience › ${name}: endDate ${quote(job.endDate)} is not "YYYY-MM". Leave it out for a current role.`);
      } else if (job.endDate && sortKey(job.endDate, 'end') < sortKey(job.startDate)) {
        problems++;
        notes.push(`Experience › ${name}: endDate is before startDate.`);
      }
      const prev = resume.work[i - 1];
      if (prev && sortKey(prev.startDate) < sortKey(job.startDate)) {
        problems++;
        notes.push(`Experience › ${name} should come before ${prev.name || 'the role above'}: list roles newest first.`);
      }
    });
    (resume.education ?? []).forEach((e, i) => {
      if (!isValidDate(e.endDate) && !isValidDate(e.startDate)) {
        problems++;
        notes.push(`Education › ${e.institution || i + 1}: add an endDate (or expected graduation) as "YYYY-MM".`);
      }
    });
    add('dates', 'Dates & order', 10, 10 - problems * 3, notes);
  }

  // 9. Overall length
  {
    const notes = [];
    const words =
      wordCount(b.summary) +
      bullets.reduce((acc, x) => acc + wordCount(x.text), 0) +
      (resume.work ?? []).reduce((acc, w) => acc + wordCount(w.summary), 0) +
      (resume.projects ?? []).reduce((acc, p) => acc + wordCount(p.description), 0);
    let s = 5;
    if (words < 150 || words > 900) s = 1;
    else if (words < 250 || words > 700) s = 3;
    if (words < 250) notes.push(`About ${words} words of content; 250–700 fills a strong one-page resume.`);
    if (words > 700) notes.push(`About ${words} words of content; past 700 it spills to a second page. Cut the weakest bullets.`);
    add('size', 'Overall length', 5, s, notes);
  }

  // 10. Verb variety
  {
    const notes = [];
    const counts = new Map();
    for (const x of bullets) {
      const w = firstWord(x.text);
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    const worst = Math.max(0, ...counts.values());
    for (const [w, c] of counts) if (c > 2) notes.push(`${c} bullets start with ${quote(w[0].toUpperCase() + w.slice(1))}; vary the verbs so each line reads as a new win.`);
    add('variety', 'Verb variety', 5, worst <= 2 ? 5 : worst === 3 ? 3 : 1, notes);
  }

  const score = categories.reduce((acc, c) => acc + c.score, 0);
  const max = categories.reduce((acc, c) => acc + c.max, 0);
  return { score, max, grade: grade(score), categories, bullets: n };
}

export function grade(score) {
  if (score >= 95) return 'Outstanding';
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good, with fixes to make';
  if (score >= 50) return 'Needs work';
  return 'Rewrite recommended';
}
