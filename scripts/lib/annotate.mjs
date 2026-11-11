// "Skills with receipts": find every place a listed skill is actually used,
// and pick out the numbers in each bullet so recruiters can skim the impact.

import { escapeHtml, slug } from './text.mjs';

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** Case-sensitive, whole-term match. "Java" must not match "JavaScript"; "C" must not match "C++". */
export function termRegex(term) {
  const body = String(term).replace(REGEX_SPECIAL, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_+#])`, 'gu');
}

// A number plus its unit: 820 ms, 3M+, 31%, $18k, 1,200+, 12×, 2 hours.
// It must not start inside a word (p95, S3, EC2 are left alone).
const METRIC = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.])(?:[$€£₹]\s?)?\d+(?:[.,]\d+)*` +
    String.raw`(?:\s?(?:%|×|x(?!\p{L})|[kKMB](?!\p{L})))?\+?` +
    String.raw`(?:\s?(?:ms|seconds?|secs?|s|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|yrs?|fps|GB|TB|MB|req\/s|rps|qps|QPS)(?!\p{L}))?`,
  'gu',
);

const isBareYear = (s) => /^(19|20)\d{2}$/.test(s);

/** Every number-with-unit in a string, as [start, end) ranges. Bare years are skipped. */
export function findMetrics(text) {
  const out = [];
  for (const m of String(text).matchAll(METRIC)) {
    const t = m[0].trim();
    if (!/\d/.test(t) || isBareYear(t)) continue;
    out.push({ s: m.index, e: m.index + m[0].trimEnd().length });
  }
  return out;
}

/** Skills as rendered groups. Entries without keywords are single skills and are merged into one unnamed group. */
export function skillGroups(resume) {
  const groups = [];
  for (const entry of resume.skills ?? []) {
    const keywords = (entry.keywords ?? []).filter(Boolean);
    if (keywords.length) {
      groups.push({ name: entry.name ?? '', level: entry.level ?? '', skills: keywords });
    } else if (entry.name) {
      const last = groups.at(-1);
      if (last && last.loose) last.skills.push(entry.name);
      else groups.push({ name: '', level: '', skills: [entry.name], loose: true });
    }
  }
  return groups.map((g) => ({
    name: g.name,
    level: g.level,
    skills: g.skills.map((name) => ({ name, id: `sk-${slug(name)}` })),
  }));
}

/**
 * Create an annotator bound to one resume. Call annotate(text, placeId) for every
 * bullet, then count(skillId) tells you how many places use that skill.
 */
export function createAnnotator(resume, { metrics = true } = {}) {
  const aliases = resume?.meta?.template?.aliases ?? {};
  const skills = [];
  const seen = new Set();
  for (const group of skillGroups(resume)) {
    for (const s of group.skills) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      skills.push(s);
    }
  }

  const matchers = skills
    .flatMap((s) => [s.name, ...[].concat(aliases[s.name] ?? [])].map((term) => ({ id: s.id, term, re: termRegex(term) })))
    .sort((a, b) => b.term.length - a.term.length);

  const byTerm = new Map();
  for (const m of matchers) byTerm.set(m.term.toLowerCase(), m.id);

  const places = new Map(); // skillId -> Set(placeId)
  const record = (skillId, placeId) => {
    if (!placeId) return;
    if (!places.has(skillId)) places.set(skillId, new Set());
    places.get(skillId).add(placeId);
  };

  function ranges(text) {
    const found = [];
    const overlaps = (s, e) => found.some((r) => s < r.e && e > r.s);
    for (const m of matchers) {
      for (const hit of text.matchAll(m.re)) {
        const s = hit.index;
        const e = s + hit[0].length;
        if (!overlaps(s, e)) found.push({ s, e, kind: 'kw', id: m.id });
      }
    }
    if (metrics) {
      for (const r of findMetrics(text)) if (!overlaps(r.s, r.e)) found.push({ ...r, kind: 'metric' });
    }
    return found.sort((a, b) => a.s - b.s);
  }

  /** HTML for one bullet: skills wrapped in <mark>, numbers in <strong class="metric">. */
  function annotate(text, placeId) {
    const src = String(text ?? '');
    let out = '';
    let i = 0;
    for (const r of ranges(src)) {
      out += escapeHtml(src.slice(i, r.s));
      const piece = escapeHtml(src.slice(r.s, r.e));
      if (r.kind === 'kw') {
        out += `<mark class="kw" data-sk="${r.id}">${piece}</mark>`;
        record(r.id, placeId);
      } else {
        out += `<strong class="metric">${piece}</strong>`;
      }
      i = r.e;
    }
    return out + escapeHtml(src.slice(i));
  }

  /** A project tag. If it names a listed skill it becomes a receipt for that skill. */
  function tag(name, placeId) {
    const id = byTerm.get(String(name).toLowerCase()) ?? (seen.has(`sk-${slug(name)}`) ? `sk-${slug(name)}` : null);
    if (!id) return escapeHtml(name);
    record(id, placeId);
    return `<mark class="kw" data-sk="${id}">${escapeHtml(name)}</mark>`;
  }

  /** Plain-text scan (no HTML) used by the checker. */
  function scan(text, placeId) {
    for (const r of ranges(String(text ?? ''))) if (r.kind === 'kw') record(r.id, placeId);
  }

  return {
    skills,
    annotate,
    tag,
    scan,
    count: (skillId) => places.get(skillId)?.size ?? 0,
    places: (skillId) => [...(places.get(skillId) ?? [])],
  };
}
