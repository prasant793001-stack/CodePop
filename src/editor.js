/* CodePop editor: textarea over a highlighted layer, gutter, smart typing, helper keys */
(function (G) {
'use strict';
const CLS = ['', 'k', 't', 's', 'n', 'c', 'f', 'g', 'a', 'v', 'm', 'o', 'p'];
const CPPKW = new Set('if else for while do return break continue const using namespace true false switch case default struct class new delete static nullptr'.split(' '));
const CPPTY = new Set('int long short unsigned signed float double bool char string void auto vector'.split(' '));
const CPPBI = new Set('cout cin cerr endl std getline setw setprecision fixed to_string stoi'.split(' '));
const JSKW = new Set('let const var function return if else for while true false new null undefined this'.split(' '));
const JSBI = new Set('console document window alert Math'.split(' '));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (c, a, b, k) => { if (b > a) c.fill(k, a, b); };
const isW = ch => /\w/.test(ch || '');

function cppCls(t, c, from, to) {
  let i = from;
  while (i < to) {
    const ch = t[i];
    if (ch === '/' && t[i + 1] === '/') { let e = t.indexOf('\n', i); if (e < 0 || e > to) e = to; fill(c, i, e, 5); i = e; continue; }
    if (ch === '/' && t[i + 1] === '*') { let e = t.indexOf('*/', i + 2); e = e < 0 ? to : Math.min(e + 2, to); fill(c, i, e, 5); i = e; continue; }
    if (ch === '#' && /^[ \t]*$/.test(t.slice(t.lastIndexOf('\n', i - 1) + 1, i))) {
      let e = t.indexOf('\n', i); if (e < 0 || e > to) e = to; fill(c, i, e, 10);
      const lt = t.indexOf('<', i); if (lt >= 0 && lt < e) fill(c, lt, e, 3); else { const q = t.indexOf('"', i); if (q >= 0 && q < e) fill(c, q, e, 3); }
      i = e; continue;
    }
    if (ch === '"' || ch === "'") { let j = i + 1; while (j < to && t[j] !== ch && t[j] !== '\n') { if (t[j] === '\\') j++; j++; } j = Math.min(j + 1, to); fill(c, i, j, 3); i = j; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(t[i + 1] || ''))) { let j = i + 1; while (j < to && /[0-9a-fA-FxX._]/.test(t[j])) j++; fill(c, i, j, 4); i = j; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1; while (j < to && isW(t[j])) j++;
      const w = t.slice(i, j); let k = 0;
      if (CPPKW.has(w)) k = 1; else if (CPPTY.has(w)) k = 2; else if (CPPBI.has(w)) k = 9; else { let q = j; while (q < to && t[q] === ' ') q++; if (t[q] === '(') k = 6; }
      fill(c, i, j, k); i = j; continue;
    }
    if ((ch === '<' && t[i + 1] === '<') || (ch === '>' && t[i + 1] === '>')) { fill(c, i, i + 2, 11); i += 2; continue; }
    if ('+-*/%=<>!&|^~?:'.includes(ch)) fill(c, i, i + 1, 11); else if ('{}()[];,.'.includes(ch)) fill(c, i, i + 1, 12);
    i++;
  }
}
function jsCls(t, c, from, to) {
  let i = from;
  while (i < to) {
    const ch = t[i];
    if (ch === '/' && t[i + 1] === '/') { let e = t.indexOf('\n', i); if (e < 0 || e > to) e = to; fill(c, i, e, 5); i = e; continue; }
    if (ch === '/' && t[i + 1] === '*') { let e = t.indexOf('*/', i + 2); e = e < 0 ? to : Math.min(e + 2, to); fill(c, i, e, 5); i = e; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { let j = i + 1; while (j < to && t[j] !== ch && (ch === '`' || t[j] !== '\n')) { if (t[j] === '\\') j++; j++; } j = Math.min(j + 1, to); fill(c, i, j, 3); i = j; continue; }
    if (/[0-9]/.test(ch)) { let j = i + 1; while (j < to && /[0-9.]/.test(t[j])) j++; fill(c, i, j, 4); i = j; continue; }
    if (/[A-Za-z_$]/.test(ch)) { let j = i + 1; while (j < to && /[\w$]/.test(t[j])) j++; const w = t.slice(i, j); let k = 0; if (JSKW.has(w)) k = 1; else if (JSBI.has(w)) k = 9; else if (t[j] === '(') k = 6; fill(c, i, j, k); i = j; continue; }
    if ('{}()[];,.'.includes(ch)) fill(c, i, i + 1, 12); else if ('+-*/%=<>!&|?:'.includes(ch)) fill(c, i, i + 1, 11);
    i++;
  }
}
function cssCls(t, c, from, to) {
  let i = from, depth = 0, st = 'sel';
  while (i < to) {
    const ch = t[i];
    if (ch === '/' && t[i + 1] === '*') { let e = t.indexOf('*/', i + 2); e = e < 0 ? to : Math.min(e + 2, to); fill(c, i, e, 5); i = e; continue; }
    if (ch === '{') { fill(c, i, i + 1, 12); depth++; st = 'prop'; i++; continue; }
    if (ch === '}') { fill(c, i, i + 1, 12); depth = Math.max(0, depth - 1); st = depth ? 'prop' : 'sel'; i++; continue; }
    if (st === 'sel') {
      if (ch === '.' || ch === '#') { let j = i + 1; while (j < to && /[\w-]/.test(t[j])) j++; fill(c, i, j, 6); i = j; continue; }
      if (/[A-Za-z]/.test(ch)) { let j = i + 1; while (j < to && /[\w-]/.test(t[j])) j++; fill(c, i, j, 7); i = j; continue; }
      if (',:>+~*[]()'.includes(ch)) fill(c, i, i + 1, 12);
      i++; continue;
    }
    if (st === 'prop') {
      if (/[A-Za-z-]/.test(ch)) { let j = i + 1; while (j < to && /[\w-]/.test(t[j])) j++; fill(c, i, j, 8); i = j; continue; }
      if (ch === ':') { fill(c, i, i + 1, 12); st = 'val'; }
      i++; continue;
    }
    if (ch === ';') { fill(c, i, i + 1, 12); st = 'prop'; i++; continue; }
    if (ch === '#') { let j = i + 1; while (j < to && /[0-9a-fA-F]/.test(t[j])) j++; fill(c, i, j, 4); i = j; continue; }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9.]/.test(t[i + 1] || '')) || (ch === '.' && /[0-9]/.test(t[i + 1] || ''))) { let j = i + 1; while (j < to && /[0-9a-zA-Z.%]/.test(t[j])) j++; fill(c, i, j, 4); i = j; continue; }
    if (ch === '"' || ch === "'") { let j = i + 1; while (j < to && t[j] !== ch && t[j] !== '\n') j++; j = Math.min(j + 1, to); fill(c, i, j, 3); i = j; continue; }
    if (/[A-Za-z]/.test(ch)) { let j = i + 1; while (j < to && /[\w-]/.test(t[j])) j++; fill(c, i, j, t[j] === '(' ? 6 : 9); i = j; continue; }
    if ('(),/'.includes(ch)) fill(c, i, i + 1, 12);
    i++;
  }
}
function htmlCls(t, c) {
  const n = t.length; let i = 0; const low = t.toLowerCase();
  while (i < n) {
    if (t.startsWith('<!--', i)) { let e = t.indexOf('-->', i + 4); e = e < 0 ? n : e + 3; fill(c, i, e, 5); i = e; continue; }
    if (t[i] === '<') {
      let j = i + 1; const closing = t[j] === '/'; if (closing) j++;
      if (t[j] === '!') { let e = t.indexOf('>', j); e = e < 0 ? n : e + 1; fill(c, i, e, 10); i = e; continue; }
      if (/[A-Za-z]/.test(t[j] || '')) {
        let k = j; while (k < n && /[\w-]/.test(t[k])) k++;
        const name = low.slice(j, k); fill(c, i, j, 12); fill(c, j, k, 7);
        let p = k;
        while (p < n && t[p] !== '>' && t[p] !== '<') {
          const ch = t[p];
          if (/\s/.test(ch)) { p++; continue; }
          if (ch === '/') { fill(c, p, p + 1, 12); p++; continue; }
          if (ch === '=') {
            fill(c, p, p + 1, 11); p++; while (p < n && /[ \t]/.test(t[p])) p++;
            if (t[p] === '"' || t[p] === "'") { const q = t[p]; let e = p + 1; while (e < n && t[e] !== q && t[e] !== '\n' && t[e] !== '>') e++; if (t[e] === q) e++; fill(c, p, e, 3); p = e; }
            else { let e = p; while (e < n && !/[\s>]/.test(t[e])) e++; fill(c, p, e, 3); p = e; }
            continue;
          }
          let e = p; while (e < n && /[^\s=>\/<]/.test(t[e])) e++;
          if (e === p) { p++; continue; }
          fill(c, p, e, 8); p = e;
        }
        if (t[p] === '>') { fill(c, p, p + 1, 12); p++; }
        i = p;
        if (!closing && (name === 'style' || name === 'script')) {
          const e = low.indexOf('</' + name, i); const end = e < 0 ? n : e;
          if (name === 'style') cssCls(t, c, i, end); else jsCls(t, c, i, end);
          i = end;
        }
        continue;
      }
    }
    i++;
  }
}
function classify(text, lang) {
  const c = new Uint8Array(text.length);
  if (lang === 'cpp') cppCls(text, c, 0, text.length); else htmlCls(text, c);
  return c;
}

function renderLines(text, cls, mk, cur, ex) {
  const lines = text.split('\n'); let off = 0, out = '';
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li]; let h = '', i = 0;
    while (i < L.length) {
      const c0 = cls[off + i], m0 = mk ? mk[off + i] : 0; let j = i + 1;
      while (j < L.length && cls[off + j] === c0 && (mk ? mk[off + j] : 0) === m0) j++;
      const s = esc(L.slice(i, j)); const cn = (c0 ? CLS[c0] : '') + (m0 ? ' sq' + m0 : '');
      h += cn ? '<span class="' + cn.trim() + '">' + s + '</span>' : s; i = j;
    }
    out += '<div class="ln' + (li + 1 === cur ? ' cur' : '') + (li + 1 === ex ? ' run' : '') + '">' + h + '</div>';
    off += L.length + 1;
  }
  return out;
}

class Editor {
  constructor(o) {
    this.ta = o.ta; this.hl = o.hl; this.gut = o.gut; this.lang = o.lang || 'html'; this.ph = '';
    this.marks = []; this.exec = 0; this.cb = { change: [], caret: [] }; this.busy = false; this.lastCaret = -1; this.problemLines = {};
    const ta = this.ta;
    ta.addEventListener('input', () => { this.render(); this.cb.change.forEach(f => f(this.value)); this.caretCheck(true); });
    ta.addEventListener('scroll', () => this.sync());
    ta.addEventListener('beforeinput', e => this.onBefore(e));
    ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); this.insert(this.unit()); } else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); this.smartEnter(); } });
    ['click', 'keyup', 'focus', 'touchend'].forEach(ev => ta.addEventListener(ev, () => setTimeout(() => this.caretCheck(), 0)));
    document.addEventListener('selectionchange', () => { if (document.activeElement === ta) this.caretCheck(); });
    this.render();
  }
  get value() { return this.ta.value; }
  unit() { return this.lang === 'cpp' ? '    ' : '  '; }
  on(k, f) { this.cb[k].push(f); }
  setLang(l) { this.lang = l; this.render(); }
  setPlaceholder(p) { this.ph = p; this.render(); }
  setValue(v, caret) {
    this.ta.value = v; if (caret !== undefined) this.ta.setSelectionRange(caret, caret);
    this.render(); this.cb.change.forEach(f => f(v)); this.caretCheck(true);
  }
  setMarks(problems) {
    const t = this.value; const mk = new Uint8Array(t.length); this.problemLines = {};
    for (const p of problems) {
      if (!p.line) continue;
      let s = p.off, e = p.off + Math.max(1, p.len || 1);
      if (s >= t.length || t[s] === '\n' || p.code === 'semi' || p.code === 'brace') { s = Math.max(0, s - 1); e = s + 1; }
      const sev = p.sev === 'error' ? 1 : p.sev === 'warning' ? 2 : 3;
      for (let i = s; i < Math.min(e, t.length); i++) if (t[i] !== '\n' && (!mk[i] || sev < mk[i])) mk[i] = sev;
      if (!this.problemLines[p.line] || sev < this.problemLines[p.line]) this.problemLines[p.line] = sev;
    }
    this.mk = mk; this.render();
  }
  setExecLine(n) { this.exec = n || 0; this.render(); if (n) this.scrollToLine(n); }
  caretLine() { const v = this.ta.value; return v.slice(0, this.ta.selectionStart).split('\n').length; }
  caretCheck(force) {
    const l = this.caretLine();
    if (l !== this.lastCaret || force) { this.lastCaret = l; this.render(); this.cb.caret.forEach(f => f(l)); }
  }
  lineH() { return parseFloat(getComputedStyle(this.ta).lineHeight) || 24; }
  scrollToLine(n) {
    const lh = this.lineH(), top = (n - 1) * lh, h = this.ta.clientHeight;
    if (top < this.ta.scrollTop) this.ta.scrollTop = Math.max(0, top - lh);
    else if (top + lh * 2 > this.ta.scrollTop + h) this.ta.scrollTop = top - h + lh * 3;
  }
  gotoLine(n, focus) {
    const lines = this.value.split('\n'); n = Math.max(1, Math.min(n, lines.length));
    let off = 0; for (let i = 0; i < n - 1; i++) off += lines[i].length + 1;
    const end = off + lines[n - 1].length;
    this.ta.setSelectionRange(end, end); this.scrollToLine(n); if (focus) this.ta.focus({ preventScroll: true });
    this.caretCheck(true);
  }
  focus() { this.ta.focus({ preventScroll: true }); }
  render() {
    const v = this.value; const cur = this.lastCaret > 0 ? this.lastCaret : 1;
    if (!v) { this.hl.innerHTML = '<div class="ln ph">' + esc(this.ph || '') + '</div>'; this.renderGutter(1, cur); this.sync(); return; }
    const cls = classify(v, this.lang);
    this.hl.innerHTML = renderLines(v, cls, this.mk && this.mk.length === v.length ? this.mk : null, document.activeElement === this.ta ? cur : 0, this.exec);
    this.renderGutter(v.split('\n').length, cur); this.sync();
  }
  renderGutter(n, cur) {
    let h = '';
    for (let i = 1; i <= n; i++) {
      const s = this.problemLines[i];
      h += '<div class="gn' + (i === cur && document.activeElement === this.ta ? ' cur' : '') + (i === this.exec ? ' run' : '') + (s ? ' bad' + s : '') + '">' + (i === this.exec ? '▶' : i) + '</div>';
    }
    this.gut.innerHTML = h;
  }
  sync() {
    const t = this.ta; this.hl.style.transform = 'translate(' + (-t.scrollLeft) + 'px,' + (-t.scrollTop) + 'px)';
    this.gut.style.transform = 'translateY(' + (-t.scrollTop) + 'px)';
  }
  /* typing helpers */
  insert(text, back) {
    const ta = this.ta; ta.focus({ preventScroll: true }); this.busy = true;
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) { const s = ta.selectionStart; ta.setRangeText(text, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    this.busy = false;
    if (back) { const p = ta.selectionStart - back; ta.setSelectionRange(p, p); this.caretCheck(true); }
  }
  undo() { this.ta.focus({ preventScroll: true }); try { document.execCommand('undo'); } catch (e) { } }
  redo() { this.ta.focus({ preventScroll: true }); try { document.execCommand('redo'); } catch (e) { } }
  smartEnter() {
    const ta = this.ta, v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = v.lastIndexOf('\n', s - 1) + 1; const indent = (/^[ \t]*/.exec(v.slice(ls, s)) || [''])[0];
    const before = v.slice(ls, s).trimEnd(); const after = v.slice(e, e + 1);
    const u = this.unit();
    if (/\{$/.test(before) && after === '}') { this.insert('\n' + indent + u + '\n' + indent, indent.length + 1); return; }
    let extra = '';
    if (/\{$/.test(before)) extra = u;
    else if (this.lang === 'html' && /<(html|head|body|ul|ol|div|table|tr|style|script|section|header|footer|nav|main|form|select)\b[^>]*>$/i.test(before)) extra = u;
    this.insert('\n' + indent + extra);
  }
  onBefore(e) {
    if (this.busy) return;
    const ta = this.ta;
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') { e.preventDefault(); this.smartEnter(); return; }
    if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
    const ch = e.data, v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, nx = v[s], pv = v[s - 1];
    const pairs = { '(': ')', '[': ']', '{': '}' }; const closers = ')]}';
    if (s === en && closers.includes(ch) && nx === ch) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); this.caretCheck(true); return; }
    if (pairs[ch]) { e.preventDefault(); this.insert(ch + pairs[ch], 1); return; }
    if (ch === '"' || (ch === "'" && this.lang === 'cpp')) {
      if (s === en && nx === ch) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); this.caretCheck(true); return; }
      if (pv === '\\' || (ch === "'" && isW(pv)) || (ch === '"' && isW(pv) && this.lang === 'cpp')) return;
      e.preventDefault(); this.insert(ch + ch, 1);
    }
  }
}
G.CPEditor = Editor;
G.CPKeys = {
  cpp: [['; ', ';'], ['{ }', '{}', 1], ['( )', '()', 1], ['" "', '""', 1], ['<<', ' << '], ['>>', ' >> '], ['=', ' = '], ['==', ' == '], ['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['%', ' % '], ['<', '<'], ['>', '>'], ['[ ]', '[]', 1], ['#', '#'], ['&&', ' && '], ['||', ' || '], ['!', '!'], ['++', '++'], ['cout', 'cout << '], ['cin', 'cin >> '], ['endl', 'endl'], ['int', 'int '], ['string', 'string '], ['if', 'if () {}', 4], ['for', 'for (int i = 0; i < 5; i++) {}', 1], ['while', 'while () {}', 4], ['return', 'return ']],
  html: [['< >', '<>', 1], ['</', '</'], ['>', '>'], ['"', '""', 1], ['=', '='], ['/', '/'], ['h1', '<h1></h1>', 5], ['p', '<p></p>', 4], ['a', '<a href=""></a>', 6], ['img', '<img src="" alt="">', 9], ['div', '<div></div>', 6], ['b', '<b></b>', 4], ['i', '<i></i>', 4], ['button', '<button></button>', 9], ['ul', '<ul>\n  <li></li>\n</ul>', 11], ['br', '<br>'], ['style', '<style>\n  \n</style>', 9], ['!--', '<!--  -->', 4]]
};
})(typeof window !== 'undefined' ? window : globalThis);
