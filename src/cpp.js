/* CodePop C++ engine: tokenizer, parser, checker (g++-style problems with fix-its), async interpreter */
(function (G) {
'use strict';
const CP = G.CP = G.CP || {};

const TYPENAMES = new Set(['int','long','short','unsigned','signed','float','double','bool','char','string','void','auto']);
const RESERVED = new Set(['if','else','for','while','do','return','break','continue','const','using','namespace','switch','case','default','struct','class','new','delete','static','goto','try','catch','throw','typedef','template']);
const UNSUPPORTED = new Set(['switch','struct','class','new','delete','goto','try','template','typedef']);
const ASSIGN = new Set(['=','+=','-=','*=','/=','%=']);
const BINPREC = {'||':1,'&&':2,'==':3,'!=':3,'<':4,'>':4,'<=':4,'>=':4,'<<':5,'>>':5,'+':6,'-':6,'*':7,'/':7,'%':7};
const STD = {
  cout:{h:['iostream']}, cerr:{h:['iostream']}, cin:{h:['iostream']}, endl:{h:['iostream']},
  string:{h:['iostream','string']}, vector:{h:['vector']}, getline:{h:['iostream','string']},
  to_string:{h:['iostream','string']}, stoi:{h:['iostream','string']}, stod:{h:['iostream','string']},
  max:{h:['iostream','algorithm','vector']}, min:{h:['iostream','algorithm','vector']}, swap:{h:['iostream','algorithm','vector']},
  fixed:{h:['iostream','iomanip']}, setprecision:{h:['iomanip']}, setw:{h:['iomanip']}
};
const GFN = {
  sqrt:['cmath'], pow:['cmath'], floor:['cmath'], ceil:['cmath'], round:['cmath'], fabs:['cmath'], sin:['cmath'], cos:['cmath'],
  tan:['cmath'], log:['cmath'], log10:['cmath'], exp:['cmath'],
  abs:['cmath','cstdlib','iostream','string'], rand:['cstdlib','cmath','iostream','string'], srand:['cstdlib','cmath','iostream','string'],
  exit:['cstdlib','cmath','iostream','string'], time:['ctime']
};
const NUMERIC = new Set(['int','long','double','bool','char']);

function mkPos(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return function (off) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, col: off - starts[lo] + 1 };
  };
}
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function nearest(name, cands) {
  let best = null, bd = 99; const low = name.toLowerCase();
  for (const c of cands) {
    if (c === name) continue;
    const d = c.toLowerCase() === low ? 0 : lev(name, c);
    if (d < bd) { bd = d; best = c; }
  }
  const lim = name.length <= 3 ? 1 : 2;
  return bd <= lim ? best : null;
}

/* ---------------- tokenizer ---------------- */
function tokenize(src, P) {
  const toks = []; let i = 0; const n = src.length;
  const OPS = /<<=|>>=|<<|>>|<=|>=|==|!=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|->|::|[-+*\/%=<>!&|^~?:;,.(){}\[\]]/y;
  const NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFlLuU]*/y;
  const ID = /[A-Za-z_]\w*/y;
  const mk = (t, v, s, e) => { const p = P(s); toks.push({ t, v, off: s, end: e, line: p.line, col: p.col }); };
  let lineStart = true;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { i++; lineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '#' && lineStart) { let e = i; while (e < n && src[e] !== '\n') e++; mk('pp', src.slice(i, e).trim(), i, e); i = e; continue; }
    lineStart = false;
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"' && src[j] !== '\n') {
        if (src[j] === '\\') { const x = src[j + 1]; s += x === 'n' ? '\n' : x === 't' ? '\t' : x === '0' ? '\0' : x === 'r' ? '\r' : x; j += 2; } else s += src[j++];
      }
      if (src[j] !== '"') { const p = P(i); return { err: { sev: 'error', code: 'quote', msg: 'missing terminating " character', off: i, len: j - i, line: p.line, col: p.col, eolOff: j } }; }
      mk('str', s, i, j + 1); i = j + 1; continue;
    }
    if (c === "'") {
      let j = i + 1, v;
      if (src[j] === '\\') { const x = src[j + 1]; v = x === 'n' ? 10 : x === 't' ? 9 : x === '0' ? 0 : x.charCodeAt(0); j += 2; } else { v = src.charCodeAt(j); j++; }
      if (src[j] !== "'") { const p = P(i); return { err: { sev: 'error', code: 'cquote', msg: 'missing terminating \' character', off: i, len: 1, line: p.line, col: p.col } }; }
      mk('chr', v, i, j + 1); i = j + 1; continue;
    }
    NUM.lastIndex = i; let m;
    if ((c >= '0' && c <= '9' || (c === '.' && /\d/.test(src[i + 1] || ''))) && (m = NUM.exec(src))) { mk('num', m[0], i, i + m[0].length); i += m[0].length; continue; }
    ID.lastIndex = i;
    if ((m = ID.exec(src))) { mk('id', m[0], i, i + m[0].length); i += m[0].length; continue; }
    OPS.lastIndex = i;
    if ((m = OPS.exec(src))) { mk('op', m[0], i, i + m[0].length); i += m[0].length; continue; }
    const p = P(i);
    return { err: { sev: 'error', code: 'stray', msg: "stray '" + c + "' in program", off: i, len: 1, line: p.line, col: p.col, data: { ch: c } } };
  }
  const p = P(n); toks.push({ t: 'eof', v: '', off: n, end: n, line: p.line, col: p.col });
  return { toks };
}

/* ---------------- parser ---------------- */
function parse(src, toks, P) {
  let i = 0, curFn = null;
  const peek = (k = 0) => toks[Math.min(i + k, toks.length - 1)];
  const prev = () => toks[Math.max(i - 1, 0)];
  const isOp = (v, k = 0) => { const t = peek(k); return t.t === 'op' && t.v === v; };
  const isId = (v, k = 0) => { const t = peek(k); return t.t === 'id' && t.v === v; };
  const eatOp = v => { if (isOp(v)) { i++; return true; } return false; };
  const before = t => t.t === 'op' ? "before '" + t.v + "' token" : t.t === 'num' ? 'before numeric constant' : t.t === 'str' ? 'before string constant' : t.t === 'chr' ? 'before character constant' : t.t === 'eof' ? 'at end of input' : "before '" + t.v + "'";
  const E = (code, msg, t, extra) => Object.assign({ sev: 'error', code, msg, off: t.off, len: Math.max(1, t.end - t.off), line: t.line, col: t.col, fn: curFn }, extra || {});
  const ins = (off, text) => ({ edits: [{ s: off, e: off, t: text }] });

  function expectOp(v) {
    const t = peek();
    if (t.t === 'op' && t.v === v) { i++; return t; }
    if (v === ';') {
      const p = prev(), pp = P(p.end);
      throw { sev: 'error', code: 'semi', msg: t.t === 'eof' ? "expected ';' at end of input" : "expected ';' " + before(t), off: p.end, len: 1, line: pp.line, col: pp.col, hint: ';', fn: curFn, fixes: [ins(p.end, ';')], data: { next: t.v } };
    }
    if (v === '}' && t.t === 'eof') {
      const p = prev(), pp = P(p.end);
      throw { sev: 'error', code: 'brace', msg: "expected '}' at end of input", off: p.end, len: 1, line: pp.line, col: pp.col, fn: curFn, fixes: [ins(src.length, (src.endsWith('\n') ? '' : '\n') + '}\n')] };
    }
    if (v === ')' || v === ']') throw E('paren', "expected '" + v + "' " + before(t), t, { hint: v, fixes: [ins(t.off, v)], data: { want: v } });
    throw E('expect', "expected '" + v + "' " + before(t), t, { data: { want: v } });
  }
  function fin(node, st) { node.off = st.off; node.line = st.line; node.col = st.col; node.end = prev().end; node.src = src.slice(node.off, node.end); return node; }

  function typeStart(k = 0) {
    let t = peek(k);
    if (t.t !== 'id') return false;
    if (t.v === 'std' && isOp('::', k + 1)) { t = peek(k + 2); if (t.t !== 'id') return false; }
    return TYPENAMES.has(t.v) || t.v === 'vector' || t.v === 'const';
  }
  function parseType() {
    const st = peek(); let isConst = false, stdq = false;
    if (isId('const')) { isConst = true; i++; }
    if (isId('std') && isOp('::', 1)) { stdq = true; i += 2; }
    const t = peek();
    if (t.t !== 'id') throw E('noprim', 'expected type-specifier ' + before(t), t);
    let type;
    if (t.v === 'vector') {
      i++; expectOp('<'); const inner = parseType();
      if (isOp('>>')) { const tk = peek(); toks.splice(i, 1, Object.assign({}, tk, { v: '>', end: tk.off + 1 }), Object.assign({}, tk, { v: '>', off: tk.off + 1 })); }
      expectOp('>');
      type = { name: 'vector', et: inner.name, disp: 'vector<' + inner.disp + '>', std: true };
    } else if (TYPENAMES.has(t.v)) {
      const MOD = new Set(['unsigned', 'signed', 'long', 'short']);
      const words = [peek().v]; i++;
      if (MOD.has(words[0])) while (peek().t === 'id' && (MOD.has(peek().v) || ['int', 'double', 'char'].includes(peek().v))) { words.push(peek().v); i++; }
      let name = 'int';
      if (words.includes('string')) name = 'string'; else if (words.includes('double') || words.includes('float')) name = 'double';
      else if (words.includes('char')) name = 'char'; else if (words.includes('bool')) name = 'bool'; else if (words.includes('void')) name = 'void';
      else if (words.includes('auto')) name = 'auto'; else if (words.filter(w => w === 'long').length >= 1) name = 'long';
      type = { name, disp: words.join(' '), std: name === 'string' };
    } else throw E('noprim', 'expected type-specifier ' + before(t), t);
    type.isConst = isConst; type.stdq = stdq; type.off = st.off; type.end = prev().end; type.line = st.line; type.col = st.col;
    if (isOp('&')) { i++; type.ref = true; }
    if (isOp('*')) throw E('unsupported', 'pointers are not supported in CodePop yet', peek());
    return type;
  }

  function parseInitList() {
    const st = expectOp('{'); const items = [];
    if (!isOp('}')) do { items.push(isOp('{') ? parseInitList() : parseAssign()); } while (eatOp(','));
    expectOp('}');
    return fin({ k: 'init', items }, st);
  }
  function parseDeclRest(type, st, noSemi) {
    const items = [];
    do {
      const nt = peek();
      if (nt.t !== 'id' || RESERVED.has(nt.v)) throw E('expectid', 'expected unqualified-id ' + before(nt), nt);
      i++;
      const it = { name: nt.v, tok: nt, dims: [], init: null, ctor: null };
      while (isOp('[')) { i++; it.dims.push(isOp(']') ? null : parseExpr()); expectOp(']'); }
      if (it.dims.length > 1) throw E('unsupported', '2D arrays are not supported in CodePop yet', nt);
      if (eatOp('=')) it.init = isOp('{') ? parseInitList() : parseAssign();
      else if (isOp('(') && type.name !== 'auto') { i++; it.ctor = []; if (!isOp(')')) do { it.ctor.push(parseAssign()); } while (eatOp(',')); expectOp(')'); }
      else if (isOp('{')) it.init = parseInitList();
      items.push(it);
    } while (eatOp(','));
    if (!noSemi) expectOp(';');
    return fin({ k: 'decl', type, items }, st);
  }

  function parseExpr() { return parseAssign(); }
  function parseAssign() {
    const st = peek(); const l = parseTernary(); const t = peek();
    if (t.t === 'op' && ASSIGN.has(t.v)) { i++; const r = parseAssign(); return fin({ k: 'asg', op: t.v, l, r, opOff: t.off, opEnd: t.end }, st); }
    return l;
  }
  function parseTernary() {
    const st = peek(); const c = parseBin(1);
    if (isOp('?')) { i++; const a = parseAssign(); expectOp(':'); const b = parseAssign(); return fin({ k: 'cond', c, a, b }, st); }
    return c;
  }
  function parseBin(min) {
    const st = peek(); let l = parseUnary();
    for (;;) {
      const t = peek(); const p = t.t === 'op' ? BINPREC[t.v] : undefined;
      if (p === undefined || p < min) break;
      i++; const r = parseBin(p + 1);
      l = fin({ k: (t.v === '&&' || t.v === '||') ? 'log' : 'bin', op: t.v, l, r, opOff: t.off, opEnd: t.end }, st);
    }
    return l;
  }
  function parseUnary() {
    const st = peek(), t = st;
    if (t.t === 'op') {
      if (t.v === '!' || t.v === '-' || t.v === '+') { i++; const e = parseUnary(); return fin({ k: 'un', op: t.v, e }, st); }
      if (t.v === '++' || t.v === '--') { i++; const e = parseUnary(); return fin({ k: 'inc', op: t.v, pre: true, e }, st); }
      if (t.v === '(' && peek(1).t === 'id' && (TYPENAMES.has(peek(1).v) ) && peek(1).v !== 'auto') {
        i++; const type = parseType(); expectOp(')'); const e = parseUnary(); return fin({ k: 'cast', type, e }, st);
      }
    }
    return parsePostfix();
  }
  function parsePostfix() {
    const st = peek(); let e = parsePrimary();
    for (;;) {
      if (isOp('[')) { i++; const ix = parseExpr(); expectOp(']'); e = fin({ k: 'idx', e, i: ix }, st); }
      else if (isOp('.')) {
        i++; const nt = peek(); if (nt.t !== 'id') throw E('expectid', 'expected unqualified-id ' + before(nt), nt);
        i++;
        if (isOp('(')) { i++; const args = []; if (!isOp(')')) do { args.push(parseAssign()); } while (eatOp(',')); expectOp(')'); e = fin({ k: 'mcall', obj: e, name: nt.v, args }, st); }
        else e = fin({ k: 'mem', obj: e, name: nt.v }, st);
      }
      else if (isOp('++') || isOp('--')) { const t = peek(); i++; e = fin({ k: 'inc', op: t.v, pre: false, e }, st); }
      else break;
    }
    return e;
  }
  function parsePrimary() {
    const t = peek(), st = t;
    if (t.t === 'num') { i++; const isF = /[.eE]/.test(t.v) || /[fF]$/.test(t.v); return fin({ k: 'num', v: parseFloat(t.v), isF }, st); }
    if (t.t === 'str') { i++; let v = t.v; while (peek().t === 'str') { v += peek().v; i++; } return fin({ k: 'str', v }, st); }
    if (t.t === 'chr') { i++; return fin({ k: 'chr', v: t.v }, st); }
    if (t.t === 'op' && t.v === '(') { i++; const e = parseExpr(); expectOp(')'); return fin({ k: 'paren', e }, st); }
    if (t.t === 'id') {
      if (RESERVED.has(t.v)) throw E('noprim', 'expected primary-expression ' + before(t), t);
      let stdq = false;
      if (t.v === 'std' && isOp('::', 1)) { i += 2; stdq = true; }
      const nt = peek(); if (nt.t !== 'id') throw E('noprim', 'expected unqualified-id ' + before(nt), nt);
      i++;
      if (nt.v === 'true' || nt.v === 'false') return fin({ k: 'bool', v: nt.v === 'true' }, st);
      if (nt.v === 'NULL' || nt.v === 'nullptr') return fin({ k: 'num', v: 0, isF: false }, st);
      if (nt.v === 'static_cast' && isOp('<')) { i++; const type = parseType(); expectOp('>'); expectOp('('); const e = parseExpr(); expectOp(')'); return fin({ k: 'cast', type, e }, st); }
      if (isOp('(')) { i++; const args = []; if (!isOp(')')) do { args.push(parseAssign()); } while (eatOp(',')); expectOp(')'); return fin({ k: 'call', name: nt.v, args, stdq, nameOff: nt.off, nameEnd: nt.end }, st); }
      return fin({ k: 'id', name: nt.v, stdq, nameOff: nt.off, nameEnd: nt.end }, st);
    }
    throw E('noprim', 'expected primary-expression ' + before(t), t);
  }

  function parsePrint(st) {
    const tok = peek(); const stream = tok.v; i++;
    if (isOp('>>')) { const o = peek(); throw E('wrongop', "no match for 'operator>>' (operand types are 'std::ostream' {aka 'std::basic_ostream<char>'} and 'int')", o, { data: { stream }, fixes: [{ edits: [{ s: o.off, e: o.end, t: '<<' }] }] }); }
    const parts = [];
    while (isOp('<<')) {
      i++;
      if (isId('endl') || (isId('std') && isId('endl', 2))) { const e0 = peek(); if (isId('std')) i += 3; else i++; parts.push({ k: 'endl', off: e0.off, end: prev().end, line: e0.line, col: e0.col, stdq: e0.v === 'std' }); }
      else if (isId('fixed') || (isId('std') && isId('fixed', 2))) { const e0 = peek(); i += isId('std') ? 3 : 1; parts.push({ k: 'manip', name: 'fixed', off: e0.off, end: prev().end, line: e0.line, col: e0.col }); }
      else if (isId('setprecision') || isId('setw') || (isId('std') && (isId('setprecision', 2) || isId('setw', 2)))) {
        const e0 = peek(); if (isId('std')) i += 2; const nm = peek().v; i++; expectOp('('); const a = parseExpr(); expectOp(')');
        parts.push({ k: 'manip', name: nm, arg: a, off: e0.off, end: prev().end, line: e0.line, col: e0.col });
      }
      else parts.push(parseBin(6));
    }
    expectOp(';');
    return fin({ k: 'print', stream, parts }, st);
  }
  function parseInput(st) {
    i++;
    if (isOp('<<')) { const o = peek(); throw E('wrongop', "no match for 'operator<<' (operand types are 'std::istream' {aka 'std::basic_istream<char>'} and 'int')", o, { data: { stream: 'cin' }, fixes: [{ edits: [{ s: o.off, e: o.end, t: '>>' }] }] }); }
    const targets = [];
    while (isOp('>>')) { i++; targets.push(parseUnary()); }
    expectOp(';');
    return fin({ k: 'input', targets }, st);
  }

  function parseBlock() {
    const st = expectOp('{'); const body = [];
    while (!isOp('}')) { if (peek().t === 'eof') expectOp('}'); body.push(parseStmt()); }
    i++;
    return fin({ k: 'block', body }, st);
  }
  function parseStmt() {
    const st = peek(), t = st;
    if (t.t === 'op') {
      if (t.v === '{') return parseBlock();
      if (t.v === ';') { i++; return fin({ k: 'empty' }, st); }
    }
    if (t.t === 'id') {
      const v = t.v;
      if (UNSUPPORTED.has(v)) throw E('unsupported', "'" + v + "' is not supported in CodePop yet", t, { data: { word: v } });
      if (v === 'if') {
        i++; expectOp('('); const cs = peek(); const cond = parseExpr(); const condSrc = src.slice(cs.off, prev().end); expectOp(')');
        const then = parseStmt(); let els = null;
        if (isId('else')) { i++; els = parseStmt(); }
        return fin({ k: 'if', cond, condSrc, then, els }, st);
      }
      if (v === 'while') { i++; expectOp('('); const cs = peek(); const cond = parseExpr(); const condSrc = src.slice(cs.off, prev().end); expectOp(')'); const body = parseStmt(); return fin({ k: 'while', cond, condSrc, body }, st); }
      if (v === 'do') { i++; const body = parseStmt(); if (!isId('while')) throw E('expect', "expected 'while' " + before(peek()), peek()); i++; expectOp('('); const cs = peek(); const cond = parseExpr(); const condSrc = src.slice(cs.off, prev().end); expectOp(')'); expectOp(';'); return fin({ k: 'do', cond, condSrc, body }, st); }
      if (v === 'for') {
        i++; expectOp('(');
        let init = null, isRange = false;
        if (!isOp(';')) {
          if (typeStart()) {
            const ist = peek(); const type = parseType();
            if (peek().t === 'id' && isOp(':', 1)) {
              const nm = peek(); i += 2; const coll = parseExpr(); expectOp(')'); const body = parseStmt();
              return fin({ k: 'rangefor', type, name: nm.v, tok: nm, coll, body }, st);
            }
            init = parseDeclRest(type, ist, true);
          } else { const es = peek(); init = fin({ k: 'expr', e: parseExpr() }, es); }
        }
        expectOp(';');
        let cond = null, condSrc = '', cs = peek(); if (!isOp(';')) cond = parseExpr(); condSrc = cond ? src.slice(cs.off, prev().end) : ''; expectOp(';');
        let inc = null, incSrc = '', is = peek(); if (!isOp(')')) inc = parseExpr(); incSrc = inc ? src.slice(is.off, prev().end) : ''; expectOp(')');
        const body = parseStmt();
        return fin({ k: 'for', init, cond, inc, condSrc, incSrc, initSrc: init ? init.src : '', body }, st);
      }
      if (v === 'return') { i++; let e = null; if (!isOp(';')) e = parseExpr(); expectOp(';'); return fin({ k: 'return', e }, st); }
      if (v === 'break') { i++; expectOp(';'); return fin({ k: 'break' }, st); }
      if (v === 'continue') { i++; expectOp(';'); return fin({ k: 'continue' }, st); }
      if ((v === 'cout' || v === 'cerr') && (isOp('<<', 1) || isOp('>>', 1))) return parsePrint(st);
      if (v === 'std' && isOp('::', 1) && (isId('cout', 2) || isId('cerr', 2)) && (isOp('<<', 3) || isOp('>>', 3))) { i += 2; const p = parsePrint(st); p.stdq = true; return p; }
      if (v === 'cin' && (isOp('>>', 1) || isOp('<<', 1))) return parseInput(st);
      if (v === 'std' && isOp('::', 1) && isId('cin', 2) && (isOp('>>', 3) || isOp('<<', 3))) { i += 2; const p = parseInput(st); p.stdq = true; return p; }
      if (typeStart()) { const type = parseType(); return parseDeclRest(type, st, false); }
      // unknown type, e.g. "Int x = 5;"
      if (!RESERVED.has(v) && peek(1).t === 'id' && !RESERVED.has(peek(1).v) && (isOp('=', 2) || isOp(';', 2) || isOp(',', 2))) {
        i++; const type = { name: 'int', disp: v, unknown: t, off: t.off, end: t.end, line: t.line, col: t.col };
        return parseDeclRest(type, st, false);
      }
    }
    const e = parseExpr(); expectOp(';');
    return fin({ k: 'expr', e }, st);
  }

  function fnDisp(ret, name, params) { return ret.disp + ' ' + name + '(' + params.map(p => p.type.disp + (p.type.ref ? '&' : '')).join(', ') + ')'; }
  function parseProgram() {
    const ast = { includes: [], usingStd: false, usingNames: new Set(), funcs: [], globals: [], headerEnd: 0 };
    while (peek().t !== 'eof') {
      const t = peek();
      if (t.t === 'pp') {
        const m = /^#\s*include\s*[<"]([^>"]+)[>"]/.exec(t.v);
        if (m) { ast.includes.push(m[1]); ast.headerEnd = Math.max(ast.headerEnd, t.end + 1); }
        else if (!/^#\s*(define|pragma|ifndef|ifdef|endif|if|else)/.test(t.v)) throw E('pp', 'invalid preprocessing directive ' + t.v.split(/\s/)[0], t);
        i++; continue;
      }
      if (isId('using')) {
        i++;
        if (isId('namespace') && isId('std', 1)) { i += 2; ast.usingStd = true; }
        else if (isId('std') && isOp('::', 1)) { ast.usingNames.add(peek(2).v); i += 3; }
        else throw E('expect', "expected 'namespace' " + before(peek()), peek());
        expectOp(';'); ast.headerEnd = Math.max(ast.headerEnd, prev().end + 1); continue;
      }
      if (!typeStart()) {
        if (t.t === 'id' && !RESERVED.has(t.v)) throw E('nottype', "'" + t.v + "' does not name a type", t, { data: { name: t.v } });
        throw E('decl', 'expected declaration ' + before(t), t, { data: { tok: t.v } });
      }
      const st = peek(); const type = parseType();
      const nt = peek();
      if (nt.t !== 'id') throw E('expectid', 'expected unqualified-id ' + before(nt), nt);
      if (isOp('(', 1)) {
        i += 2; const params = [];
        if (isId('void') && isOp(')', 1)) i++;
        else if (!isOp(')')) do {
          const pt = parseType(); const pn = peek();
          if (pn.t !== 'id') throw E('expectid', 'expected unqualified-id ' + before(pn), pn);
          i++; let arr = false; if (isOp('[')) { i++; if (!isOp(']')) parseExpr(); expectOp(']'); arr = true; }
          if (eatOp('=')) parseAssign();
          params.push({ name: pn.v, type: pt, arr, tok: pn });
        } while (eatOp(','));
        expectOp(')');
        const fn = { name: nt.v, ret: type, params, tok: nt, disp: fnDisp(type, nt.v, params), line: st.line, off: st.off };
        if (isOp(';')) { i++; fn.proto = true; ast.funcs.push(fn); continue; }
        curFn = fn.disp; fn.body = parseBlock(); fn.endTok = prev(); curFn = null;
        ast.funcs.push(fn);
      } else {
        ast.globals.push(parseDeclRest(type, st, false));
      }
    }
    return ast;
  }
  try { return { ast: parseProgram() }; } catch (e) { if (e && e.sev) return { err: e }; throw e; }
}

/* ---------------- checker ---------------- */
function check(ast, src, P) {
  const probs = []; const seen = new Set();
  const has = hs => ast.includes.includes('bits/stdc++.h') || hs.some(h => ast.includes.includes(h));
  const usingOK = nm => ast.usingStd || ast.usingNames.has(nm);
  const funcs = new Map();
  for (const f of ast.funcs) if (!funcs.has(f.name) || f.body) funcs.set(f.name, f);
  let curFn = null;
  const add = (sev, code, msg, n, extra) => {
    const key = code + '|' + (extra && extra.dedupe || msg);
    if (seen.has(key)) { const o = probs.find(p => p.key === key); if (o) o.count = (o.count || 1) + 1; return null; }
    seen.add(key);
    const o = Object.assign({ sev, code, msg, off: n.off, len: Math.max(1, (n.end || n.off + 1) - n.off), line: n.line, col: n.col, fn: curFn, key }, extra || {});
    probs.push(o); return o;
  };
  const headerFix = (text) => ({ edits: [{ s: ast.headerEnd, e: ast.headerEnd, t: text }] });
  const nameRange = n => ({ off: n.nameOff, end: n.nameEnd, line: n.line, col: n.col });

  function useStd(nm, n, stdq, range) {
    const d = STD[nm]; const r = range || n;
    if (!has(d.h)) {
      const hdr = d.h[0] === 'iostream' && (nm === 'string' || nm === 'getline' || nm === 'to_string' || nm === 'stoi' || nm === 'stod') ? 'string' : d.h[0];
      add('error', 'noinclude', stdq ? "'" + nm + "' is not a member of 'std'" : "'" + nm + "' was not declared in this scope", r,
        { notes: ["'std::" + nm + "' is defined in header '<" + hdr + ">'; did you forget to '#include <" + hdr + ">'?"], fixes: [headerFix('#include <' + hdr + '>\n')], data: { name: nm, header: hdr }, dedupe: nm });
      return false;
    }
    if (!stdq && !usingOK(nm)) {
      add('error', 'nonamespace', "'" + nm + "' was not declared in this scope", r,
        { notes: ["suggested alternative: 'std::" + nm + "'"], fixes: [headerFix('using namespace std;\n')], data: { name: nm }, dedupe: nm });
      return false;
    }
    return true;
  }
  const scopes = [];
  const find = nm => { for (let k = scopes.length - 1; k >= 0; k--) if (scopes[k].has(nm)) return scopes[k].get(nm); return null; };
  const push = () => scopes.push(new Map()); const pop = () => scopes.pop();
  function allNames() { const s = new Set(['main']); for (const m of scopes) for (const k of m.keys()) s.add(k); for (const k of funcs.keys()) s.add(k); return [...s]; }

  function typeOf(e) {
    switch (e.k) {
      case 'num': return e.isF ? 'double' : 'int';
      case 'str': return 'cstr';
      case 'chr': return 'char';
      case 'bool': return 'bool';
      case 'paren': return typeOf(e.e);
      case 'id': { const v = find(e.name); return v ? (v.kind === 'var' ? v.ty : v.et) : 'unknown'; }
      case 'idx': { const v = e.e.k === 'id' ? find(e.e.name) : null; return v ? (v.kind === 'var' ? (v.ty === 'string' ? 'char' : 'unknown') : v.et) : 'unknown'; }
      case 'cast': return e.type.name;
      case 'un': return e.op === '!' ? 'bool' : typeOf(e.e);
      case 'inc': return typeOf(e.e);
      case 'asg': return typeOf(e.l);
      case 'cond': return typeOf(e.a);
      case 'log': return 'bool';
      case 'bin': {
        if (['==', '!=', '<', '>', '<=', '>='].includes(e.op)) return 'bool';
        const a = typeOf(e.l), b = typeOf(e.r);
        if (e.op === '+' && (a === 'string' || b === 'string')) return 'string';
        if (e.op === '+' && a === 'cstr' && b === 'cstr') return 'unknown';
        if (a === 'double' || b === 'double') return 'double';
        if (a === 'long' || b === 'long') return 'long';
        if (a === 'unknown' || b === 'unknown') return 'unknown';
        return 'int';
      }
      case 'call': { const f = funcs.get(e.name); if (f) return f.ret.name; if (['sqrt', 'pow', 'floor', 'ceil', 'round', 'fabs', 'sin', 'cos', 'tan', 'log', 'log10', 'exp'].includes(e.name)) return 'double'; if (e.name === 'to_string') return 'string'; if (['rand', 'stoi', 'time'].includes(e.name)) return 'int'; return 'unknown'; }
      case 'mcall': return ['length', 'size'].includes(e.name) ? 'int' : e.name === 'empty' ? 'bool' : e.name === 'substr' ? 'string' : 'unknown';
      default: return 'unknown';
    }
  }
  const isNumTy = t => NUMERIC.has(t);
  function convCheck(targetTy, targetDisp, init, isDecl, typeNode) {
    const it = typeOf(init);
    const ex = { data: { from: it, to: targetDisp } };
    if (isNumTy(targetTy) && (it === 'cstr' || it === 'string')) {
      const strTy = (ast.usingStd || ast.usingNames.has('string')) ? 'string' : 'std::string';
      const fixes = (isDecl && typeNode && init.k === 'str') ? [{ edits: [{ s: typeNode.off, e: typeNode.end, t: strTy }] }] : null;
      add('error', 'cvt', it === 'cstr' ? "invalid conversion from 'const char*' to '" + targetDisp + "' [-fpermissive]" : "cannot convert 'std::string' {aka 'std::__cxx11::basic_string<char>'} to '" + targetDisp + "' in initialization", init, Object.assign(ex, fixes ? { fixes } : {}));
    } else if (isDecl && targetTy === 'string' && (it === 'int' || it === 'double' || it === 'long' || it === 'bool')) {
      const fixes = init.k === 'num' ? [{ edits: [{ s: init.off, e: init.off, t: '"' }, { s: init.end, e: init.end, t: '"' }] }] : null;
      add('error', 'cvt2', "conversion from '" + it + "' to non-scalar type 'std::string' {aka 'std::__cxx11::basic_string<char>'} requested", init, Object.assign(ex, fixes ? { fixes } : {}));
    }
  }
  function walkExpr(e) {
    if (!e) return;
    switch (e.k) {
      case 'id': {
        if (find(e.name)) return;
        if (STD[e.name] && e.name !== 'string' && e.name !== 'vector') { useStd(e.name, e, e.stdq, nameRange(e)); return; }
        if (funcs.has(e.name)) return;
        if (e.name === 'npos') return;
        const sug = nearest(e.name, allNames().concat(['cout', 'cin']));
        add('error', 'undeclared', "'" + e.name + "' was not declared in this scope" + (sug ? "; did you mean '" + sug + "'?" : ''), nameRange(e),
          { data: { name: e.name, sug }, fixes: sug ? [{ edits: [{ s: e.nameOff, e: e.nameEnd, t: sug }] }] : null, dedupe: e.name });
        return;
      }
      case 'paren': return walkExpr(e.e);
      case 'bin': case 'log': {
        walkExpr(e.l); walkExpr(e.r);
        if (e.op === '+') {
          const a = typeOf(e.l), b = typeOf(e.r);
          if (a === 'cstr' && b === 'cstr') add('error', 'cstrplus', "invalid operands of types 'const char [" + ((e.l.k === 'str' ? e.l.v.length : 0) + 1) + "]' and 'const char [" + ((e.r.k === 'str' ? e.r.v.length : 0) + 1) + "]' to binary 'operator+'", e, { data: {} });
          else if ((a === 'string' || a === 'cstr') && ['int', 'double', 'long'].includes(b) || (b === 'string' || b === 'cstr') && ['int', 'double', 'long'].includes(a)) {
            const sa = (a === 'string' || a === 'cstr') ? (a === 'cstr' ? "const char*" : 'std::string') : a;
            const sb = (b === 'string' || b === 'cstr') ? (b === 'cstr' ? "const char*" : 'std::string') : b;
            const numSide = ['int', 'double', 'long'].includes(b) ? e.r : e.l;
            add('error', 'strplusnum', "no match for 'operator+' (operand types are '" + sa + "' and '" + sb + "')", e,
              { data: {}, fixes: [{ edits: [{ s: numSide.off, e: numSide.off, t: 'to_string(' }, { s: numSide.end, e: numSide.end, t: ')' }] }], dedupe: String(e.off) });
            useStd('to_string', e, false, e);
          }
        }
        return;
      }
      case 'un': case 'inc': case 'cast': return walkExpr(e.e);
      case 'asg': {
        walkExpr(e.l); walkExpr(e.r);
        if (e.l.k === 'id') {
          const v = find(e.l.name);
          if (v && v.isConst) add('error', 'readonly', "assignment of read-only variable '" + e.l.name + "'", e.l, { data: { name: e.l.name } });
          if (v && v.kind === 'var' && e.op === '=') convCheck(v.ty, v.disp, e.r, false);
        }
        return;
      }
      case 'cond': walkExpr(e.c); walkExpr(e.a); walkExpr(e.b); return;
      case 'idx': walkExpr(e.e); walkExpr(e.i); return;
      case 'mcall': walkExpr(e.obj); e.args.forEach(walkExpr); return;
      case 'mem': walkExpr(e.obj); return;
      case 'init': e.items.forEach(walkExpr); return;
      case 'call': {
        const f = funcs.get(e.name);
        if (f) {
          e.args.forEach(walkExpr);
          if (e.args.length !== f.params.length) {
            const few = e.args.length < f.params.length;
            add('error', few ? 'fewargs' : 'manyargs', (few ? 'too few' : 'too many') + " arguments to function '" + f.disp + "'", nameRange(e), { notes: ["declared here: " + f.disp], data: { fn: f.disp, want: f.params.length, got: e.args.length }, dedupe: e.name + e.off });
          }
          return;
        }
        if (GFN[e.name]) { if (!has(GFN[e.name])) add('error', 'noinclude', "'" + e.name + "' was not declared in this scope", nameRange(e), { notes: ["'" + e.name + "' is defined in header '<" + GFN[e.name][0] + ">'; did you forget to '#include <" + GFN[e.name][0] + ">'?"], fixes: [headerFix('#include <' + GFN[e.name][0] + '>\n')], data: { name: e.name, header: GFN[e.name][0] }, dedupe: e.name }); e.args.forEach(walkExpr); return; }
        if (STD[e.name]) { useStd(e.name, e, e.stdq, nameRange(e)); e.args.forEach(walkExpr); return; }
        const sug = nearest(e.name, allNames().concat(Object.keys(GFN), ['getline', 'to_string']));
        add('error', 'undeclared', "'" + e.name + "' was not declared in this scope" + (sug ? "; did you mean '" + sug + "'?" : ''), nameRange(e),
          { data: { name: e.name, sug, isFn: true }, fixes: sug ? [{ edits: [{ s: e.nameOff, e: e.nameEnd, t: sug }] }] : null, dedupe: e.name });
        e.args.forEach(walkExpr);
      }
    }
  }
  function declare(it, type, node) {
    const cur = scopes[scopes.length - 1];
    if (cur.has(it.name)) {
      const first = node.items[0] === it;
      add('error', 'redecl', "redeclaration of '" + type.disp + ' ' + it.name + "'", { off: it.tok.off, end: it.tok.end, line: it.tok.line, col: it.tok.col },
        { notes: ["'" + it.name + "' previously declared here"], fixes: first ? [{ edits: [{ s: type.off, e: it.tok.off, t: '' }] }] : null, data: { name: it.name }, dedupe: it.name + it.tok.off });
    }
    const arr = it.dims.length > 0, vec = type.name === 'vector';
    cur.set(it.name, { kind: arr ? 'arr' : vec ? 'vec' : 'var', ty: type.name, disp: type.disp, et: vec ? type.et : type.name, isConst: type.isConst });
  }
  function walkDecl(n) {
    const t = n.type;
    if (t.unknown) {
      const sug = nearest(t.disp, [...TYPENAMES].filter(x => x !== 'signed' && x !== 'unsigned'));
      add('error', 'undeclared', "'" + t.disp + "' was not declared in this scope" + (sug ? "; did you mean '" + sug + "'?" : ''), t,
        { data: { name: t.disp, sug, isType: true }, fixes: sug ? [{ edits: [{ s: t.off, e: t.end, t: sug }] }] : null, dedupe: t.disp });
      t.name = sug && TYPENAMES.has(sug) ? sug : 'int';
    } else if (t.name === 'string' && !t.unknown) useStd('string', t, t.stdq, t);
    else if (t.name === 'vector') useStd('vector', t, t.stdq, t);
    for (const it of n.items) {
      if (it.dims.length) it.dims.forEach(walkExpr);
      if (it.init) { walkExpr(it.init); if (!it.dims.length && t.name !== 'vector' && t.name !== 'auto' && it.init.k !== 'init') convCheck(t.name, t.disp, it.init, true, t); }
      if (it.ctor) it.ctor.forEach(walkExpr);
      if (t.name === 'auto' && it.init) { const ty = typeOf(it.init); declare(it, { name: ty === 'cstr' ? 'string' : ty, disp: 'auto', isConst: t.isConst }, n); }
      else declare(it, t, n);
    }
  }
  function warnAssignCond(c) {
    if (c && c.k === 'asg' && c.op === '=') add('warning', 'assigncond', 'suggest parentheses around assignment used as truth value [-Wparentheses]', { off: c.opOff, end: c.opEnd, line: c.line, col: c.col + (c.opOff - c.off) },
      { fixes: [{ edits: [{ s: c.opOff, e: c.opEnd, t: '==' }] }], data: {}, dedupe: String(c.off) });
  }
  function walkStmt(n) {
    switch (n.k) {
      case 'block': push(); n.body.forEach(walkStmt); pop(); break;
      case 'decl': walkDecl(n); break;
      case 'expr': walkExpr(n.e); break;
      case 'print':
        if (!n.stdq) useStd(n.stream, n, false, { off: n.off, end: n.off + n.stream.length, line: n.line, col: n.col });
        else useStd(n.stream, n, true, { off: n.off + 5, end: n.off + 5 + n.stream.length, line: n.line, col: n.col + 5 });
        for (const p of n.parts) {
          if (p.k === 'endl') { if (!has(STD.endl.h)) useStd('endl', p, p.stdq, p); else if (!p.stdq && !usingOK('endl')) useStd('endl', p, false, p); }
          else if (p.k === 'manip') { const nm = p.name; if (p.arg) walkExpr(p.arg); if (!has(STD[nm].h)) useStd(nm, p, false, p); else if (!usingOK(nm)) useStd(nm, p, false, p); }
          else walkExpr(p);
        }
        break;
      case 'input':
        useStd('cin', n, n.stdq, { off: n.off + (n.stdq ? 5 : 0), end: n.off + (n.stdq ? 8 : 3), line: n.line, col: n.col + (n.stdq ? 5 : 0) });
        n.targets.forEach(walkExpr); break;
      case 'if': walkExpr(n.cond); warnAssignCond(n.cond); push(); walkStmt(n.then); pop(); if (n.els) { push(); walkStmt(n.els); pop(); } break;
      case 'while': walkExpr(n.cond); warnAssignCond(n.cond); push(); walkStmt(n.body); pop(); break;
      case 'do': push(); walkStmt(n.body); pop(); walkExpr(n.cond); break;
      case 'for': push(); if (n.init) walkStmt(n.init); walkExpr(n.cond); warnAssignCond(n.cond); walkExpr(n.inc); push(); walkStmt(n.body); pop(); pop(); break;
      case 'rangefor': { walkExpr(n.coll); push(); const ct = n.coll.k === 'id' ? find(n.coll.name) : null; scopes[scopes.length - 1].set(n.name, { kind: 'var', ty: n.type.name === 'auto' ? (ct ? ct.et : 'int') : n.type.name, disp: n.type.disp }); walkStmt(n.body); pop(); break; }
      case 'return': walkExpr(n.e); break;
    }
  }
  function hasReturn(n) {
    if (!n) return false;
    if (n.k === 'return') return true;
    if (n.k === 'block') return n.body.some(hasReturn);
    if (n.k === 'if') return hasReturn(n.then) || hasReturn(n.els);
    if (['while', 'do', 'for', 'rangefor'].includes(n.k)) return hasReturn(n.body);
    return false;
  }
  // globals
  push();
  for (const g of ast.globals) walkDecl(g);
  for (const f of ast.funcs) {
    if (!f.body) continue;
    curFn = f.disp; push();
    if (f.ret.name === 'string') useStd('string', f.ret, f.ret.stdq, f.ret);
    for (const p of f.params) {
      if (p.type.name === 'string') useStd('string', p.type, p.type.stdq, p.type);
      scopes[scopes.length - 1].set(p.name, { kind: p.arr || p.type.name === 'vector' ? 'arr' : 'var', ty: p.type.name, disp: p.type.disp, et: p.type.et || p.type.name });
    }
    f.body.body.forEach(walkStmt);
    pop();
    if (f.name === 'main' && f.ret.name !== 'int') add('error', 'mainret', "'::main' must return 'int'", f.ret, { fixes: [{ edits: [{ s: f.ret.off, e: f.ret.end, t: 'int' }] }], data: {} });
    if (f.ret.name !== 'void' && f.name !== 'main' && !hasReturn(f.body)) add('warning', 'noreturn', 'no return statement in function returning non-void [-Wreturn-type]', { off: f.endTok.off, end: f.endTok.end, line: f.endTok.line, col: f.endTok.col }, { data: { fn: f.name } });
  }
  curFn = null;
  pop();
  if (!funcs.has('main') || !funcs.get('main').body) {
    const last = ast.funcs.length ? src.length : src.length;
    probs.push({ sev: 'error', code: 'nomain', msg: "undefined reference to `main'", off: 0, len: 1, line: 0, col: 0, link: true, fixes: [{ edits: [{ s: last, e: last, t: (src.endsWith('\n') || !src.length ? '' : '\n') + '\nint main() {\n    return 0;\n}\n' }] }], data: {} });
  }
  probs.sort((a, b) => a.off - b.off);
  return probs;
}

CP.usesCin = ast => {
  let f = false;
  (function w(n) {
    if (!n || typeof n !== 'object' || f) return;
    if (Array.isArray(n)) { n.forEach(w); return; }
    if (n.k === 'input' || (n.k === 'call' && n.name === 'getline')) { f = true; return; }
    for (const k in n) if (k !== 'type' && k !== 'tok' && typeof n[k] === 'object') w(n[k]);
  })(ast.funcs.map(x => x.body).concat(ast.globals));
  return f;
};

CP.compile = function (src) {
  const P = mkPos(src);
  const tk = tokenize(src, P);
  if (tk.err) return { ok: false, problems: [fixQuote(src, P, tk.err)], ast: null };
  const ps = parse(src, tk.toks, P);
  if (ps.err) return { ok: false, problems: [ps.err], ast: null };
  const problems = check(ps.ast, src, P);
  return { ok: !problems.some(p => p.sev === 'error'), problems, ast: ps.ast, usesCin: CP.usesCin(ps.ast) };
};
function fixQuote(src, P, e) {
  if (e.code === 'quote') {
    let end = e.eolOff; // end of the broken line
    let line = src.slice(e.off, end).replace(/\s+$/, '');
    let pos = e.off + line.length;
    if (line.endsWith(';')) pos--;
    e.fixes = [{ edits: [{ s: pos, e: pos, t: '"' }] }];
    e.notes = [];
  }
  return e;
}

CP.format = function (src, p) {
  const out = []; const lines = src.split('\n');
  if (p.link) { out.push({ cls: 'err', text: "/usr/bin/ld: in function '_start': undefined reference to `main'" }); out.push({ cls: 'err', text: 'collect2: error: ld returned 1 exit status' }); return out; }
  out.push({ cls: p.sev === 'error' ? 'err' : 'warn', text: 'main.cpp:' + p.line + ':' + p.col + ': ' + p.sev + ': ' + p.msg });
  const L = lines[p.line - 1];
  if (L !== undefined) {
    out.push({ cls: 'src', text: String(p.line).padStart(5, ' ') + ' | ' + L });
    const pad = ' '.repeat(Math.max(0, p.col - 1));
    const tl = p.hint ? 1 : Math.max(1, Math.min(p.len || 1, Math.max(1, L.length - p.col + 1)));
    out.push({ cls: 'caret', text: '      | ' + pad + '^' + '~'.repeat(tl - 1) });
    if (p.hint) out.push({ cls: 'caret', text: '      | ' + pad + p.hint });
  }
  (p.notes || []).forEach(n => out.push({ cls: 'note', text: 'main.cpp:' + p.line + ':' + p.col + ': note: ' + n }));
  return out;
};

/* ---------------- interpreter ---------------- */
class RunErr extends Error { constructor(code, msg, line, data) { super(msg || code); this.code = code; this.line = line; this.data = data; } }
class Exit { constructor(c) { this.code = c; } }
class Abort { }
const yieldTick = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const mc = new MessageChannel(); const q = [];
    if (mc.port1.unref) mc.port1.unref();
    mc.port1.onmessage = () => { const r = q.shift(); if (!q.length && mc.port1.unref) mc.port1.unref(); if (r) r(); };
    return () => new Promise(r => { q.push(r); if (mc.port1.ref) mc.port1.ref(); mc.port2.postMessage(0); });
  }
  return () => new Promise(r => setTimeout(r, 0));
})();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmtG(x, p) {
  p = p || 6;
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  if (!isFinite(x)) return isNaN(x) ? 'nan' : (x < 0 ? '-inf' : 'inf');
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -5 || e >= p) {
    let s = x.toExponential(p - 1), [m, ex] = s.split('e');
    if (m.indexOf('.') >= 0) m = m.replace(/0+$/, '').replace(/\.$/, '');
    const sign = ex[0] === '-' ? '-' : '+'; ex = ex.replace(/^[+-]/, ''); if (ex.length < 2) ex = '0' + ex;
    return m + 'e' + sign + ex;
  }
  let s = x.toPrecision(p);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
CP.fmtG = fmtG;
const defVal = ty => ty === 'string' ? '' : ty === 'bool' ? false : 0;
function coerce(val, ty) {
  let v = val.v;
  switch (ty) {
    case 'int': if (typeof v === 'boolean') v = +v; if (typeof v === 'string') return { t: 'int', v: 0 }; return { t: 'int', v: Math.trunc(v) | 0 };
    case 'long': if (typeof v === 'boolean') v = +v; return { t: 'long', v: Math.trunc(v) };
    case 'double': if (typeof v === 'boolean') v = +v; return { t: 'double', v: +v };
    case 'bool': return { t: 'bool', v: typeof v === 'string' ? true : v != 0 };
    case 'char': if (typeof v === 'boolean') v = +v; return { t: 'char', v: Math.trunc(v) & 255 };
    case 'string': if (val.t === 'char') return { t: 'string', v: String.fromCharCode(v) }; return { t: 'string', v: String(v) };
  }
  return val;
}
function show(val) {
  if (val.t === 'string') return '"' + val.v + '"';
  if (val.t === 'char') return "'" + String.fromCharCode(val.v) + "'";
  if (val.t === 'bool') return val.v ? 'true' : 'false';
  if (val.t === 'double') return fmtG(val.v);
  return String(val.v);
}
CP.show = show;
function showCell(c) {
  if (c.ty === 'arr' || c.ty === 'vec') return '[' + c.v.slice(0, 8).map(x => show({ t: c.et, v: x })).join(', ') + (c.v.length > 8 ? ', …' : '') + ']';
  return show({ t: c.ty, v: c.v });
}

class Env { constructor(parent) { this.vars = new Map(); this.parent = parent; } }

class Interp {
  constructor(ast, io, opts) {
    this.ast = ast; this.io = io || {}; opts = opts || {};
    this.delay = opts.delay || 0; this.maxSteps = opts.maxSteps || 1500000; this.maxMs = opts.maxMs || 3000;
    this.steps = 0; this.aborted = false; this.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.funcs = new Map(); for (const f of ast.funcs) if (f.body) this.funcs.set(f.name, f);
    this.genv = new Env(null); this.depth = 0; this.inbuf = ''; this.cinFail = false;
    this.evCount = 0; this.maxEv = opts.maxEvents || 400; this.moreSent = false; this.outLen = 0;
    this.stream = { fixed: false, prec: 6, width: 0 }; this.lastEnv = this.genv; this.lastAsg = null;
    this.evOn = !!opts.events;
  }
  abort() { this.aborted = true; }
  emit(e) {
    if (!this.evOn || !this.io.ev) return;
    if (this.evCount >= this.maxEv) { if (!this.moreSent) { this.moreSent = true; this.io.ev({ k: 'more' }); } return; }
    this.evCount++; this.io.ev(e);
  }
  snap(env) {
    const chain = []; for (let e = env; e; e = e.parent) chain.unshift(e);
    const out = []; for (const e of chain) for (const [k, c] of e.vars) out.push({ name: k, ty: c.ty === 'vec' ? 'vector' : c.ty === 'arr' ? c.et + '[]' : c.ty, text: showCell(c) });
    return out;
  }
  pushVars(env) { if (this.io.vars) this.io.vars(this.snap(env)); }
  async tick(n) {
    if (this.aborted) throw new Abort();
    if (++this.steps > this.maxSteps) throw new RunErr('toolong', '', n.line);
    if ((this.steps & 255) === 0) {
      if (!this.delay && (performance.now() - this.t0) > this.maxMs) throw new RunErr('toolong', '', n.line);
      await yieldTick();
    }
    if (this.delay > 0) { if (this.io.line) this.io.line(n.line); await sleep(this.delay); if (this.aborted) throw new Abort(); }
  }
  lookup(env, name) { for (let e = env; e; e = e.parent) { const c = e.vars.get(name); if (c) return c; } return null; }
  async run() {
    try {
      for (const g of this.ast.globals) await this.exec(g, this.genv);
      const main = this.funcs.get('main');
      await this.callFn(main, [], this.genv, main.body);
      if (this.io.vars) this.pushVars(this.lastEnv);
      return { exit: 0, steps: this.steps };
    } catch (e) {
      if (this.io.vars) this.pushVars(this.lastEnv);
      if (e instanceof Exit) return { exit: e.code, steps: this.steps };
      if (e instanceof Abort) return { aborted: true, steps: this.steps };
      if (e instanceof RunErr) return { error: { code: e.code, msg: e.message, line: e.line, data: e.data }, steps: this.steps };
      return { error: { code: 'internal', msg: String(e && e.message || e), line: 0 }, steps: this.steps };
    }
  }
  write(s) {
    this.outLen += s.length;
    if (this.outLen > 30000) throw new RunErr('outputcap', '', 0);
    this.io.out && this.io.out(s);
  }
  async callFn(fn, args, callerEnv, node) {
    if (++this.depth > 1200) throw new RunErr('stack', '', node.line);
    const env = new Env(this.genv);
    fn.params.forEach((p, idx) => {
      const a = args[idx]; // {val, cell}
      if ((p.type.ref || p.arr) && a.cell) { env.vars.set(p.name, a.cell); return; }
      if (p.type.name === 'vector') { const c = a.cell || { v: [] }; env.vars.set(p.name, { ty: 'vec', et: p.type.et, v: c.v.slice() }); return; }
      env.vars.set(p.name, { ty: p.type.name, v: coerce(a.val, p.type.name).v });
    });
    this.emit({ k: 'call', line: node.line, name: fn.name, args: args.map(a => a.val ? show(a.val) : '[…]') });
    let ret = { t: 'int', v: 0 };
    const r = await this.exec(fn.body, env, true);
    if (r && r.sig === 'return') ret = r.val || ret;
    this.depth--;
    if (fn.ret.name !== 'void' && fn.ret.name !== 'auto' && ret.t) ret = coerce(ret, fn.ret.name);
    return ret;
  }
  /* ---- statements ---- */
  async exec(n, env, fnBody) {
    switch (n.k) {
      case 'block': {
        const e2 = fnBody ? env : new Env(env);
        for (const s of n.body) { const r = await this.exec(s, e2); if (r) return r; }
        return;
      }
      case 'empty': return;
      case 'decl': {
        await this.tick(n);
        for (const it of n.items) await this.declare(n.type, it, env, n);
        this.lastEnv = env;
        if (this.delay > 0) this.pushVars(env);
        return;
      }
      case 'expr': {
        await this.tick(n); this.lastAsg = null;
        await this.ev(n.e, env);
        if (this.lastAsg) { const a = this.lastAsg; this.emit({ k: 'assign', line: n.line, name: a.name, old: a.old, val: a.val }); this.lastAsg = null; this.lastEnv = env; if (this.delay > 0) this.pushVars(env); }
        return;
      }
      case 'print': {
        await this.tick(n); let text = '';
        for (const p of n.parts) {
          if (p.k === 'endl') { text += '\n'; continue; }
          if (p.k === 'manip') { const st = this.stream; if (p.name === 'fixed') st.fixed = true; else if (p.name === 'setprecision') st.prec = Math.max(0, (await this.ev(p.arg, env)).v | 0); else if (p.name === 'setw') st.width = Math.max(0, (await this.ev(p.arg, env)).v | 0); continue; }
          let s = this.fmtOut(await this.ev(p, env));
          if (this.stream.width) { s = s.padStart(this.stream.width, ' '); this.stream.width = 0; }
          text += s;
        }
        if (n.stream === 'cerr') this.io.err && this.io.err(text); else this.write(text);
        this.emit({ k: 'print', line: n.line, text });
        return;
      }
      case 'input': {
        await this.tick(n);
        for (const t of n.targets) {
          const r = await this.ref(t, env);
          this.emit({ k: 'input', line: n.line, name: t.src });
          const tokn = await this.readToken();
          if (tokn === null || this.cinFail) { this.cinFail = true; r.set({ t: 'int', v: 0 }); continue; }
          let val;
          if (r.ty === 'string') val = { t: 'string', v: tokn };
          else if (r.ty === 'char') val = { t: 'char', v: tokn.charCodeAt(0) };
          else if (r.ty === 'double') { const x = parseFloat(tokn); if (isNaN(x)) { this.cinFail = true; val = { t: 'double', v: 0 }; } else val = { t: 'double', v: x }; }
          else { const x = parseInt(tokn, 10); if (isNaN(x)) { this.cinFail = true; val = { t: 'int', v: 0 }; } else val = { t: 'int', v: x }; }
          r.set(val);
          this.emit({ k: 'got', line: n.line, name: t.src, val: show(coerce(val, r.ty)) });
        }
        this.lastEnv = env; if (this.delay > 0) this.pushVars(env);
        return;
      }
      case 'if': {
        await this.tick(n);
        const c = this.truthy(await this.ev(n.cond, env));
        this.emit({ k: 'if', line: n.line, cond: n.condSrc, res: c });
        if (c) return this.exec(n.then, env);
        if (n.els) return this.exec(n.els, env);
        return;
      }
      case 'while': {
        let round = 0;
        for (;;) {
          await this.tick(n);
          const c = this.truthy(await this.ev(n.cond, env));
          this.emit({ k: 'loopcheck', line: n.line, cond: n.condSrc, res: c, round: round + 1 });
          if (!c) break; round++;
          const r = await this.exec(n.body, env);
          if (r) { if (r.sig === 'break') break; if (r.sig === 'continue') continue; return r; }
        }
        return;
      }
      case 'do': {
        let round = 0;
        for (;;) {
          await this.tick(n); round++;
          const r = await this.exec(n.body, env);
          if (r) { if (r.sig === 'break') break; if (r.sig !== 'continue') return r; }
          const c = this.truthy(await this.ev(n.cond, env));
          this.emit({ k: 'loopcheck', line: n.line, cond: n.condSrc, res: c, round });
          if (!c) break;
        }
        return;
      }
      case 'for': {
        const e2 = new Env(env); let round = 0;
        if (n.init) await this.exec(n.init, e2);
        for (;;) {
          await this.tick(n);
          if (n.cond) {
            const c = this.truthy(await this.ev(n.cond, e2));
            this.emit({ k: 'loopcheck', line: n.line, cond: n.condSrc, res: c, round: round + 1 });
            if (!c) break;
          }
          round++;
          const r = await this.exec(n.body, e2);
          if (r) { if (r.sig === 'break') break; if (r.sig !== 'continue') return r; }
          if (n.inc) { this.lastAsg = null; await this.ev(n.inc, e2); if (this.delay > 0) this.pushVars(e2); }
        }
        return;
      }
      case 'rangefor': {
        const coll = await this.ev(n.coll, env);
        const items = coll.t === 'string' ? coll.v.split('').map(ch => ({ t: 'char', v: ch.charCodeAt(0) })) : (coll.cell ? coll.cell.v.map(x => ({ t: coll.cell.et, v: x })) : []);
        let round = 0;
        for (const it of items) {
          await this.tick(n); round++;
          const e2 = new Env(env);
          const ty = n.type.name === 'auto' ? it.t : n.type.name;
          e2.vars.set(n.name, { ty, v: coerce(it, ty).v });
          this.emit({ k: 'loopcheck', line: n.line, cond: n.name + ' = ' + show(it), res: true, round });
          const r = await this.exec(n.body, e2);
          if (r) { if (r.sig === 'break') break; if (r.sig !== 'continue') return r; }
        }
        return;
      }
      case 'return': {
        await this.tick(n);
        const val = n.e ? await this.ev(n.e, env) : null;
        this.emit({ k: 'return', line: n.line, val: val ? show(val) : '' });
        return { sig: 'return', val };
      }
      case 'break': await this.tick(n); this.emit({ k: 'break', line: n.line }); return { sig: 'break' };
      case 'continue': await this.tick(n); this.emit({ k: 'continue', line: n.line }); return { sig: 'continue' };
    }
  }
  fmtOut(v) {
    switch (v.t) {
      case 'string': return v.v;
      case 'char': return String.fromCharCode(v.v);
      case 'bool': return v.v ? '1' : '0';
      case 'double': return this.stream.fixed ? v.v.toFixed(this.stream.prec) : fmtG(v.v, this.stream.prec || 1);
      default: return String(v.v);
    }
  }
  truthy(v) { return typeof v.v === 'boolean' ? v.v : typeof v.v === 'string' ? true : v.v != 0; }
  async declare(type, it, env, node) {
    let ty = type.name; let cell;
    if (it.dims.length) {
      let size = it.dims[0] ? (await this.ev(it.dims[0], env)).v | 0 : -1;
      let vals = [];
      if (it.init && it.init.k === 'init') for (const x of it.init.items) vals.push(coerce(await this.ev(x, env), ty).v);
      if (size < 0) size = vals.length;
      if (size < 0 || size > 100000) throw new RunErr('badsize', '', node.line);
      while (vals.length < size) vals.push(defVal(ty));
      cell = { ty: 'arr', et: ty, v: vals.slice(0, size) };
    } else if (ty === 'vector') {
      let vals = [];
      if (it.init && it.init.k === 'init') for (const x of it.init.items) vals.push(coerce(await this.ev(x, env), type.et).v);
      else if (it.init) { const o = await this.ev(it.init, env); if (o.cell) vals = o.cell.v.slice(); }
      else if (it.ctor && it.ctor.length) { const n0 = (await this.ev(it.ctor[0], env)).v | 0; const fill = it.ctor[1] ? coerce(await this.ev(it.ctor[1], env), type.et).v : defVal(type.et); vals = new Array(n0).fill(fill); }
      cell = { ty: 'vec', et: type.et, v: vals };
    } else {
      let val;
      if (it.init) val = await this.ev(it.init, env); else if (it.ctor && it.ctor.length) val = await this.ev(it.ctor[0], env);
      if (ty === 'auto') { ty = val.t === 'bool' ? 'bool' : val.t; }
      cell = { ty, v: val ? coerce(val, ty).v : defVal(ty) };
    }
    env.vars.set(it.name, cell);
    this.emit({ k: 'declare', line: node.line, name: it.name, ty: type.disp === 'auto' ? type.disp + ' (' + ty + ')' : type.disp, val: it.init || it.ctor || it.dims.length ? showCell(cell) : '' });
  }
  /* ---- references (assignable things) ---- */
  async ref(n, env) {
    if (n.k === 'paren') return this.ref(n.e, env);
    if (n.k === 'id') {
      const c = this.lookup(env, n.name);
      if (!c) throw new RunErr('undeclared', n.name, n.line);
      return { ty: c.ty, name: n.name, get: () => ({ t: c.ty, v: c.v }), set: x => { c.v = coerce(x, c.ty).v; } };
    }
    if (n.k === 'idx') {
      const base = await this.ev(n.e, env); const ix = (await this.ev(n.i, env)).v | 0;
      if (base.t === 'string') {
        const owner = await this.ref(n.e, env);
        if (ix < 0 || ix >= base.v.length) throw new RunErr('oob', '', n.line, { idx: ix, len: base.v.length });
        return { ty: 'char', get: () => ({ t: 'char', v: base.v.charCodeAt(ix) }), set: x => { const s = owner.get().v; owner.set({ t: 'string', v: s.slice(0, ix) + String.fromCharCode(x.v) + s.slice(ix + 1) }); } };
      }
      const c = base.cell;
      if (!c) throw new RunErr('internal', 'not indexable', n.line);
      if (ix < 0 || ix >= c.v.length) throw new RunErr('oob', '', n.line, { idx: ix, len: c.v.length });
      return { ty: c.et, get: () => ({ t: c.et, v: c.v[ix] }), set: x => { c.v[ix] = coerce(x, c.et).v; } };
    }
    throw new RunErr('internal', 'not assignable', n.line);
  }
  leaf(n, env) {
    if (n.k === 'num') return { t: n.isF ? 'double' : 'int', v: n.v };
    if (n.k === 'id') {
      const c = this.lookup(env, n.name);
      if (!c) throw new RunErr('undeclared', n.name, n.line);
      if (c.ty === 'arr' || c.ty === 'vec') return { t: c.ty, v: c.v, cell: c, et: c.et };
      return { t: c.ty, v: c.v };
    }
    return null;
  }
  async ev(n, env) {
    switch (n.k) {
      case 'num': return { t: n.isF ? 'double' : 'int', v: n.v };
      case 'str': return { t: 'string', v: n.v };
      case 'chr': return { t: 'char', v: n.v };
      case 'bool': return { t: 'bool', v: n.v };
      case 'paren': return this.ev(n.e, env);
      case 'id': return this.leaf(n, env);
      case 'bin': {
        const a = (n.l.k === 'num' || n.l.k === 'id') ? this.leaf(n.l, env) : await this.ev(n.l, env);
        const b = (n.r.k === 'num' || n.r.k === 'id') ? this.leaf(n.r, env) : await this.ev(n.r, env);
        return this.binop(n.op, a, b, n.line);
      }
      case 'log': {
        const a = this.truthy(await this.ev(n.l, env));
        if (n.op === '&&') return { t: 'bool', v: a ? this.truthy(await this.ev(n.r, env)) : false };
        return { t: 'bool', v: a ? true : this.truthy(await this.ev(n.r, env)) };
      }
      case 'un': {
        const v = await this.ev(n.e, env);
        if (n.op === '!') return { t: 'bool', v: !this.truthy(v) };
        const x = typeof v.v === 'boolean' ? +v.v : v.v;
        if (n.op === '-') return { t: v.t === 'char' || v.t === 'bool' ? 'int' : v.t, v: v.t === 'int' ? (-x) | 0 : -x };
        return { t: v.t === 'char' || v.t === 'bool' ? 'int' : v.t, v: x };
      }
      case 'inc': {
        const r = await this.ref(n.e, env); const old = r.get();
        const nv = { t: old.t, v: old.v + (n.op === '++' ? 1 : -1) };
        r.set(nv);
        const after = r.get();
        if (n.e.k === 'id') this.lastAsg = { name: n.e.name, old: show(old), val: show(after) };
        return n.pre ? after : old;
      }
      case 'asg': {
        const r = await this.ref(n.l, env);
        let val = (n.r.k === 'num') ? this.leaf(n.r, env) : await this.ev(n.r, env);
        const old = r.get();
        if (n.op !== '=') val = this.binop(n.op.slice(0, -1), old, val, n.line);
        if (n.op === '=' && r.ty !== 'string' && val.t === 'string') throw new RunErr('internal', 'bad conversion', n.line);
        r.set(val);
        const now = r.get();
        if (n.l.k === 'id') this.lastAsg = { name: n.l.name, old: show(old), val: show(now) };
        else if (n.l.k === 'idx') this.lastAsg = { name: n.l.src, old: show(old), val: show(now) };
        return now;
      }
      case 'cond': return this.truthy(await this.ev(n.c, env)) ? this.ev(n.a, env) : this.ev(n.b, env);
      case 'cast': {
        const v = await this.ev(n.e, env); const ty = n.type.name;
        if (ty === 'string') return v;
        if (v.t === 'string') throw new RunErr('internal', 'bad cast', n.line);
        return coerce(ty === 'int' ? { t: v.t, v: typeof v.v === 'boolean' ? +v.v : v.v } : v, ty);
      }
      case 'idx': { const r = await this.ref(n, env); return r.get(); }
      case 'call': return this.callExpr(n, env);
      case 'mcall': return this.mcall(n, env);
      case 'mem': throw new RunErr('internal', 'member access', n.line);
      case 'init': throw new RunErr('internal', 'init list', n.line);
    }
    throw new RunErr('internal', 'unknown node ' + n.k, n.line);
  }
  binop(op, a, b, line) {
    if (a.t === 'string' || b.t === 'string') {
      const sa = a.t === 'char' ? String.fromCharCode(a.v) : a.v, sb = b.t === 'char' ? String.fromCharCode(b.v) : b.v;
      switch (op) {
        case '+': return { t: 'string', v: String(sa) + String(sb) };
        case '==': return { t: 'bool', v: sa === sb }; case '!=': return { t: 'bool', v: sa !== sb };
        case '<': return { t: 'bool', v: sa < sb }; case '>': return { t: 'bool', v: sa > sb };
        case '<=': return { t: 'bool', v: sa <= sb }; case '>=': return { t: 'bool', v: sa >= sb };
      }
      throw new RunErr('internal', 'bad string op', line);
    }
    const x = typeof a.v === 'boolean' ? +a.v : a.v, y = typeof b.v === 'boolean' ? +b.v : b.v;
    const isD = a.t === 'double' || b.t === 'double';
    const rt = isD ? 'double' : (a.t === 'long' || b.t === 'long') ? 'long' : 'int';
    const num = v => ({ t: rt, v: rt === 'int' ? v | 0 : v });
    switch (op) {
      case '+': return num(x + y);
      case '-': return num(x - y);
      case '*': return rt === 'int' ? { t: 'int', v: Math.imul(x, y) } : num(x * y);
      case '/': if (isD) return { t: 'double', v: x / y }; if (y === 0) throw new RunErr('div0', '', line); return num(Math.trunc(x / y));
      case '%': if (isD) throw new RunErr('internal', 'bad %', line); if (y === 0) throw new RunErr('div0', '', line); return num(x % y);
      case '<': return { t: 'bool', v: x < y }; case '>': return { t: 'bool', v: x > y };
      case '<=': return { t: 'bool', v: x <= y }; case '>=': return { t: 'bool', v: x >= y };
      case '==': return { t: 'bool', v: x === y }; case '!=': return { t: 'bool', v: x !== y };
      case '<<': return { t: 'int', v: x << y }; case '>>': return { t: 'int', v: x >> y };
    }
    throw new RunErr('internal', 'bad op ' + op, line);
  }
  async readToken() {
    for (;;) {
      const m = /^\s*(\S+)/.exec(this.inbuf);
      if (m) { this.inbuf = this.inbuf.slice(m[0].length); return m[1]; }
      const line = this.io.readLine ? await this.io.readLine() : null;
      if (this.aborted) throw new Abort();
      if (line === null || line === undefined) return null;
      this.inbuf += line + '\n';
    }
  }
  async callExpr(n, env) {
    const nm = n.name; const f = this.funcs.get(nm);
    if (f) {
      const args = [];
      for (const a of n.args) { const v = (a.k === 'num' || a.k === 'id') ? this.leaf(a, env) : await this.ev(a, env); args.push({ val: v, cell: a.k === 'id' ? this.lookup(env, a.name) : null }); }
      return this.callFn(f, args, env, n);
    }
    if (nm === 'swap') {
      const ra = await this.ref(n.args[0], env), rb = await this.ref(n.args[1], env);
      const va = ra.get(), vb = rb.get(); ra.set(vb); rb.set(va); return { t: 'int', v: 0 };
    }
    if (nm === 'getline') {
      const r = await this.ref(n.args[1], env);
      let i = this.inbuf.indexOf('\n');
      if (i < 0) { const line = this.io.readLine ? await this.io.readLine() : null; if (this.aborted) throw new Abort(); if (line === null) { this.cinFail = true; r.set({ t: 'string', v: '' }); return { t: 'int', v: 0 }; } this.inbuf += line + '\n'; i = this.inbuf.indexOf('\n'); }
      const s = this.inbuf.slice(0, i); this.inbuf = this.inbuf.slice(i + 1);
      r.set({ t: 'string', v: s }); this.emit({ k: 'got', line: n.line, name: n.args[1].src, val: '"' + s + '"' });
      return { t: 'int', v: 1 };
    }
    const av = []; for (const a of n.args) av.push(await this.ev(a, env));
    const num = k => { const x = av[k].v; return typeof x === 'boolean' ? +x : x; };
    const dbl = fn => ({ t: 'double', v: fn(num(0)) });
    switch (nm) {
      case 'sqrt': return dbl(Math.sqrt); case 'floor': return dbl(Math.floor); case 'ceil': return dbl(Math.ceil);
      case 'round': return dbl(x => Math.sign(x) * Math.round(Math.abs(x))); case 'fabs': return dbl(Math.abs);
      case 'sin': return dbl(Math.sin); case 'cos': return dbl(Math.cos); case 'tan': return dbl(Math.tan);
      case 'log': return dbl(Math.log); case 'log10': return dbl(Math.log10); case 'exp': return dbl(Math.exp);
      case 'pow': return { t: 'double', v: Math.pow(num(0), num(1)) };
      case 'abs': return { t: av[0].t === 'double' ? 'double' : 'int', v: Math.abs(num(0)) };
      case 'max': return this.binop('>', av[0], av[1]).v ? av[0] : av[1];
      case 'min': return this.binop('<', av[0], av[1]).v ? av[0] : av[1];
      case 'rand': return { t: 'int', v: Math.floor(Math.random() * 32768) };
      case 'srand': return { t: 'int', v: 0 };
      case 'time': return { t: 'long', v: Math.floor(Date.now() / 1000) };
      case 'exit': throw new Exit(num(0) | 0);
      case 'to_string': return { t: 'string', v: av[0].t === 'double' ? av[0].v.toFixed(6) : av[0].t === 'char' ? String.fromCharCode(av[0].v) : String(typeof av[0].v === 'boolean' ? +av[0].v : av[0].v) };
      case 'stoi': { const x = parseInt(av[0].v, 10); if (isNaN(x)) throw new RunErr('stoi', '', n.line); return { t: 'int', v: x }; }
      case 'stod': { const x = parseFloat(av[0].v); if (isNaN(x)) throw new RunErr('stoi', '', n.line); return { t: 'double', v: x }; }
    }
    throw new RunErr('internal', 'unknown function ' + nm, n.line);
  }
  async mcall(n, env) {
    if (n.obj.k === 'id' && n.obj.name === 'cin') {
      if (n.name === 'ignore') { this.inbuf = this.inbuf.slice(1); if (!this.inbuf.length && false) { } return { t: 'int', v: 0 }; }
      return { t: 'int', v: 0 };
    }
    const o = await this.ev(n.obj, env);
    const av = []; for (const a of n.args) av.push(await this.ev(a, env));
    const nm = n.name;
    if (o.t === 'string') {
      const s = o.v;
      switch (nm) {
        case 'length': case 'size': return { t: 'int', v: s.length };
        case 'empty': return { t: 'bool', v: s.length === 0 };
        case 'substr': { const a = av[0].v | 0, l = av[1] ? av[1].v | 0 : s.length; if (a > s.length) throw new RunErr('oob', '', n.line, { idx: a, len: s.length }); return { t: 'string', v: s.substr(a, l) }; }
        case 'find': { const i = s.indexOf(av[0].t === 'char' ? String.fromCharCode(av[0].v) : av[0].v); return { t: 'long', v: i < 0 ? 4294967295 : i }; }
        case 'at': { const i = av[0].v | 0; if (i < 0 || i >= s.length) throw new RunErr('oob', '', n.line, { idx: i, len: s.length }); return { t: 'char', v: s.charCodeAt(i) }; }
        case 'back': return { t: 'char', v: s.charCodeAt(s.length - 1) };
        case 'front': return { t: 'char', v: s.charCodeAt(0) };
        case 'push_back': case 'append': case 'clear': case 'pop_back': {
          const r = await this.ref(n.obj, env); const cur = r.get().v;
          if (nm === 'push_back') r.set({ t: 'string', v: cur + String.fromCharCode(av[0].v) });
          else if (nm === 'append') r.set({ t: 'string', v: cur + (av[0].t === 'char' ? String.fromCharCode(av[0].v) : av[0].v) });
          else if (nm === 'clear') r.set({ t: 'string', v: '' }); else r.set({ t: 'string', v: cur.slice(0, -1) });
          return { t: 'int', v: 0 };
        }
        case 'c_str': return o;
      }
    } else if (o.t === 'vec' || o.t === 'arr') {
      const c = o.cell; const et = c.et;
      switch (nm) {
        case 'size': return { t: 'long', v: c.v.length };
        case 'empty': return { t: 'bool', v: c.v.length === 0 };
        case 'push_back': c.v.push(coerce(av[0], et).v); return { t: 'int', v: 0 };
        case 'pop_back': c.v.pop(); return { t: 'int', v: 0 };
        case 'clear': c.v.length = 0; return { t: 'int', v: 0 };
        case 'back': if (!c.v.length) throw new RunErr('oob', '', n.line, { idx: -1, len: 0 }); return { t: et, v: c.v[c.v.length - 1] };
        case 'front': if (!c.v.length) throw new RunErr('oob', '', n.line, { idx: 0, len: 0 }); return { t: et, v: c.v[0] };
        case 'at': { const i = av[0].v | 0; if (i < 0 || i >= c.v.length) throw new RunErr('oob', '', n.line, { idx: i, len: c.v.length }); return { t: et, v: c.v[i] }; }
        case 'resize': { const k = av[0].v | 0; while (c.v.length < k) c.v.push(defVal(et)); c.v.length = k; return { t: 'int', v: 0 }; }
      }
    }
    throw new RunErr('internal', "unknown method '" + nm + "'", n.line);
  }
}

CP.execute = function (ast, io, opts) { const it = new Interp(ast, io, opts); return { promise: it.run(), abort: () => it.abort() }; };
CP.version = 1;
})(typeof window !== 'undefined' ? window : globalThis);
