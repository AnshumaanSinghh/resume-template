// Dates in JSON Resume are ISO 8601 strings: "2024", "2024-04" or "2024-04-01".

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Parse an ISO date. Returns { year, month } (month is 1-12 or null),
 * null when the value is empty, or undefined when it is malformed.
 */
export function parseDate(value) {
  if (value == null || String(value).trim() === '') return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(value).trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return undefined;
  if (m[3] && (Number(m[3]) < 1 || Number(m[3]) > 31)) return undefined;
  return { year, month };
}

export const isValidDate = (value) => Boolean(parseDate(value));

/** "2024-04" -> "Apr 2024"; "2024" -> "2024". */
export function formatDate(value, { long = false } = {}) {
  const d = parseDate(value);
  if (!d) return '';
  if (!d.month) return String(d.year);
  return `${(long ? MONTHS_LONG : MONTHS)[d.month - 1]} ${d.year}`;
}

/** "Apr 2024 – Present", "Jul 2022 – Mar 2024", or a single date. */
export function formatRange(start, end, { present = 'Present' } = {}) {
  const a = formatDate(start);
  const b = end ? formatDate(end) : '';
  if (!a) return b;
  if (!end) return `${a} – ${present}`;
  if (a === b) return a;
  return `${a} – ${b}`;
}

/** Month index (year * 12 + month - 1). Year-only dates use January for starts and December for ends. */
function monthIndex(value, edge) {
  const d = parseDate(value);
  if (!d) return null;
  const month = d.month ?? (edge === 'end' ? 12 : 1);
  return d.year * 12 + (month - 1);
}

const nowIndex = (now) => now.getUTCFullYear() * 12 + now.getUTCMonth();

/** Inclusive month count, the way LinkedIn counts it: Jul 2022 – Mar 2024 is 1 yr 9 mos. */
export function monthsBetween(start, end, now = new Date()) {
  const a = monthIndex(start, 'start');
  if (a === null) return 0;
  const b = end ? monthIndex(end, 'end') : nowIndex(now);
  if (b === null || b < a) return 0;
  return b - a + 1;
}

export function formatDuration(months) {
  if (!months || months < 1) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? 'yr' : 'yrs'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'mo' : 'mos'}`);
  return parts.join(' ');
}

/** "2024-04" -> "2024-04" for <time datetime>; undefined if invalid. */
export function isoAttr(value) {
  const d = parseDate(value);
  if (!d) return undefined;
  return d.month ? `${d.year}-${String(d.month).padStart(2, '0')}` : String(d.year);
}

/** Sortable number for ordering checks; missing end dates mean "ongoing". */
export function sortKey(value, edge = 'start', now = new Date()) {
  if (!value) return edge === 'end' ? nowIndex(now) + 1 : -Infinity;
  return monthIndex(value, edge) ?? -Infinity;
}

const isInternship = (job) => /\b(intern|internship|trainee|apprentice)\b/i.test(job?.position ?? '');

/**
 * Total professional experience in months: overlapping roles are merged,
 * internships are left out (set meta.template.countInternships to include them).
 */
export function totalExperienceMonths(work = [], { now = new Date(), countInternships = false } = {}) {
  const spans = work
    .filter((job) => countInternships || !isInternship(job))
    .map((job) => {
      const a = monthIndex(job.startDate, 'start');
      const b = job.endDate ? monthIndex(job.endDate, 'end') : nowIndex(now);
      return a === null || b === null || b < a ? null : [a, b];
    })
    .filter(Boolean)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of spans) {
    if (!cur || a > cur[1] + 1) {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [a, b];
    } else {
      cur[1] = Math.max(cur[1], b);
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

export { isInternship };
