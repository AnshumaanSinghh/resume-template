// contact.vcf: one tap on a phone saves the candidate to the recruiter's contacts.

import { safeUrl, splitName } from './text.mjs';

const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function toVCard(resume) {
  const b = resume.basics ?? {};
  const [given, family] = splitName(b.name);
  const loc = b.location ?? {};
  const current = (resume.work ?? []).find((w) => !w.endDate);
  const urls = [b.url, ...(b.profiles ?? []).map((p) => p.url)].map(safeUrl).filter(Boolean);
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(b.name)}`,
    b.label && `TITLE:${esc(b.label)}`,
    current?.name && `ORG:${esc(current.name)}`,
    b.email && `EMAIL;TYPE=INTERNET:${esc(b.email)}`,
    b.phone && `TEL;TYPE=CELL:${esc(b.phone)}`,
    (loc.city || loc.region || loc.countryCode) && `ADR;TYPE=HOME:;;${esc(loc.address)};${esc(loc.city)};${esc(loc.region)};${esc(loc.postalCode)};${esc(loc.countryCode)}`,
    ...urls.map((u) => `URL:${esc(u)}`),
    'END:VCARD',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}
