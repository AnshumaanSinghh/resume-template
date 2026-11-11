// Small string helpers shared by the renderer, the plain-text export and the checker.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use in HTML element content and quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** A stable, URL-safe id fragment: "Node.js" -> "node-js", "C++" -> "c-plus-plus". */
export function slug(value) {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'x';
}

/** Count words the way a reader would (numbers and "Node.js" count as one word each). */
export function wordCount(value) {
  return (String(value ?? '').match(/[\p{L}\p{N}$€£₹][\p{L}\p{N}'’.\-+#/%,]*/gu) || []).length;
}

/**
 * Turn whatever the user typed into a safe absolute URL, or null.
 * "github.com/me" becomes "https://github.com/me"; javascript: and data: are rejected.
 */
export function safeUrl(value) {
  if (!value) return null;
  let raw = String(value).trim();
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** "https://www.github.com/me/" -> "github.com/me" */
export function prettyUrl(value) {
  const href = safeUrl(value);
  if (!href) return String(value ?? '');
  const u = new URL(href);
  if (u.protocol === 'mailto:' || u.protocol === 'tel:') return decodeURIComponent(u.pathname);
  return (u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search).replace(/\/$/, '');
}

export function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

export const isEmail = (value) => /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(String(value ?? ''));

/** Split "Aarav Mehta" into ["Aarav", "Mehta"]; a single word stays whole. */
export function splitName(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return [parts[0] ?? '', ''];
  return [parts.slice(0, -1).join(' '), parts.at(-1)];
}

export function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : parts;
  return letters.map((p) => [...p][0]?.toUpperCase() ?? '').join('') || '·';
}

/** "London" + "UK" -> "London, UK" */
export function formatLocation(loc) {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  return [loc.city, loc.region, loc.countryCode].filter(Boolean).join(', ');
}

/** Join list items as "a, b and c". */
export function listSentence(items) {
  const xs = items.filter(Boolean);
  if (xs.length < 2) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
}
