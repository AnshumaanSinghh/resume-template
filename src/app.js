/* Resume template: progressive enhancement only. Without JS the page is complete. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var main = $('#main');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var scrollMode = function () { return reduceMotion.matches ? 'auto' : 'smooth'; };

  if (!isMac) $$('.kbd-mod').forEach(function (el) { el.textContent = 'Ctrl '; });

  /* ---------- toast ---------- */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ---------- theme ---------- */
  var themeBtn = $('[data-action="theme"]');
  function syncThemeButton() {
    var dark = doc.getAttribute('data-theme') === 'dark';
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.setAttribute('title', dark ? 'Light theme (T)' : 'Dark theme (T)');
  }
  function setTheme(theme, persist) {
    doc.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem('theme', theme); } catch (e) { /* private mode */ } }
    syncThemeButton();
  }
  function toggleTheme() { setTheme(doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true); }
  syncThemeButton();
  themeBtn.addEventListener('click', toggleTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
    if (!saved) setTheme(e.matches ? 'dark' : 'light', false);
  });

  /* ---------- copy ---------- */
  function copy(text, label) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.className = 'vh';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      ta.remove();
      toast(ok ? label + ' copied' : 'Copy failed: select the text instead');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(label + ' copied'); }, fallback);
    } else fallback();
  }
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () { copy(btn.getAttribute('data-copy'), btn.getAttribute('data-label') || 'Text'); });
  });

  /* ---------- PDF: use the pre-rendered file when the build made one, otherwise print ---------- */
  var pdfLink = $('[data-action="pdf"]');
  function downloadPdf() {
    if (pdfLink.getAttribute('data-pdf') === 'true') pdfLink.click();
    else window.print();
  }
  pdfLink.addEventListener('click', function (e) {
    if (pdfLink.getAttribute('data-pdf') !== 'true') { e.preventDefault(); window.print(); }
  });

  /* ---------- top bar state + scrollspy ---------- */
  var bar = $('.bar');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }, { rootMargin: '-64px 0px 0px 0px' }).observe($('#name'));

    var navLinks = $$('.nav a');
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          if (a.hash === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    navLinks.forEach(function (a) { var t = $(a.hash); if (t) spy.observe(t); });

    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('in'); reveal.unobserve(entry.target); }
      });
    }, { threshold: 0 });
    $$('.reveal').forEach(function (el) { reveal.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- skills with receipts ---------- */
  var chips = $$('.chip[data-sk]');
  var rc = $('#receipts');
  var rcName = $('#rc-name');
  var rcPos = $('#rc-pos');
  var active = null; // { id, name, places, index }

  function placesFor(id) {
    var seen = [];
    $$('mark.kw[data-sk="' + id + '"]', main).forEach(function (m) {
      var p = m.closest('.place');
      if (p && seen.indexOf(p) < 0) seen.push(p);
    });
    return seen;
  }
  function light(id) {
    unlight();
    main.setAttribute('data-sk', id);
    $$('mark.kw[data-sk="' + id + '"]', main).forEach(function (m) { m.classList.add('on'); });
    placesFor(id).forEach(function (p) { p.classList.add('hit'); });
  }
  function unlight() {
    main.removeAttribute('data-sk');
    $$('mark.kw.on', main).forEach(function (m) { m.classList.remove('on'); });
    $$('.place.hit', main).forEach(function (p) { p.classList.remove('hit'); });
  }
  function go(i, scroll) {
    if (!active || !active.places.length) return;
    var n = active.places.length;
    active.index = ((i % n) + n) % n;
    var el = active.places[active.index];
    rcPos.textContent = (active.index + 1) + ' of ' + n;
    if (scroll === false) return;
    el.scrollIntoView({ behavior: scrollMode(), block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
  }
  function pin(id, opts) {
    opts = opts || {};
    var chip = $('.chip[data-sk="' + id + '"]');
    if (!chip) return;
    if (active && active.id === id && !opts.force) { unpin(); return; }
    chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
    light(id);
    active = { id: id, name: chip.getAttribute('data-name'), places: placesFor(id), index: 0, chip: chip };
    rcName.textContent = active.name;
    rc.hidden = false;
    go(0, opts.scroll);
    try { history.replaceState(null, '', '?skill=' + encodeURIComponent(id.replace(/^sk-/, '')) + location.hash); } catch (e) { /* file:// */ }
  }
  function unpin(returnFocus) {
    if (!active) return;
    var chip = active.chip;
    active = null;
    chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
    unlight();
    rc.hidden = true;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* file:// */ }
    if (returnFocus) chip.focus({ preventScroll: true });
  }
  chips.forEach(function (chip) {
    var id = chip.getAttribute('data-sk');
    chip.addEventListener('click', function () { pin(id); });
    chip.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !active) light(id); });
    chip.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !active) unlight(); });
  });
  rc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rc]');
    if (!b) return;
    var what = b.getAttribute('data-rc');
    if (what === 'next') go(active.index + 1);
    else if (what === 'prev') go(active.index - 1);
    else unpin(true);
  });

  /* ---------- robot view ---------- */
  var robot = $('#robot');
  var robotText = $('#robot-text');
  function openRobot() {
    if (!robotText.textContent) robotText.textContent = $('#robot-src').content.textContent;
    closeDialogs();
    robot.showModal();
    robotText.focus();
  }
  robot.addEventListener('click', function (e) {
    if (e.target === robot) robot.close();
    var b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.getAttribute('data-action') === 'close') robot.close();
    if (b.getAttribute('data-action') === 'copy-text') copy(robotText.textContent, 'Plain-text resume');
  });

  /* ---------- command palette ---------- */
  var palette = $('#palette');
  var input = $('#pal-input');
  var list = $('#pal-list');
  var paletteBtn = $('[data-action="palette"]');
  var emailBtn = $('[data-copy]');
  var vcf = $('a[href="contact.vcf"]');

  function svg(name) {
    var paths = {
      go: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
      download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>',
      printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
      robot: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 16h5"/>',
      contact: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
      link: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
      theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>',
      skill: '<path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18"/>',
      text: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    };
    return '<svg class="i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
  }

  function commands() {
    var items = [];
    $$('main section[id] .sec-t').forEach(function (t) {
      var sec = t.closest('section[id]');
      if (!items.some(function (x) { return x.key === sec.id; })) {
        items.push({ key: sec.id, group: 'Go to', label: t.textContent, icon: 'go', run: function () { jump('#' + sec.id); } });
      }
    });
    items.push({ group: 'Actions', label: 'Download PDF', icon: 'download', run: downloadPdf });
    items.push({ group: 'Actions', label: 'Print', hint: isMac ? '⌘P' : 'Ctrl P', icon: 'printer', run: function () { window.print(); } });
    if (emailBtn) items.push({ group: 'Actions', label: 'Copy email address', hint: emailBtn.getAttribute('data-copy'), icon: 'copy', run: function () { emailBtn.click(); } });
    if (vcf) items.push({ group: 'Actions', label: 'Save contact card', hint: '.vcf', icon: 'contact', run: function () { vcf.click(); } });
    items.push({ group: 'Actions', label: 'Robot view: what an ATS reads', hint: 'R', icon: 'robot', run: openRobot });
    items.push({ group: 'Actions', label: 'Switch to ' + (doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') + ' theme', hint: 'T', icon: 'theme', run: toggleTheme });
    $$('[data-profile]').forEach(function (a) {
      items.push({ group: 'Links', label: 'Open ' + a.getAttribute('data-profile'), hint: a.textContent.trim(), icon: 'link', run: function () { window.open(a.href, '_blank', 'noopener'); } });
    });
    chips.forEach(function (c) {
      var n = c.getAttribute('data-count');
      items.push({ group: 'Skill receipts', label: c.getAttribute('data-name'), hint: n + (n === '1' ? ' place' : ' places'), icon: 'skill', run: function () { pin(c.getAttribute('data-sk'), { force: true }); } });
    });
    return items;
  }

  function score(q, label) {
    if (!q) return 1;
    var l = label.toLowerCase();
    var i = l.indexOf(q);
    if (i === 0) return 100;
    if (i > 0) return (/\s/.test(l[i - 1]) ? 80 : 60) - i / 100;
    var k = 0;
    for (var j = 0; j < l.length && k < q.length; j++) if (l[j] === q[k]) k++;
    return k === q.length ? 10 : -1;
  }

  var shown = [];
  var sel = 0;
  function renderList() {
    var q = input.value.trim().toLowerCase();
    var all = commands();
    shown = all
      .map(function (c, i) { return { c: c, s: score(q, c.label + ' ' + (c.group === 'Skill receipts' ? 'skill' : '')), i: i }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return q ? b.s - a.s || a.i - b.i : a.i - b.i; })
      .map(function (x) { return x.c; });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    var html = '';
    var lastGroup = null;
    shown.forEach(function (c, i) {
      if (!q && c.group !== lastGroup) {
        html += '<li class="pal-group" role="presentation">' + esc(c.group) + '</li>';
        lastGroup = c.group;
      }
      html += '<li class="pal-item" role="option" id="opt-' + i + '" data-i="' + i + '" aria-selected="' + (i === sel) + '">' + svg(c.icon) + '<span>' + esc(c.label) + '</span>' + (c.hint ? '<span class="pal-hint">' + esc(c.hint) + '</span>' : '') + '</li>';
    });
    list.innerHTML = html || '<li class="pal-empty" role="presentation">No matches. Try “PDF”, “React” or “theme”.</li>';
    input.setAttribute('aria-activedescendant', shown.length ? 'opt-' + sel : '');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function move(d) {
    if (!shown.length) return;
    sel = (sel + d + shown.length) % shown.length;
    $$('.pal-item', list).forEach(function (li) { li.setAttribute('aria-selected', String(Number(li.getAttribute('data-i')) === sel)); });
    input.setAttribute('aria-activedescendant', 'opt-' + sel);
    var cur = $('#opt-' + sel);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function runSelected(i) {
    var c = shown[i];
    if (!c) return;
    palette.close();
    setTimeout(c.run, 0);
  }
  function openPalette() {
    closeDialogs();
    input.value = '';
    sel = 0;
    renderList();
    palette.showModal();
    input.focus();
  }
  input.addEventListener('input', function () { sel = 0; renderList(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runSelected(sel); }
  });
  list.addEventListener('click', function (e) {
    var li = e.target.closest('.pal-item');
    if (li) runSelected(Number(li.getAttribute('data-i')));
  });
  list.addEventListener('mousemove', function (e) {
    var li = e.target.closest('.pal-item');
    if (li && Number(li.getAttribute('data-i')) !== sel) move(Number(li.getAttribute('data-i')) - sel);
  });
  palette.addEventListener('click', function (e) { if (e.target === palette) palette.close(); });
  paletteBtn.addEventListener('click', openPalette);

  function closeDialogs() { $$('dialog[open]').forEach(function (d) { d.close(); }); }
  function jump(hash) {
    var el = $(hash);
    if (!el) return;
    el.scrollIntoView({ behavior: scrollMode(), block: 'start' });
    try { history.replaceState(null, '', hash); } catch (e) { /* ignore */ }
  }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (palette.open) palette.close(); else openPalette();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || $('dialog[open]')) return;
    switch (e.key) {
      case '/': e.preventDefault(); openPalette(); break;
      case 't': toggleTheme(); toast(doc.getAttribute('data-theme') === 'dark' ? 'Dark theme' : 'Light theme'); break;
      case 'r': openRobot(); break;
      case 'j': if (active) go(active.index + 1); break;
      case 'k': if (active) go(active.index - 1); break;
      case 'Escape': if (active) unpin(true); break;
      default: break;
    }
  });

  /* ---------- print: always the clean version ---------- */
  window.addEventListener('beforeprint', function () {
    closeDialogs();
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  });

  /* ---------- deep link: ?skill=kubernetes ---------- */
  try {
    var params = new URLSearchParams(location.search);
    var skill = params.get('skill');
    if (skill) pin('sk-' + skill.toLowerCase(), { force: true, scroll: !params.has('noscroll') });
  } catch (e) { /* ignore */ }
})();
