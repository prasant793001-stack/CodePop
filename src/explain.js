/* CodePop explainer: line analysis for html/css/js/cpp, rendering with spoken language + theme voice, glossary */
(function (G) {
'use strict';
const E = G.EXPL = {};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
E.esc = esc;

function fmt(tpl, p) {
  let out = '', last = 0; const re = /~([^~]*)~|\{(\w+)\}/g; let m;
  while ((m = re.exec(tpl))) {
    out += esc(tpl.slice(last, m.index));
    if (m[1] !== undefined) out += '<code>' + esc(m[1]) + '</code>';
    else { const k = m[2], v = p && p[k]; if (v === undefined) out += esc(m[0]); else out += k[0] === '_' ? esc(String(v)) : '<code>' + esc(String(v)) + '</code>'; }
    last = re.lastIndex;
  }
  return out + esc(tpl.slice(last));
}
function plain(tpl, p) { return esc(tpl.replace(/\{(\w+)\}/g, (a, k) => p[k] !== undefined ? p[k] : a)); }
E.fmt = fmt;
E.theme = id => G.CONTENT.THEMES.find(t => t.id === id) || G.CONTENT.THEMES[0];

/* ---------- HTML / CSS / JS analysis ---------- */
const CSSMAP = [[/^color$/, 'color'], [/^background(-color)?$/, 'bg'], [/^font-size$/, 'fsize'], [/^font-family$/, 'ffam'], [/^font-weight$/, 'fweight'], [/^text-align$/, 'talign'], [/^margin/, 'margin'], [/^padding/, 'padding'], [/^border-radius$/, 'radius'], [/^border/, 'border'], [/^(min-|max-)?(width|height)$/, 'size'], [/^display$/, 'display']];
function cssDecl(text) {
  const out = []; const re = /([a-z-]+)\s*:\s*([^;{}]+)/gi; let m;
  while ((m = re.exec(text))) {
    if (text.slice(re.lastIndex).trim().startsWith('{')) continue;
    const prop = m[1].toLowerCase(); let id = 'other'; for (const [r, k] of CSSMAP) if (r.test(prop)) { id = k; break; }
    out.push({ ns: 'css', id, params: { prop, v: m[2].trim() }, chip: prop });
  }
  return out;
}
function analyzeHtmlLine(line, mode) {
  const s = line.trim();
  if (!s) return { ns: 'html', id: 'blank', params: {}, chip: '' };
  if (mode === 'comment' || /^<!--/.test(s)) return { ns: 'html', id: 'comment', params: {}, chip: '<!-- -->' };
  if (mode === 'css') {
    if (/^\/\*/.test(s)) return { ns: 'html', id: 'comment', params: {}, chip: '/* */' };
    if (/^\}/.test(s) && !/\{/.test(s)) return { ns: 'css', id: 'cclose', params: {}, chip: '}' };
    const decls = cssDecl(s);
    if (/\{/.test(s)) { const sel = s.slice(0, s.indexOf('{')).trim(); return { ns: 'css', id: 'sel', params: { sel }, chip: sel, extras: decls }; }
    if (decls.length) { const [f, ...rest] = decls; return Object.assign({}, f, { extras: rest }); }
    return { ns: 'css', id: 'other', params: { prop: s.replace(/[;:].*/, ''), v: '' }, chip: s.slice(0, 18) };
  }
  if (mode === 'js') {
    let m;
    if ((m = /^console\.(log|warn|error)\((.*)\);?$/.exec(s))) return { ns: 'js', id: 'log', params: { a: m[2] }, chip: 'console.log' };
    if ((m = /^(let|const|var)\s+(\w+)/.exec(s))) return { ns: 'js', id: 'var', params: { name: m[2] }, chip: m[1] };
    if ((m = /^function\s+(\w+)/.exec(s))) return { ns: 'js', id: 'fn', params: { name: m[2] || m[1] }, chip: 'function' };
    return { ns: 'js', id: 'other', params: {}, chip: s.slice(0, 18) };
  }
  const re = /<!doctype[^>]*>|<\/?([a-zA-Z][\w-]*)[^<>]*>?/gi; const toks = []; let m;
  while ((m = re.exec(s))) toks.push({ full: m[0], tag: m[1] ? m[1].toLowerCase() : 'doctype', close: m[0][1] === '/', at: m.index });
  if (!toks.length) return { ns: 'html', id: 'text', params: { }, chip: s.slice(0, 18), text: s };
  const first = toks.find(t => !t.close) || toks[0];
  const textOnLine = s.replace(/<[^>]*>?/g, '').trim();
  const mk = t => {
    if (t.close) return { ns: 'html', id: 'close', params: { tag: '</' + t.tag + '>' }, chip: '</' + t.tag + '>' };
    if (t.tag === 'doctype') return { ns: 'html', id: 'doctype', params: {}, chip: '<!DOCTYPE>' };
    const rule = G.HTMLX.tagRule(t.tag);
    return { ns: 'html', id: rule, params: { tag: '<' + t.tag + '>' }, chip: '<' + t.tag + '>' };
  };
  const main = mk(first); const seen = new Set([main.id + main.chip]);
  const extras = [];
  for (const t of toks) { if (t === first) continue; const x = mk(t); const key = x.id + x.chip; if (x.id === 'close' && toks.some(o => !o.close && o.tag === t.tag)) continue; if (seen.has(key)) continue; seen.add(key); extras.push(x); }
  main.extras = extras.slice(0, 3);
  if (textOnLine && main.id !== 'close') main.text = textOnLine;
  return main;
}

/* ---------- C++ analysis ---------- */
function cppContext(text) {
  const lines = text.split('\n'); const info = lines.map(() => ({ opens: null, closes: null }));
  const stack = []; let i = 0, line = 0, stmt = 0, par = 0; const n = text.length;
  const kindOf = h => {
    h = h.trim();
    if (/^(else\s+if|if)\b/.test(h)) return 'if'; if (/^else\b/.test(h)) return 'else'; if (/^for\b/.test(h)) return 'for';
    if (/^while\b/.test(h)) return 'while'; if (/^do\b/.test(h)) return 'do'; if (/\bmain\s*\(/.test(h)) return 'main';
    if (/^[\w:<>,&*\s]+\s+\w+\s*\([^)]*\)\s*$/.test(h)) return 'func';
    return 'block';
  };
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); const seg = text.slice(i, e < 0 ? n : e); line += (seg.match(/\n/g) || []).length; i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'") { i++; while (i < n && text[i] !== c && text[i] !== '\n') { if (text[i] === '\\') i++; i++; } i++; continue; }
    if (c === '#' && (i === 0 || text[i - 1] === '\n')) { while (i < n && text[i] !== '\n') i++; stmt = i; continue; }
    if (c === '{') { const k = kindOf(text.slice(stmt, i)); stack.push(k); if (!info[line].opens) info[line].opens = k; stmt = i + 1; }
    else if (c === '}') { const k = stack.pop() || 'block'; if (!info[line].closes) info[line].closes = k; stmt = i + 1; }
    else if (c === '(') par++;
    else if (c === ')') par = Math.max(0, par - 1);
    else if (c === ';' && par === 0) stmt = i + 1;
    i++;
  }
  return info;
}
const TYPEW = '(?:const\\s+)?(?:unsigned\\s+|long\\s+|short\\s+)*(?:int|long|short|float|double|bool|char|string|auto)';
function between(s) { const a = s.indexOf('('); const b = s.lastIndexOf(')'); return a >= 0 && b > a ? s.slice(a + 1, b).trim() : ''; }
function analyzeCppLine(line, ctx) {
  const s = line.trim(); let m;
  const R = (id, params, chip, extra) => Object.assign({ ns: 'cpp', id, params: params || {}, chip: chip || '' }, extra || {});
  if (!s) return R('blank');
  if (/^(\/\/|\/\*|\*)/.test(s)) return R('comment', {}, '//');
  if ((m = /^#\s*include\s*([<"][^>"]+[>"])/.exec(s))) return R('include', { lib: m[1] }, '#include');
  if (/^using\s+(namespace\s+std|std::\w+)\s*;/.test(s)) return R('using', {}, 'using');
  if (/^(int|void)\s+main\s*\(/.test(s)) return R('main', {}, 'int main()');
  if (s === '{') return R('open', { _kind: ctx && ctx.opens || 'block' }, '{');
  if (/^\}\s*;?$/.test(s)) return R('close', { _kind: ctx && ctx.closes || 'block' }, '}');
  if (/^\}\s*while\b/.test(s)) return R('dowhile', { cond: between(s) }, '} while');
  if ((m = /^(\}\s*)?else\s+if\s*\(/.exec(s))) return R('elseif', { cond: between(s) }, 'else if');
  if (/^(\}\s*)?else\b/.test(s)) return R('else', {}, 'else');
  if (/^return\s+0\s*;/.test(s)) return R('return0', {}, 'return 0;');
  if ((m = /^return\b\s*(.*?)\s*;?$/.exec(s))) return R('return', { a: m[1] || '—' }, 'return');
  if ((m = /^(?:std::)?cout\s*<<\s*(.*?)\s*;?$/.exec(s))) return R('cout', { a: m[1] }, 'cout');
  if ((m = /^(?:std::)?cin\s*>>\s*(.*?)\s*;?$/.exec(s))) return R('cin', { a: m[1] }, 'cin');
  if ((m = /^(?:std::)?getline\s*\(\s*(?:std::)?cin\s*,\s*(\w+)/.exec(s))) return R('getline', { a: m[1] }, 'getline');
  if (/^if\s*\(/.test(s)) return R('if', { cond: between(s) }, 'if');
  if (/^for\s*\(/.test(s)) {
    const inner = between(s);
    if ((m = /^[^;]*?(\w+)\s*:\s*(\w+)\s*$/.exec(inner)) && !inner.includes(';')) return R('forrange', { name: m[1], coll: m[2] }, 'for');
    const parts = inner.split(';').map(x => x.trim());
    return R('for', { a: parts[0] || '—', b: parts[1] || '—', c: parts[2] || '—' }, 'for');
  }
  if (/^while\s*\(/.test(s)) return R('while', { cond: between(s) }, 'while');
  if (/^do\b/.test(s)) return R('do', {}, 'do');
  if (/^break\s*;/.test(s)) return R('break', {}, 'break');
  if (/^continue\s*;/.test(s)) return R('continue', {}, 'continue');
  if ((m = /^(?:std::)?vector\s*<\s*([\w:]+)\s*>\s+(\w+)/.exec(s))) return R('vec', { name: m[2] }, 'vector');
  if ((m = new RegExp('^(' + TYPEW + ')\\s+(\\w+)\\s*\\[\\s*(\\w*)\\s*\\]').exec(s))) return R('arr', { type: m[1].replace(/^const\s+/, ''), name: m[2], n: m[3] || '?' }, m[1]);
  if ((m = /^(?:const\s+)?((?:unsigned\s+|long\s+)*(?:int|long|short|float|double|bool|char|string|auto|void)|vector\s*<[^>]*>)\s+(\w+)\s*\(([^)]*)\)\s*(\{|;)?\s*$/.exec(s)) && m[2] !== 'main' && !/=/.test(s))
    return R('funcdef', { name: m[2], params: m[3].trim() || '—', type: m[1] }, m[1]);
  if ((m = new RegExp('^(' + TYPEW + ')\\s+(\\w+)\\s*(?:=\\s*(.+?))?\\s*(?:,.*)?;?$').exec(s)) && !/\(.*\)\s*\{/.test(s)) {
    const type = m[1].replace(/^const\s+/, '').trim(); const base = /string/.test(type) ? 'string' : /double|float/.test(type) ? 'double' : /long/.test(type) ? 'long' : /bool/.test(type) ? 'bool' : /char/.test(type) ? 'char' : /auto/.test(type) ? 'auto' : 'int';
    const val = m[3] ? m[3].replace(/;$/, '') : '';
    return R('decl', { type, name: m[2], _base: base, _val: val }, type + ' ' + m[2]);
  }
  if ((m = /^([\w\[\].]+)\s*(=|\+=|-=|\*=|\/=|%=)\s*(.+?)\s*;$/.exec(s))) return R('assign', { name: m[1], a: m[3] }, m[1] + ' ' + m[2]);
  if ((m = /^(?:\+\+|--)?(\w+)(?:\+\+|--)?\s*;$/.exec(s)) && /\+\+|--/.test(s)) return R('incr', { name: m[1] }, /\+\+/.test(s) ? '++' : '--');
  if ((m = /^(\w+)\.(\w+)\s*\((.*)\)\s*;$/.exec(s))) return R('method', { name: m[1], a: '.' + m[2] + '(' + m[3] + ')' }, '.' + m[2]);
  if ((m = /^(\w+)\s*\((.*)\)\s*;$/.exec(s)) && !/^(if|for|while|switch|return)$/.test(m[1])) return R('call', { name: m[1] }, m[1] + '()');
  return R('unknown', {}, s.slice(0, 16));
}

E.analyze = function (lang, text) {
  const lines = text.split('\n');
  if (lang === 'html') { const modes = G.HTMLX.lineModes(text); return lines.map((l, i) => Object.assign(analyzeHtmlLine(l, modes[i]), { n: i + 1, mode: modes[i] })); }
  const ctx = cppContext(text);
  return lines.map((l, i) => Object.assign(analyzeCppLine(l, ctx[i]), { n: i + 1 }));
};

/* ---------- rendering ---------- */
function rule(ns, id) { const C = G.CONTENT; return (C.EX[ns] && C.EX[ns][id]) || C.EX[ns === 'css' || ns === 'js' ? ns : 'html'].other || C.EX.cpp.unknown; }
E.render = function (info, spoken, themeId) {
  const C = G.CONTENT; const r = rule(info.ns, info.id);
  const parts = r.t[spoken] || r.t.en;
  const params = Object.assign({}, info.params);
  if (info.ns === 'cpp') {
    if (info.id === 'open' || info.id === 'close') params._kind = (C.KIND[spoken] || C.KIND.en)[params._kind] || params._kind;
    if (info.id === 'decl') {
      params._tn = (C.TN[spoken] || C.TN.en)[params._base] || '';
      params._valpart = params._val ? fmt((C.UI[spoken] || C.UI.en).holding.replace('{val}', '{_v}'), { _v: params._val }) : '';
      params._valpart = params._val ? plain((C.UI[spoken] || C.UI.en).holding, { val: params._val }) : '';
    }
  }
  const theme = E.theme(themeId); const nouns = theme.nouns[spoken] || theme.nouns.en;
  const cat = r.c; const pc = C.CATMAP[cat] || cat; const ptpl = (C.PLAY[spoken] || C.PLAY.en)[pc] || '';
  const decl = info.id === 'decl' ? true : false;
  const out = {
    e: r.e, chip: info.chip, ns: info.ns, id: info.id, cat,
    what: fmt(parts[0], params).replace(/&amp;/g, '&amp;'), why: fmt(parts[1], params),
    play: ptpl ? plain(ptpl, nouns) : '', noun: parts[2] || '', text: info.text || '', extras: []
  };
  if (decl) { /* valpart is plain text, inject safely */ out.what = fmt(parts[0].replace('{_valpart}', '\u0001'), params).replace('\u0001', esc(params._valpart)); }
  for (const x of (info.extras || [])) { const xr = E.render(x, spoken, themeId); out.extras.push({ e: xr.e, chip: xr.chip, what: xr.what }); }
  return out;
};
E.creates = function (info, spoken) {
  const r = rule(info.ns, info.id); const parts = r.t[spoken] || r.t.en; return { e: r.e, noun: parts[2] || '' };
};

/* ---------- glossary / ask ---------- */
const GLOSS = {
  html: { '<!doctype': ['html', 'doctype'], doctype: ['html', 'doctype'], html: ['html', 'html'], head: ['html', 'head'], title: ['html', 'title'], meta: ['html', 'meta'], body: ['html', 'body'], h1: ['html', 'h'], h2: ['html', 'h'], h3: ['html', 'h'], heading: ['html', 'h'], p: ['html', 'p'], paragraph: ['html', 'p'], a: ['html', 'a'], link: ['html', 'a'], href: ['html', 'a'], img: ['html', 'img'], image: ['html', 'img'], picture: ['html', 'img'], br: ['html', 'br'], hr: ['html', 'hr'], ul: ['html', 'ul'], ol: ['html', 'ul'], list: ['html', 'ul'], li: ['html', 'li'], div: ['html', 'div'], span: ['html', 'span'], b: ['html', 'b'], bold: ['html', 'b'], strong: ['html', 'b'], i: ['html', 'i'], italic: ['html', 'i'], button: ['html', 'button'], input: ['html', 'input'], style: ['html', 'style'], css: ['html', 'style'], script: ['html', 'script'], javascript: ['html', 'script'], table: ['html', 'table'], tag: ['html', 'close'], closing: ['html', 'close'],
    color: ['css', 'color'], background: ['css', 'bg'], 'font-size': ['css', 'fsize'], 'font-family': ['css', 'ffam'], 'font-weight': ['css', 'fweight'], 'text-align': ['css', 'talign'], margin: ['css', 'margin'], padding: ['css', 'padding'], border: ['css', 'border'], 'border-radius': ['css', 'radius'], width: ['css', 'size'], height: ['css', 'size'], display: ['css', 'display'], selector: ['css', 'sel'] },
  cpp: { include: ['cpp', 'include'], iostream: ['cpp', 'include'], using: ['cpp', 'using'], namespace: ['cpp', 'using'], std: ['cpp', 'using'], main: ['cpp', 'main'], return: ['cpp', 'return'], cout: ['cpp', 'cout'], endl: ['cpp', 'cout'], print: ['cpp', 'cout'], cin: ['cpp', 'cin'], getline: ['cpp', 'getline'], int: ['cpp', 'decl', { type: 'int', name: 'x', _base: 'int', _val: '5' }], double: ['cpp', 'decl', { type: 'double', name: 'x', _base: 'double', _val: '3.14' }], string: ['cpp', 'decl', { type: 'string', name: 'name', _base: 'string', _val: '"Sam"' }], bool: ['cpp', 'decl', { type: 'bool', name: 'ok', _base: 'bool', _val: 'true' }], char: ['cpp', 'decl', { type: 'char', name: 'c', _base: 'char', _val: "'a'" }], variable: ['cpp', 'decl', { type: 'int', name: 'x', _base: 'int', _val: '5' }], array: ['cpp', 'arr', { type: 'int', name: 'a', n: '5' }], vector: ['cpp', 'vec', { name: 'v' }], if: ['cpp', 'if', { cond: 'x > 3' }], else: ['cpp', 'else'], for: ['cpp', 'for', { a: 'int i = 0', b: 'i < 5', c: 'i++' }], while: ['cpp', 'while', { cond: 'x < 5' }], loop: ['cpp', 'for', { a: 'int i = 0', b: 'i < 5', c: 'i++' }], do: ['cpp', 'do'], break: ['cpp', 'break'], continue: ['cpp', 'continue'], function: ['cpp', 'funcdef', { name: 'add', params: 'int a, int b', type: 'int' }], semicolon: ['cpp', 'blank'], comment: ['cpp', 'comment'] }
};
E.ask = function (lang, query, spoken, themeId) {
  const words = String(query || '').toLowerCase().replace(/[<>/();{}'"?!.,]/g, ' ').split(/\s+/).filter(Boolean);
  const order = lang === 'html' ? ['html', 'cpp'] : ['cpp', 'html'];
  for (const set of order) for (const w of words) {
    const g = GLOSS[set][w];
    if (g) {
      const info = { ns: g[0], id: g[1], params: Object.assign({ a: '…', tag: '<' + w + '>', prop: w, v: '…', sel: 'h1', name: 'x', cond: 'x > 3', lib: '<iostream>', _kind: 'block' }, g[2] || {}), chip: w, extras: [] };
      return E.render(info, spoken, themeId);
    }
  }
  return null;
};
})(typeof window !== 'undefined' ? window : globalThis);
