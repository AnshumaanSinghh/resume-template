// The plain-text resume: what an applicant tracking system extracts from the PDF.
// It is shipped as resume.txt and shown in the page's "Robot view".

import { formatDate, formatRange } from './dates.mjs';
import { formatLocation, prettyUrl } from './text.mjs';
import { skillGroups } from './annotate.mjs';

export function degreeLine(edu) {
  const degree = [edu.studyType, edu.area].filter(Boolean).join(' in ');
  return degree || edu.area || edu.studyType || '';
}

export function contactItems(basics = {}) {
  return [
    basics.email,
    basics.phone,
    formatLocation(basics.location),
    basics.url && prettyUrl(basics.url),
    ...(basics.profiles ?? []).map((p) => (p.url ? prettyUrl(p.url) : [p.network, p.username].filter(Boolean).join(': '))),
  ].filter(Boolean);
}

export function toPlainText(resume) {
  const b = resume.basics ?? {};
  const out = [];
  const section = (title, lines) => {
    const body = lines.flat(Infinity).filter((l) => l !== null && l !== undefined && l !== false);
    if (!body.length) return;
    out.push('', title.toUpperCase(), ...body);
  };
  const bullets = (xs) => (xs ?? []).filter(Boolean).map((x) => `- ${x}`);

  out.push(b.name ?? '');
  if (b.label) out.push(b.label);
  const contact = contactItems(b);
  if (contact.length) out.push(contact.join(' | '));

  if (b.summary) section('Summary', [b.summary]);

  section(
    'Experience',
    (resume.work ?? []).map((job, i) => [
      i ? '' : null,
      [job.position, job.name].filter(Boolean).join(', ') + (job.location ? ` (${job.location})` : ''),
      formatRange(job.startDate, job.endDate),
      job.summary || null,
      bullets(job.highlights),
    ]),
  );

  section(
    'Projects',
    (resume.projects ?? []).map((p, i) => [
      i ? '' : null,
      p.name + (p.url ? ` (${prettyUrl(p.url)})` : ''),
      p.description || null,
      bullets(p.highlights),
      p.keywords?.length ? `Tech: ${p.keywords.join(', ')}` : null,
    ]),
  );

  section(
    'Skills',
    skillGroups(resume).map((g) => (g.name ? `${g.name}: ` : '') + g.skills.map((s) => s.name).join(', ')),
  );

  section(
    'Education',
    (resume.education ?? []).map((e, i) => [
      i ? '' : null,
      [degreeLine(e), e.institution].filter(Boolean).join(', '),
      [formatRange(e.startDate, e.endDate), e.score].filter(Boolean).join(' | ') || null,
      e.courses?.length ? `Coursework: ${e.courses.join(', ')}` : null,
    ]),
  );

  section(
    'Volunteering',
    (resume.volunteer ?? []).map((v, i) => [
      i ? '' : null,
      [v.position, v.organization].filter(Boolean).join(', '),
      formatRange(v.startDate, v.endDate),
      v.summary || null,
      bullets(v.highlights),
    ]),
  );

  section(
    'Certifications',
    (resume.certificates ?? []).map((c) => [c.name, [c.issuer, formatDate(c.date)].filter(Boolean).join(', ')].filter(Boolean).join(' | ')),
  );

  section(
    'Awards',
    (resume.awards ?? []).map((a) =>
      [[a.title, [a.awarder, formatDate(a.date)].filter(Boolean).join(', ')].filter(Boolean).join(' | '), a.summary].filter(Boolean).join('. '),
    ),
  );

  section(
    'Publications',
    (resume.publications ?? []).map((p) =>
      [p.name, [p.publisher, formatDate(p.releaseDate)].filter(Boolean).join(', '), p.url && prettyUrl(p.url)].filter(Boolean).join(' | '),
    ),
  );

  section('Languages', [(resume.languages ?? []).map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join(', ')].filter(Boolean));

  section('Interests', [(resume.interests ?? []).map((i) => i.name).filter(Boolean).join(', ')].filter(Boolean));

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
