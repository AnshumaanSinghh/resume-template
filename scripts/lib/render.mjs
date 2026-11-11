// resume.json -> a static, self-contained index.html (plus the files that travel with it).

import { createHash, randomUUID } from 'node:crypto';
import { createAnnotator, skillGroups } from './annotate.mjs';
import { formatDate, formatDuration, formatRange, isoAttr, monthsBetween, parseDate, totalExperienceMonths } from './dates.mjs';
import { icon } from './icons.mjs';
import { contactItems, degreeLine, toPlainText } from './plaintext.mjs';
import { qrSvg } from './qr.mjs';
import { escapeHtml as h, formatLocation, initials, prettyUrl, safeUrl, splitName, telHref } from './text.mjs';
import { toVCard } from './vcard.mjs';

export const TEMPLATE_REPO = 'https://github.com/AnshumaanSinghh/resume-template';

const DEFAULTS = {
  status: '',
  stats: null,
  accent: null,
  paper: 'A4',
  qr: true,
  credit: true,
  photo: true,
  printPhoto: false,
  aliases: {},
  countInternships: false,
  noindex: false,
  lang: 'en',
};

const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const fileSafe = (s) => String(s).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'Resume';

function link(url, text, attrs = '') {
  const href = safeUrl(url);
  if (!href) return h(text);
  const external = /^https?:/.test(href);
  return `<a href="${h(href)}"${external ? ' rel="noopener"' : ''}${attrs}>${text}</a>`;
}

function time(value) {
  const iso = isoAttr(value);
  const label = formatDate(value);
  return iso ? `<time datetime="${iso}">${h(label)}</time>` : h(label);
}

function rangeHtml(start, end) {
  if (!parseDate(start)) return end ? time(end) : '';
  return `${time(start)} – ${end ? time(end) : 'Present'}`;
}

function shortYears(months) {
  const years = months / 12;
  if (years < 1) return `${months} mo${months === 1 ? '' : 's'}`;
  const rounded = Math.floor(years * 2) / 2; // 4.4 -> 4, 4.6 -> 4.5
  return `${rounded % 1 ? rounded.toFixed(1) : rounded}+ yrs`;
}

/** Everything the template needs, computed once. */
export function prepare(resume, { now = new Date() } = {}) {
  if (!resume || typeof resume !== 'object') throw new TypeError('resume.json must contain a JSON object');
  if (!resume.basics?.name) throw new Error('resume.json needs basics.name');
  const t = { ...DEFAULTS, ...(resume.meta?.template ?? {}) };
  const ann = createAnnotator(resume);
  const months = totalExperienceMonths(resume.work, { now, countInternships: t.countInternships });
  return { resume, t, ann, now, months, canonical: safeUrl(resume.meta?.canonical || '') };
}

function secHead(n, id, title, meta = '') {
  return `<div class="sec-top"><h2 id="h-${id}" class="sec-h"><span class="sec-n" aria-hidden="true">${String(n).padStart(2, '0')}</span><span class="sec-t">${h(title)}</span></h2>${meta ? `<p class="sec-meta">${meta}</p>` : ''}</div>`;
}

function renderRole(job, i, ann, now, kind = 'w') {
  const current = !job.endDate;
  const dur = formatDuration(monthsBetween(job.startDate, job.endDate, now));
  const org = job.name ?? job.organization ?? '';
  const orgHtml = job.url ? link(job.url, h(org)) : h(org);
  const loc = job.location ? `<span class="sep" aria-hidden="true"> · </span><span class="role-loc">${h(job.location)}</span>` : '';
  return `<article class="role${current ? ' is-current' : ''}" id="${kind}${i}">
<header class="role-head">
<h3 class="role-title">${h(job.position ?? '')}</h3>
<p class="role-org">${orgHtml}${loc}</p>
<p class="role-when"><span class="when-range">${rangeHtml(job.startDate, job.endDate)}</span>${dur ? `<span class="when-dur">${h(dur)}</span>` : ''}</p>
</header>
${job.summary ? `<p class="role-sum place" id="${kind}${i}-s">${ann.annotate(job.summary, `${kind}${i}-s`)}</p>` : ''}
${job.highlights?.length ? `<ul class="bullets">${job.highlights.map((x, j) => `<li class="place" id="${kind}${i}-${j}">${ann.annotate(x, `${kind}${i}-${j}`)}</li>`).join('')}</ul>` : ''}
</article>`;
}

function renderProject(p, i, ann, featured) {
  const id = `p${i}`;
  const url = safeUrl(p.url);
  const name = url ? `<a href="${h(url)}" rel="noopener">${h(p.name)}${icon('arrow', 'i i-arrow')}</a>` : h(p.name);
  const when = p.startDate ? `<p class="proj-when">${rangeHtml(p.startDate, p.endDate)}</p>` : '';
  // In print the head is one line: "Name — url" on the left, "Tech: …" on the right.
  return `<article class="project place${featured ? ' featured' : ''}" id="${id}">
<header class="proj-head"><div class="proj-id"><h3 class="proj-name">${name}</h3>${url ? `<p class="proj-url print-only"> — ${h(prettyUrl(url))}</p>` : ''}${when}</div>${p.keywords?.length ? `<p class="print-only proj-tech">Tech: ${h(p.keywords.join(', '))}</p>` : ''}</header>
${p.description ? `<p class="proj-desc">${ann.annotate(p.description, id)}</p>` : ''}
${p.highlights?.length ? `<ul class="bullets">${p.highlights.map((x) => `<li>${ann.annotate(x, id)}</li>`).join('')}</ul>` : ''}
${p.keywords?.length ? `<ul class="tags" aria-label="Built with">${p.keywords.map((k) => `<li>${ann.tag(k, id)}</li>`).join('')}</ul>` : ''}
</article>`;
}

function renderSkills(resume, ann) {
  return skillGroups(resume)
    .map((g) => {
      const chips = g.skills
        .map((s) => {
          const n = ann.count(s.id);
          if (!n) return `<li><span class="chip is-plain">${h(s.name)}</span></li>`;
          return `<li><button type="button" class="chip" data-sk="${s.id}" data-name="${h(s.name)}" data-count="${n}" aria-pressed="false">${h(s.name)}<span class="chip-n" aria-hidden="true">${n}</span><span class="vh">, used in ${n} place${n === 1 ? '' : 's'}</span></button></li>`;
        })
        .join('');
      const names = h(g.skills.map((s) => s.name).join(', '));
      return `<div class="sg">${g.name ? `<h3 class="sg-h">${h(g.name)}</h3>` : ''}<ul class="chips">${chips}</ul><p class="print-only sg-print">${g.name ? `<b>${h(g.name)}:</b> ` : ''}${names}</p></div>`;
    })
    .join('\n');
}

function jsonLd({ resume, canonical, now }) {
  const b = resume.basics;
  const loc = b.location ?? {};
  const current = (resume.work ?? []).find((w) => !w.endDate);
  const sameAs = [b.url, ...(b.profiles ?? []).map((p) => p.url)].map(safeUrl).filter(Boolean);
  const person = {
    '@type': 'Person',
    name: b.name,
    jobTitle: b.label || undefined,
    description: b.summary || undefined,
    email: b.email ? `mailto:${b.email}` : undefined,
    telephone: b.phone || undefined,
    url: canonical || safeUrl(b.url) || undefined,
    image: safeUrl(b.image) || undefined,
    address: loc.city || loc.countryCode ? { '@type': 'PostalAddress', addressLocality: loc.city, addressRegion: loc.region, addressCountry: loc.countryCode } : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    worksFor: current ? { '@type': 'Organization', name: current.name, url: safeUrl(current.url) || undefined } : undefined,
    alumniOf: (resume.education ?? []).length ? resume.education.map((e) => ({ '@type': 'EducationalOrganization', name: e.institution, url: safeUrl(e.url) || undefined })) : undefined,
    knowsAbout: skillGroups(resume).flatMap((g) => g.skills.map((s) => s.name)),
    knowsLanguage: (resume.languages ?? []).map((l) => l.language).filter(Boolean),
    hasCredential: (resume.certificates ?? []).length
      ? resume.certificates.map((c) => ({ '@type': 'EducationalOccupationalCredential', name: c.name, credentialCategory: 'certification', recognizedBy: c.issuer ? { '@type': 'Organization', name: c.issuer } : undefined }))
      : undefined,
  };
  const page = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateModified: resume.meta?.lastModified || now.toISOString().slice(0, 10),
    mainEntity: person,
  };
  return JSON.stringify(page).replace(/</g, '\\u003c');
}

function description(b) {
  const text = [b.label, b.summary].filter(Boolean).join('. ').replace(/\s+/g, ' ');
  if (text.length <= 158) return text;
  return `${text.slice(0, 155).replace(/\s+\S*$/, '')}…`;
}

function accentCss(accent) {
  if (!accent) return '';
  const light = typeof accent === 'string' ? accent : accent.light;
  const dark = typeof accent === 'string' ? accent : accent.dark;
  let css = '';
  if (HEX.test(light ?? '')) css += `:root{--accent:${light}}`;
  if (HEX.test(dark ?? '')) css += `:root[data-theme="dark"]{--accent:${dark}}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--accent:${dark}}}`;
  return css ? `\n/* accent from resume.json */\n${css}@media print{:root,:root[data-theme="dark"]{--accent:#000}}\n` : '';
}

const THEME_BOOT = `(function(){var d=document.documentElement,t;try{t=new URLSearchParams(location.search).get('theme')||localStorage.getItem('theme')}catch(e){}if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.setAttribute('data-theme',t);d.classList.add('js')})();`;

/**
 * Render all output files.
 * @returns {Record<string, string>} file name -> contents
 */
export function renderSite(resume, { now = new Date(), css = '', js = '', pdf = false } = {}) {
  const ctx = prepare(resume, { now });
  const { t, ann, months, canonical } = ctx;
  const b = resume.basics;
  const [first, last] = splitName(b.name);
  const fileBase = fileSafe(b.name);
  const location = formatLocation(b.location);
  const work = resume.work ?? [];
  const current = work.find((w) => !w.endDate);
  let n = b.summary ? 1 : 0;
  const slot = (name) => `@@${name}-${tok}@@`;
  const tok = randomUUID();

  // --- main column (rendered first so skill receipts are counted) ---
  const experience = work.length
    ? `<section id="experience" class="sec reveal" aria-labelledby="h-experience">
${secHead(++n, 'experience', 'Experience', [months ? `${h(formatDuration(months))} total` : '', `${work.length} role${work.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))}
<div class="timeline">${work.map((job, i) => renderRole(job, i, ann, now)).join('\n')}</div>
</section>`
    : '';

  const projects = resume.projects?.length
    ? `<section id="projects" class="sec reveal" aria-labelledby="h-projects">
${secHead(++n, 'projects', 'Projects')}
<div class="proj-grid">${resume.projects.map((p, i) => renderProject(p, i, ann, i === 0 && resume.projects.length % 2 === 1)).join('\n')}</div>
</section>`
    : '';

  const volunteer = resume.volunteer?.length
    ? `<section id="volunteering" class="sec reveal" aria-labelledby="h-volunteering">
${secHead(++n, 'volunteering', 'Volunteering')}
<div class="timeline">${resume.volunteer.map((v, i) => renderRole({ ...v, name: v.organization }, i, ann, now, 'v')).join('\n')}</div>
</section>`
    : '';

  // --- side column ---
  const skills = resume.skills?.length
    ? `<section id="skills" class="sec reveal" aria-labelledby="h-skills">
${secHead(++n, 'skills', 'Skills')}
<p class="hint needs-js">Skills with receipts: select one to light up every place it was used.</p>
${renderSkills(resume, ann)}
</section>`
    : '';

  const education = resume.education?.length
    ? `<section id="education" class="sec reveal" aria-labelledby="h-education">
${secHead(++n, 'education', 'Education')}
${resume.education
  .map(
    (e) => `<article class="edu">
<h3 class="edu-deg">${h(degreeLine(e))}</h3>
<p class="edu-inst">${e.url ? link(e.url, h(e.institution)) : h(e.institution ?? '')}</p>
<p class="edu-meta">${[rangeHtml(e.startDate, e.endDate), e.score ? h(e.score) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>')}</p>
${e.courses?.length ? `<p class="edu-courses">Coursework: ${h(e.courses.join(', '))}</p>` : ''}
</article>`,
  )
  .join('\n')}
</section>`
    : '';

  const listSection = (id, title, items) =>
    items.length
      ? `<section id="${id}" class="sec reveal" aria-labelledby="h-${id}">
${secHead(++n, id, title)}
<ul class="list">${items.join('')}</ul>
</section>`
      : '';

  const certifications = listSection(
    'certifications',
    'Certifications',
    (resume.certificates ?? []).map(
      (c) => `<li><span class="li-t">${c.url ? link(c.url, h(c.name)) : h(c.name)}</span><span class="li-m">${[h(c.issuer ?? ''), c.date ? time(c.date) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>')}</span></li>`,
    ),
  );

  const awards = listSection(
    'awards',
    'Awards',
    (resume.awards ?? []).map(
      (a) => `<li><span class="li-t">${h(a.title)}</span><span class="li-m">${[h(a.awarder ?? ''), a.date ? time(a.date) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>')}</span>${a.summary ? `<span class="li-d">${ann.annotate(a.summary)}</span>` : ''}</li>`,
    ),
  );

  const publications = listSection(
    'publications',
    'Publications',
    (resume.publications ?? []).map(
      (p) => `<li><span class="li-t">${p.url ? link(p.url, h(p.name)) : h(p.name)}</span><span class="li-m">${[h(p.publisher ?? ''), p.releaseDate ? time(p.releaseDate) : ''].filter(Boolean).join('<span class="sep" aria-hidden="true"> · </span>')}</span>${p.summary ? `<span class="li-d">${ann.annotate(p.summary)}</span>` : ''}</li>`,
    ),
  );

  const languages = listSection(
    'languages',
    'Languages',
    (resume.languages ?? []).map((l) => `<li class="li-row"><span class="li-t">${h(l.language)}</span>${l.fluency ? `<span class="li-m">${h(l.fluency)}</span>` : ''}</li>`),
  );

  const interests = (resume.interests ?? []).length
    ? `<section id="interests" class="sec reveal" aria-labelledby="h-interests">
${secHead(++n, 'interests', 'Interests')}
<p class="interests">${resume.interests.map((i) => h(i.name)).join('<span class="sep" aria-hidden="true"> · </span>')}</p>
</section>`
    : '';

  // --- hero ---
  const contact = [];
  if (b.email) contact.push(`<li><a href="mailto:${h(b.email)}">${icon('mail')}<span>${h(b.email)}</span></a><button type="button" class="copy needs-js" data-copy="${h(b.email)}" data-label="Email address" title="Copy email address">${icon('copy')}<span class="vh">Copy email address</span></button></li>`);
  if (b.phone) contact.push(`<li>${telHref(b.phone) ? `<a href="${h(telHref(b.phone))}">${icon('phone')}<span>${h(b.phone)}</span></a>` : `<span>${h(b.phone)}</span>`}</li>`);
  if (location) contact.push(`<li><span>${icon('pin')}<span>${h(location)}</span></span></li>`);
  if (b.url && safeUrl(b.url)) contact.push(`<li><a href="${h(safeUrl(b.url))}" rel="noopener" data-profile="Website">${icon('link')}<span>${h(prettyUrl(b.url))}</span></a></li>`);
  for (const p of b.profiles ?? []) {
    const href = safeUrl(p.url);
    if (href) contact.push(`<li><a href="${h(href)}" rel="me noopener" data-profile="${h(p.network ?? 'Profile')}">${icon('link')}<span>${h(prettyUrl(href))}</span></a></li>`);
  }
  contact.push(`<li class="no-print"><a href="contact.vcf" download="${h(fileBase)}.vcf">${icon('contact')}<span>Save contact</span></a></li>`);

  const statsData = Array.isArray(t.stats) && t.stats.length
    ? t.stats.slice(0, 3)
    : [
        months ? { value: shortYears(months).replace(' yrs', ''), label: 'years of professional experience' } : null,
        resume.projects?.length ? { value: String(resume.projects.length), label: 'projects shipped' } : null,
        { value: String(ann.skills.filter((s) => ann.count(s.id)).length), label: 'skills backed by receipts' },
      ].filter(Boolean);

  const glance = `<aside class="glance" aria-label="At a glance">
<p class="glance-h"><span>At a glance</span>${months ? `<span>${h(shortYears(months))} experience</span>` : ''}</p>
<dl class="stats">${statsData.map((s) => `<div class="stat"><dt>${h(s.label)}</dt><dd>${h(s.value)}</dd></div>`).join('')}</dl>
${current ? `<p class="now"><span class="now-k">Now</span><span>${h(current.position)} at ${h(current.name)}</span></p>` : ''}
</aside>`;

  const qr = t.qr && canonical
    ? `<figure class="qr print-only">${qrSvg(canonical, { label: `QR code linking to ${prettyUrl(canonical)}`, className: 'qr-code' })}<figcaption>Interactive version:<br>${h(prettyUrl(canonical)).replace(/\//g, '/<wbr>')}</figcaption></figure>`
    : '';

  const photo = t.photo && safeUrl(b.image)
    ? `<img class="avatar${t.printPhoto ? '' : ' no-print'}" src="${h(safeUrl(b.image))}" alt="${h(b.name)}" width="88" height="88" decoding="async">`
    : '';

  const hero = `<section class="hero" aria-labelledby="name">
<div class="hero-main">
${photo}
${t.status ? `<p class="status no-print"><span class="pulse" aria-hidden="true"></span>${h(t.status)}</p>` : ''}
<h1 id="name" class="name">${last ? `${h(first)} <em>${h(last)}</em>` : h(first)}</h1>
${b.label ? `<p class="headline">${h(b.label)}</p>` : ''}
<ul class="contact" aria-label="Contact details">${contact.join('')}</ul>
</div>
${glance}
${qr}
</section>`;

  const summary = b.summary
    ? `<section id="summary" class="sec sec-summary" aria-labelledby="h-summary">
${secHead(1, 'summary', 'Summary')}
<p class="lead">${ann.annotate(b.summary)}</p>
</section>`
    : '';

  const navItems = [
    ['experience', 'Experience', experience],
    ['projects', 'Projects', projects],
    ['skills', 'Skills', skills],
    ['education', 'Education', education],
  ].filter(([, , html]) => html);

  const plain = toPlainText(resume);
  const updated = formatDate(resume.meta?.lastModified || now.toISOString().slice(0, 7), { long: true });

  const page = `<a class="skip" href="#main">Skip to content</a>
<header class="bar" id="top">
<div class="bar-in">
<a class="brand" href="#top"><span class="mono" aria-hidden="true">${h(initials(b.name))}</span><span class="brand-name">${h(b.name)}</span><span class="vh">, back to top</span></a>
<nav class="nav" aria-label="Sections"><ul>${navItems.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join('')}</ul></nav>
<div class="bar-actions">
<button type="button" class="btn btn-ghost btn-k needs-js" data-action="palette" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">${icon('search')}<span class="btn-k-label">Search</span><kbd><span class="kbd-mod">⌘</span>K</kbd></button>
<button type="button" class="btn btn-icon needs-js" data-action="theme" aria-label="Switch theme">${icon('sun', 'i i-sun')}${icon('moon', 'i i-moon')}</button>
<a class="btn btn-solid" href="resume.pdf" download="${h(fileBase)}-Resume.pdf" data-action="pdf" data-pdf="${pdf ? 'true' : 'false'}">${icon('download')}<span>PDF</span></a>
</div>
</div>
</header>
<main id="main">
${hero}
${summary}
<div class="cols">
<div class="col-main">
${experience}
${projects}
${volunteer}
</div>
<aside class="col-side" aria-label="Skills and credentials">
${skills}
${education}
${certifications}
${awards}
${publications}
${languages}
${interests}
</aside>
</div>
</main>
<footer class="foot">
<p>Updated ${h(updated)}<span class="sep" aria-hidden="true"> · </span><a href="resume.txt">Plain text</a><span class="sep" aria-hidden="true"> · </span><a href="resume.pdf" download="${h(fileBase)}-Resume.pdf">PDF</a></p>
<p class="needs-js">Press <kbd><span class="kbd-mod">⌘</span>K</kbd> for everything else</p>
${t.credit ? `<p>Template by <a href="${TEMPLATE_REPO}" rel="noopener">Anshumaan Singh</a></p>` : ''}
</footer>

<dialog class="dlg palette" id="palette" aria-label="Command menu">
<div class="dlg-in">
<div class="pal-search">${icon('search')}<input id="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Jump to a section, a skill, or an action…" aria-label="Search commands"></div>
<ul id="pal-list" class="pal-list" role="listbox" aria-label="Commands"></ul>
<div class="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> select</span><span><kbd>esc</kbd> close</span></div>
</div>
</dialog>

<dialog class="dlg robot" id="robot" aria-labelledby="robot-h">
<div class="dlg-in">
<div class="robot-head">
<h2 id="robot-h">Robot view</h2>
<p>This is the text an applicant tracking system pulls out of the PDF: one column, standard headings, dates it can parse. Nothing hides in images or tables.</p>
</div>
<pre class="robot-text" id="robot-text" tabindex="0" aria-label="Plain-text resume"></pre>
<div class="robot-actions">
<button type="button" class="btn btn-solid" data-action="copy-text">${icon('copy')}<span>Copy text</span></button>
<a class="btn" href="resume.txt" download="${h(fileBase)}-Resume.txt">${icon('text')}<span>Download .txt</span></a>
<button type="button" class="btn btn-ghost" data-action="close">Close</button>
</div>
</div>
</dialog>
<template id="robot-src">${slot('ROBOT')}</template>

<div class="receipts" id="receipts" role="region" aria-label="Skill receipts" hidden>
<span class="rc-dot" aria-hidden="true"></span>
<span class="rc-name" id="rc-name"></span>
<span class="rc-pos" id="rc-pos" aria-live="polite"></span>
<button type="button" class="rc-btn" data-rc="prev" aria-label="Previous place">${icon('up')}</button>
<button type="button" class="rc-btn" data-rc="next" aria-label="Next place">${icon('down')}</button>
<button type="button" class="rc-btn" data-rc="close" aria-label="Clear skill highlight">${icon('close')}</button>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const styles = `${css}${accentCss(t.accent)}@page{size:${/^letter$/i.test(t.paper) ? 'Letter' : 'A4'};margin:11mm 12.5mm 10mm}`;
  const ld = jsonLd(ctx);
  const csp = [
    "default-src 'self'",
    `script-src ${sha256(THEME_BOOT)} ${sha256(js)}`,
    `style-src ${sha256(styles)}`,
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');

  const title = [b.name, b.label?.split(/[·|]/)[0]?.trim()].filter(Boolean).join(' — ');
  const desc = description(b);
  const ogImage = canonical ? new URL('og.png', canonical).href : null;

  const head = `<!doctype html>
<html lang="${h(t.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${h(title)}</title>
<meta name="description" content="${h(desc)}">
${t.noindex ? '<meta name="robots" content="noindex">' : ''}
${canonical ? `<link rel="canonical" href="${h(canonical)}">` : ''}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f2ea">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0d0b">
<meta property="og:type" content="profile">
<meta property="og:title" content="${h(title)}">
<meta property="og:description" content="${h(desc)}">
${canonical ? `<meta property="og:url" content="${h(canonical)}">` : ''}
${ogImage ? `<meta property="og:image" content="${h(ogImage)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${h(`${b.name}: ${b.label ?? 'resume'}`)}">` : ''}
<meta property="profile:first_name" content="${h(first)}">
${last ? `<meta property="profile:last_name" content="${h(last)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/plain" href="resume.txt" title="Plain-text resume">
<link rel="preload" href="fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-serif-italic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/instrument-serif.woff2" as="font" type="font/woff2" crossorigin>
<script>${slot('BOOT')}</script>
<style>${slot('STYLES')}</style>
<script type="application/ld+json">${ld}</script>
</head>
<body>
`;

  // Drop blank lines left by empty sections, then drop in the exact bytes the CSP hashes cover.
  const tidy = (s) => s.replace(/^\s*\n/gm, '');
  const html = `${tidy(head)}${tidy(page)}\n<script>${slot('APP')}</script>\n</body>\n</html>\n`
    .replace(slot('BOOT'), () => THEME_BOOT)
    .replace(slot('STYLES'), () => styles)
    .replace(slot('ROBOT'), () => h(plain))
    .replace(slot('APP'), () => js);

  return {
    'index.html': html,
    'resume.txt': plain,
    'contact.vcf': toVCard(resume),
    'favicon.svg': favicon(b.name),
    'og.html': renderOg(ctx, statsData),
  };
}

export function favicon(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#17150f"/><text x="32" y="42.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="29" font-style="italic" fill="#e3b456">${h(initials(name))}</text></svg>\n`;
}

/** 1200x630 social card, screenshotted to og.png by the build. */
function renderOg({ resume, canonical, months }, stats) {
  const b = resume.basics;
  const [first, last] = splitName(b.name);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>og</title><style>
@font-face{font-family:"Instrument Serif";src:url(fonts/instrument-serif.woff2) format("woff2")}
@font-face{font-family:"Instrument Serif";font-style:italic;src:url(fonts/instrument-serif-italic.woff2) format("woff2")}
@font-face{font-family:Inter;font-weight:400;src:url(fonts/inter-400.woff2) format("woff2")}
@font-face{font-family:Inter;font-weight:500 700;src:url(fonts/inter-500.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400 600;src:url(fonts/jetbrains-mono-var.woff2) format("woff2")}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#0e0d0b;color:#f1ece0;font-family:Inter,sans-serif;padding:64px 72px;position:relative}
body:before{content:"";position:absolute;inset:0;background:radial-gradient(900px 500px at 85% -10%,rgba(227,180,86,.20),transparent 60%),radial-gradient(700px 400px at -10% 120%,rgba(227,180,86,.10),transparent 60%)}
.top{display:flex;justify-content:space-between;align-items:center;font:500 18px/1 "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#a79f8d;position:relative}
.mono{display:inline-grid;place-items:center;width:52px;height:52px;border:1.5px solid #e3b456;border-radius:14px;font:italic 28px/1 "Instrument Serif",serif;letter-spacing:0;color:#e3b456;text-transform:none;margin-right:18px}
.brand{display:flex;align-items:center}
h1{font:400 128px/.92 "Instrument Serif",serif;letter-spacing:-.025em;margin-top:52px;position:relative}
h1 em{color:#e3b456}
p.l{font-size:30px;color:#c3bba9;margin-top:20px;position:relative}
.stats{position:absolute;left:72px;right:72px;bottom:60px;display:flex;gap:28px;border-top:1px solid #2f2a22;padding-top:26px}
.stat{flex:1}
.v{font:400 52px/1 "Instrument Serif",serif;color:#f1ece0}
.k{font-size:17px;color:#948c7b;margin-top:8px;line-height:1.3}
</style></head><body>
<div class="top"><span class="brand"><span class="mono">${h(initials(b.name))}</span>Resume</span><span>${h(canonical ? prettyUrl(canonical) : months ? `${shortYears(months)} experience` : '')}</span></div>
<h1>${last ? `${h(first)} <em>${h(last)}</em>` : h(first)}</h1>
${b.label ? `<p class="l">${h(b.label)}</p>` : ''}
<div class="stats">${stats.map((s) => `<div class="stat"><div class="v">${h(s.value)}</div><div class="k">${h(s.label)}</div></div>`).join('')}</div>
</body></html>`;
}
