/* CodePop HTML engine: lint with fix-its, line modes, build log, safe preview document */
(function (G) {
'use strict';
const X = G.HTMLX = {};
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const KNOWN = new Set('a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark marquee menu meta meter nav noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script section select small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track u ul var video wbr'.split(' '));
const OPTIONAL = new Set(['p', 'li', 'td', 'th', 'tr', 'dt', 'dd', 'option', 'tbody', 'thead', 'tfoot']);
const INLINEISH = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'a', 'b', 'i', 'strong', 'em', 'span', 'button', 'title', 'td', 'th', 'label', 'small', 'u', 'code', 'pre', 'option', 'dt', 'dd', 'mark', 'sup', 'sub', 'q', 'cite']);
X.KNOWN = KNOWN; X.VOID = VOID;

X.tagRule = function (t) {
  t = t.toLowerCase();
  if (/^h[1-6]$/.test(t)) return 'h';
  if (t === 'ol') return 'ul';
  if (t === 'strong') return 'b';
  if (t === 'em') return 'i';
  if (t === 'textarea' || t === 'select') return 'input';
  if (['header', 'footer', 'nav', 'main', 'section', 'article', 'aside'].includes(t)) return 'sem';
  if (['thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(t)) return 'table';
  if (['html', 'head', 'title', 'meta', 'body', 'p', 'a', 'img', 'br', 'hr', 'ul', 'li', 'div', 'span', 'b', 'i', 'button', 'input', 'style', 'script', 'table'].includes(t)) return t;
  return KNOWN.has(t) ? 'other' : 'unknown';
};
function mkPos(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return off => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return { line: lo + 1, col: off - starts[lo] + 1 }; };
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
const POP = ['h1', 'h2', 'h3', 'p', 'a', 'b', 'i', 'div', 'span', 'img', 'ul', 'ol', 'li', 'button', 'body', 'head', 'html', 'title', 'table', 'br', 'hr', 'style', 'script', 'input'];
function suggest(tag) {
  let best = null, bd = 9, br = 99;
  for (const k of KNOWN) {
    const d = lev(tag, k), rk = POP.indexOf(k) < 0 ? 98 : POP.indexOf(k);
    if (d < bd || (d === bd && rk < br)) { bd = d; br = rk; best = k; }
  }
  return bd <= (tag.length <= 2 ? 1 : 2) ? best : null;
}
const TAGRE = () => /<!--[\s\S]*?(?:-->|$)|<!doctype[^>]*>?|<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^<>"'])*)(>?)/gi;

X.lint = function (src) {
  const P = mkPos(src); const probs = []; const stack = [];
  const hasDoctype = /^\s*<!doctype/i.test(src); let sawHtml = false;
  const low = src.toLowerCase();
  const add = (sev, code, msg, off, len, extra) => { const p = P(off); probs.push(Object.assign({ sev, code, msg, off, len: Math.max(1, len), line: p.line, col: p.col }, extra || {})); };
  const lineEnd = off => { let e = src.indexOf('\n', off); if (e < 0) e = src.length; while (e > off && /[ \t\r]/.test(src[e - 1])) e--; return e; };
  const re = TAGRE(); let m;
  while ((m = re.exec(src))) {
    const full = m[0], off = m.index, end = off + full.length;
    if (full.startsWith('<!--') || /^<!doctype/i.test(full)) continue;
    const isClose = full[1] === '/'; const tag = m[1].toLowerCase(); const attrs = m[2] || ''; const gt = m[3];
    if (!gt) {
      const nx = src[end];
      if (nx === '"' || nx === "'") {
        let ins = src.indexOf('>', end); const eol = lineEnd(end);
        if (ins < 0 || ins > eol) ins = eol;
        add('error', 'attrquote', 'Attribute value is missing its closing quote', end, 1, { fixes: [{ edits: [{ s: ins, e: ins, t: nx }] }], data: { tag: '<' + tag + '>' } });
      } else {
        const at = end; add('error', 'tagend', 'Tag <' + tag + ' is missing its closing >', off, full.length, { fixes: [{ edits: [{ s: at, e: at, t: '>' }] }], data: { tag: '<' + tag } });
      }
    }
    if (!KNOWN.has(tag)) {
      if (!isClose) { const sug = suggest(tag); add('warning', 'unknowntag', 'Unknown element <' + tag + '>', off, full.length, { data: { tag: '<' + tag + '>', sug: sug ? '<' + sug + '>' : '?' }, fixes: sug ? [{ edits: [{ s: off + 1, e: off + 1 + tag.length, t: sug }].concat(low.indexOf('</' + tag, end) >= 0 && stack.length === 0 ? [] : []) }] : null }); }
      continue;
    }
    if (tag === 'html' && !isClose) sawHtml = true;
    if (!isClose) {
      if (tag === 'img') {
        const hasSrc = /\bsrc\s*=/i.test(attrs), hasAlt = /\balt\s*=/i.test(attrs);
        const ie = /\/\s*>$/.test(full) ? end - 2 : end - 1;
        if (!hasSrc) add('warning', 'imgsrc', 'Element <img> is missing a src attribute', off, full.length, { data: {}, fixes: gt ? [{ edits: [{ s: ie, e: ie, t: ' src="cat.png"' }] }] : null });
        else if (!hasAlt && gt) add('hint', 'imgalt', 'Element <img> is missing an alt attribute', off, full.length, { data: {}, fixes: [{ edits: [{ s: ie, e: ie, t: ' alt="picture"' }] }] });
      }
      if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
      const p = P(off); stack.push({ tag, off, end, line: p.line, col: p.col });
      if (tag === 'style' || tag === 'script') { const ci = low.indexOf('</' + tag, end); re.lastIndex = ci >= 0 ? ci : src.length; }
    } else {
      if (VOID.has(tag)) continue;
      let idx = -1; for (let k = stack.length - 1; k >= 0; k--) if (stack[k].tag === tag) { idx = k; break; }
      if (idx < 0) { add('error', 'strayclose', 'Stray end tag </' + tag + '>', off, full.length, { data: { tag: '</' + tag + '>' }, fixes: [{ edits: [{ s: off, e: end, t: '' }] }] }); continue; }
      while (stack.length - 1 > idx) {
        const o = stack.pop(); const sev = OPTIONAL.has(o.tag) ? 'warning' : 'error';
        const closeTxt = '</' + o.tag + '>'; const sameLine = P(off).line === o.line;
        const restOfLine = src.slice(o.end, lineEnd(o.end)).trim();
        if (!sameLine && INLINEISH.has(o.tag) && restOfLine) {
          const at = lineEnd(o.end);
          add(sev, 'unclosed', 'Unclosed element <' + o.tag + '>', o.off, o.end - o.off, { data: { tag: '<' + o.tag + '>', close: closeTxt }, fixes: [{ edits: [{ s: at, e: at, t: closeTxt }] }] });
        } else {
          const lineStart = src.lastIndexOf('\n', off - 1) + 1; const before = src.slice(lineStart, off);
          const t = /^\s*$/.test(before) ? closeTxt + '\n' + before : closeTxt;
          add(sev, 'mismatch', 'End tag </' + tag + '> seen, but <' + o.tag + '> is still open', off, full.length, { data: { tag: '</' + tag + '>', open: '<' + o.tag + '>', close: closeTxt }, fixes: [{ edits: [{ s: off, e: off, t }] }] });
        }
      }
      stack.pop();
    }
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const o = stack[k]; const sev = OPTIONAL.has(o.tag) ? 'warning' : 'error'; const closeTxt = '</' + o.tag + '>';
    const restOfLine = src.slice(o.end, lineEnd(o.end)).trim();
    let fix;
    if (INLINEISH.has(o.tag) && restOfLine) { const at = lineEnd(o.end); fix = { edits: [{ s: at, e: at, t: closeTxt }] }; }
    else fix = { edits: [{ s: src.length, e: src.length, t: (src.endsWith('\n') || !src.length ? '' : '\n') + closeTxt + '\n' }] };
    add(sev, 'unclosed', 'Unclosed element <' + o.tag + '>', o.off, o.end - o.off, { data: { tag: '<' + o.tag + '>', close: closeTxt }, fixes: [fix] });
  }
  if (sawHtml && !hasDoctype) add('hint', 'nodoctype', 'Missing <!DOCTYPE html>', 0, 1, { data: {}, fixes: [{ edits: [{ s: 0, e: 0, t: '<!DOCTYPE html>\n' }] }] });
  probs.sort((a, b) => a.off - b.off);
  return probs;
};
X.formatProblem = function (p) { return { cls: p.sev === 'error' ? 'err' : p.sev === 'warning' ? 'warn' : 'note', text: 'index.html:' + p.line + ':' + p.col + ': ' + p.sev + ': ' + p.msg }; };

/* line modes: html | css | js | comment */
X.lineModes = function (text) {
  const lines = text.split('\n'); const modes = []; let st = 'html';
  for (const raw of lines) {
    const l = raw.toLowerCase();
    if (st === 'css') { if (/<\/style/.test(l)) { modes.push('html'); st = 'html'; } else modes.push('css'); continue; }
    if (st === 'js') { if (/<\/script/.test(l)) { modes.push('html'); st = 'html'; } else modes.push('js'); continue; }
    if (st === 'comment') { modes.push('comment'); if (l.includes('-->')) st = 'html'; continue; }
    modes.push('html');
    const lo = l.lastIndexOf('<style'), lc = l.lastIndexOf('</style');
    if (lo >= 0 && lo > lc) { st = 'css'; continue; }
    const so = l.lastIndexOf('<script'), sc = l.lastIndexOf('</script');
    if (so >= 0 && so > sc && !/\bsrc\s*=/.test(l)) { st = 'js'; continue; }
    const co = l.lastIndexOf('<!--'), cc = l.lastIndexOf('-->');
    if (co >= 0 && co > cc) st = 'comment';
  }
  return modes;
};

/* build log: what each line creates */
X.buildLog = function (src, lang) {
  const C = G.CONTENT; const out = []; const P = mkPos(src); const modes = X.lineModes(src); const lines = src.split('\n');
  const re = TAGRE(); let m;
  while ((m = re.exec(src))) {
    const full = m[0]; if (full.startsWith('<!--') || /^<!doctype/i.test(full)) continue;
    const tag = m[1].toLowerCase(); if (!KNOWN.has(tag)) continue;
    const line = P(m.index).line; const isClose = full[1] === '/';
    if (!isClose) {
      const rule = X.tagRule(tag); const ex = C.EX.html[rule]; const noun = (ex.t[lang] || ex.t.en)[2] || tag;
      let text = ''; const after = src.slice(m.index + full.length, m.index + full.length + 80); const tm = /^([^<\n]+)/.exec(after);
      if (tm && tm[1].trim() && !['html', 'head', 'body', 'style', 'script', 'ul', 'ol', 'table'].includes(tag)) text = ': “' + tm[1].trim().slice(0, 28) + '”';
      out.push({ kind: 'open', line, tag: '<' + tag + '>', noun, text });
      if (tag === 'img') { const sm = /src\s*=\s*["']([^"']*)["']/i.exec(full); if (sm) { const nm = sm[1].split('/').pop().replace(/\.\w+$/, ''); if (!C.STICKERS[nm]) out.push({ kind: 'pic', line, src: sm[1] }); } }
    } else if (!VOID.has(tag)) out.push({ kind: 'close', line, tag: '</' + tag + '>' });
    if (tag === 'style' || tag === 'script') { const ci = src.toLowerCase().indexOf('</' + tag, m.index + full.length); if (ci >= 0 && !isClose) re.lastIndex = ci; }
  }
  const cre = /([a-z-]+)\s*:\s*([^;{}]+)/gi;
  lines.forEach((ln, i) => {
    if (modes[i] !== 'css') return;
    let mm; cre.lastIndex = 0;
    while ((mm = cre.exec(ln))) {
      if (ln.slice(cre.lastIndex).trim().startsWith('{')) continue;
      out.push({ kind: 'css', line: i + 1, prop: mm[1], v: mm[2].trim() });
    }
  });
  out.sort((a, b) => a.line - b.line);
  return out;
};

/* safe preview document */
const svgPic = e => 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text x='50' y='54' font-size='78' text-anchor='middle' dominant-baseline='central'>" + e + '</text></svg>');
const INJECT = "<script>(function(){function s(t,d){try{parent.postMessage({codepop:1,type:t,data:d},'*')}catch(e){}}" +
  "['log','warn','error','info'].forEach(function(k){var o=console[k];console[k]=function(){var a=[].slice.call(arguments).map(function(x){try{return typeof x==='object'?JSON.stringify(x):String(x)}catch(e){return String(x)}}).join(' ');s('log',{k:k,text:a});try{o.apply(console,arguments)}catch(e){}}});" +
  "window.addEventListener('error',function(e){s('log',{k:'error',text:(e.message||'Error')+(e.lineno?' (script line '+e.lineno+')':'')})});" +
  "document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a');if(a){e.preventDefault();s('link',a.getAttribute('href')||'')}},true);" +
  "document.addEventListener('submit',function(e){e.preventDefault()},true);s('ready',1);})();<\/script>";
X.previewDoc = function (src) {
  const C = G.CONTENT;
  let out = src.replace(/(\bsrc\s*=\s*)(["'])([^"']*)\2/gi, (all, pre, q, val) => {
    const nm = val.split('/').pop().replace(/\.\w+$/, '').toLowerCase();
    return C.STICKERS[nm] ? pre + q + svgPic(C.STICKERS[nm]) + q : all;
  });
  const dm = /^\s*<!doctype[^>]*>/i.exec(out);
  const at = dm ? dm[0].length : 0;
  return out.slice(0, at) + INJECT + out.slice(at);
};
})(typeof window !== 'undefined' ? window : globalThis);
