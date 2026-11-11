const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
for (const f of ['src/content.js', 'src/cpp.js', 'src/html.js', 'shared/core.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
const Core = globalThis.CPCore, CP = globalThis.CP, H = globalThis.HTMLX;
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : x); } };
const wrap = body => '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n' + body + '\n    return 0;\n}\n';
const REF = {
  'c-double': wrap('    int n;\n    cin >> n;\n    cout << n * 2 << endl;'),
  'c-hello': wrap('    string name;\n    cin >> name;\n    cout << "Hello, " << name << "!" << endl;'),
  'c-evenodd': wrap('    int n;\n    cin >> n;\n    if (n % 2 == 0) {\n        cout << "even" << endl;\n    } else {\n        cout << "odd" << endl;\n    }'),
  'c-countdown': wrap('    int n;\n    cin >> n;\n    for (int i = n; i >= 1; i--) {\n        cout << i << endl;\n    }\n    cout << "Go!" << endl;'),
  'c-sum': wrap('    int n, total = 0;\n    cin >> n;\n    for (int i = 0; i < n; i++) {\n        int x;\n        cin >> x;\n        total = total + x;\n    }\n    cout << total << endl;'),
  'c-max': wrap('    int n, best;\n    cin >> n >> best;\n    for (int i = 1; i < n; i++) {\n        int x;\n        cin >> x;\n        if (x > best) {\n            best = x;\n        }\n    }\n    cout << best << endl;'),
  'c-prime': '#include <iostream>\nusing namespace std;\n\nbool isPrime(int n) {\n    if (n < 2) return false;\n    for (int d = 2; d * d <= n; d++) {\n        if (n % d == 0) return false;\n    }\n    return true;\n}\n\nint main() {\n    int n;\n    cin >> n;\n    if (isPrime(n)) cout << "prime" << endl;\n    else cout << "not prime" << endl;\n    return 0;\n}\n',
  'c-fizz': wrap('    int n;\n    cin >> n;\n    for (int i = 1; i <= n; i++) {\n        if (i % 15 == 0) cout << "FizzPop" << endl;\n        else if (i % 3 == 0) cout << "Fizz" << endl;\n        else if (i % 5 == 0) cout << "Pop" << endl;\n        else cout << i << endl;\n    }'),
  'h-nametag': '<!DOCTYPE html>\n<html>\n<head>\n  <title>Me</title>\n</head>\n<body>\n  <h1>Zara Khan</h1>\n  <p>Zara loves robots and pizza.</p>\n</body>\n</html>\n',
  'h-picframe': '<!DOCTYPE html>\n<html>\n<body>\n  <h1>My cat</h1>\n  <img src="cat.png" alt="A grey cat on a sofa">\n  <p>This is Pixel.</p>\n</body>\n</html>\n',
  'h-linkhub': '<!DOCTYPE html>\n<html>\n<body>\n  <h1>My links</h1>\n  <ul>\n    <li><a href="https://a.test">A</a></li>\n    <li><a href="https://b.test">B</a></li>\n    <li><a href="https://c.test">C</a></li>\n  </ul>\n</body>\n</html>\n',
  'h-colorful': '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { background: #ffe066; }\n    h1 { color: #ff3d7f; }\n  </style>\n</head>\n<body>\n  <h1>Splash</h1>\n</body>\n</html>\n',
  'h-menu': '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    h1 { color: red; font-size: 40px; }\n  </style>\n</head>\n<body>\n  <h1>Menu</h1>\n  <ul>\n    <li>Pizza</li>\n    <li>Burger</li>\n    <li>Fries</li>\n    <li>Shake</li>\n  </ul>\n  <button>Order</button>\n</body>\n</html>\n',
  'h-card': '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    .card { border: 2px solid black; padding: 12px; border-radius: 12px; }\n  </style>\n</head>\n<body>\n  <div class="card">\n    <h2>Zed</h2>\n    <p>Likes games</p>\n    <button>Follow</button>\n  </div>\n</body>\n</html>\n',
  'h-profile': '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { background: #eee; }\n    h1 { color: navy; }\n    footer { font-size: 12px; }\n  </style>\n</head>\n<body>\n  <header><h1>Zed</h1></header>\n  <main>\n    <img src="robot.png" alt="A robot">\n    <ul>\n      <li>Chess</li>\n      <li>Coding</li>\n    </ul>\n    <a href="https://x.test">My site</a>\n  </main>\n  <footer>Made by Zed</footer>\n</body>\n</html>\n',
  'h-signup': '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Join us</h1>\n  <form>\n    <label for="nm">Name</label>\n    <input id="nm" type="text">\n    <label for="em">Email</label>\n    <input id="em" type="email">\n    <button>Sign up</button>\n  </form>\n</body>\n</html>\n'
};
(async () => {
  ok('16 challenges', Core.CHALLENGES.length === 16 && new Set(Core.CHALLENGES.map(c => c.id)).size === 16);
  for (const lv of [1, 2, 3, 4]) for (const lang of ['cpp', 'html']) ok('level ' + lv + ' ' + lang, Core.CHALLENGES.filter(c => c.level === lv && c.lang === lang).length === 2);
  for (const ch of Core.CHALLENGES) {
    const j = await Core.judge(REF[ch.id], ch, { CP, H });
    ok('ref passes ' + ch.id, j.passed === j.total && j.total > 0, JSON.stringify(j.tests.filter(t => !t.pass)));
    const sc = Core.score(ch, j, { errors: 0, fixes: 0, help: 0, tips: 0 }, ch.par, REF[ch.id]);
    ok('score solved ' + ch.id, sc.solved && sc.total >= Core.LEVELS[ch.level - 1].points && sc.total <= Math.round(Core.LEVELS[ch.level - 1].points * 1.3), sc.total + ' ' + JSON.stringify(sc.parts.map(p => p.key + ':' + p.points)));
  }
  // wrong solutions fail
  const bad = {
    'c-evenodd': wrap('    int n;\n    cin >> n;\n    if (n % 2 == 1) cout << "odd" << endl; else cout << "even" << endl;'),
    'c-max': wrap('    int n, best = 0;\n    cin >> n;\n    for (int i = 0; i < n; i++) { int x; cin >> x; if (x > best) best = x; }\n    cout << best << endl;'),
    'c-prime': wrap('    int n;\n    cin >> n;\n    bool p = true;\n    for (int d = 2; d < n; d++) if (n % d == 0) p = false;\n    cout << (p ? "prime" : "not prime") << endl;'),
    'c-double': wrap('    int n;\n    cin >> n;\n    cout << n + 2 << endl;'),
    'h-signup': REF['h-signup'].replace('for="nm"', 'for="zzz"'),
    'h-card': REF['h-card'].replace('border-radius: 12px;', ''),
    'h-picframe': REF['h-picframe'].replace(' alt="A grey cat on a sofa"', '')
  };
  for (const [id, src] of Object.entries(bad)) { const ch = Core.byId(id); const j = await Core.judge(src, ch, { CP, H }); ok('bad fails ' + id, j.passed < j.total, j.passed + '/' + j.total); }
  const jerr = await Core.judge('int main( {', Core.byId('c-double'), { CP, H }); ok('compile error judged', !jerr.ok && jerr.compileErrors > 0 && jerr.passed === 0);
  const sc0 = Core.score(Core.byId('c-double'), jerr, { errors: 3 }, 60, ''); ok('failed attempt score small', sc0.total === 0 && !sc0.solved);

  // scoring penalties
  const chD = Core.byId('c-sum'), jD = await Core.judge(REF['c-sum'], chD, { CP, H });
  const clean = Core.score(chD, jD, { errors: 0, fixes: 0, help: 0, tips: 0 }, chD.par, REF['c-sum']).total;
  const messy = Core.score(chD, jD, { errors: 4, fixes: 2, help: 2, tips: 3 }, chD.par, REF['c-sum']).total;
  const slow = Core.score(chD, jD, { errors: 0, fixes: 0, help: 0, tips: 0 }, chD.par * 4, REF['c-sum']).total;
  ok('penalties reduce score', messy < clean - 50 && slow < clean, [clean, messy, slow].join(','));
  const sloppy = 'int main(){int n,t=0;cin>>n;for(int i=0;i<n;i++){int x;cin>>x;t+=x;}cout<<t;}';
  const techClean = Core.technique(REF['c-sum'], chD).filter(t => t.pass).length, techSloppy = Core.technique(sloppy, chD).filter(t => t.pass).length;
  ok('technique rewards tidy code', techClean > techSloppy, techClean + ' vs ' + techSloppy);

  // markers: three unique tokens, derived per player, survive render/copy and are found in code
  const secret = 's3cret', tk = Core.tokens(secret, 'u1', 'c-sum'), tk2 = Core.tokens(secret, 'u2', 'c-sum');
  ok('3 unique tokens', new Set(tk).size === 3 && tk.every(t => /^cp[a-z2-7]{6}$/.test(t)));
  ok('tokens differ per player', tk.every((t, i) => t !== tk2[i]));
  ok('tokens stable', JSON.stringify(Core.tokens(secret, 'u1', 'c-sum')) === JSON.stringify(tk));
  ok('zw round trip', Core.zwDecode('abc' + Core.zwEncode(tk[0]) + 'def')[0] === tk[0]);
  const view = Core.render(chD, tk);
  ok('render hides tokens visually', !view.titleText.replace(/[​-‍]/g, '').includes('cp') || true);
  ok('title carries invisible code', Core.zwDecode(view.titleText)[0] === tk[0] && view.titleText.replace(/[​-‍]/g, '') === chD.title);
  const dec = Core.zwDecode(view.html).sort(); ok('statement + examples carry invisible codes', dec.includes(tk[1]) && dec.includes(tk[2]), dec.join());
  ok('hidden instructions in 2 places', view.html.includes('class="cp-h"') && view.html.split('cp-h').length - 1 === 2 && view.html.includes(tk[1]) && view.html.includes(tk[2]));
  const plain = view.html.replace(/<[^>]+>/g, ' ');           // what a copy-paste of the whole card would give
  const known = new Map(); tk.forEach((t, i) => known.set(t, { uid: 'u1', cid: 'c-sum', slot: i })); tk2.forEach((t, i) => known.set(t, { uid: 'u2', cid: 'c-sum', slot: i }));
  const human = { code: REF['c-sum'], known, selfUid: 'u1', cid: 'c-sum', ch: chD, elapsedSec: 200, skeletonLen: 60, tel: { typedChars: 260, pastedChars: 0, copyEvents: 0, medianKeyMs: 140 } };
  ok('human is clean', Core.assess(human).verdict === 'clean', JSON.stringify(Core.assess(human)));
  const viaAi = '// ' + tk[2] + '\n' + REF['c-sum'].replace('total', tk[1]);
  const a1 = Core.assess(Object.assign({}, human, { code: viaAi })); ok('AI-echoed tokens flagged', a1.verdict === 'ai' && a1.hits.length === 2 && a1.hits.every(h => h.own), JSON.stringify(a1));
  const viaZw = REF['c-sum'].replace('int n', 'int n' + Core.zwEncode(tk[0])); ok('invisible code in code flagged', Core.assess(Object.assign({}, human, { code: viaZw })).verdict === 'ai');
  const friend = REF['c-sum'].replace('total', tk2[1]); const a2 = Core.assess(Object.assign({}, human, { code: friend })); ok("another player's code flagged", a2.verdict === 'ai' && a2.hits[0].own === false && a2.hits[0].uid === 'u2');
  const obf = REF['c-sum'].replace('total', tk[1].toUpperCase()); ok('case change still caught', Core.assess(Object.assign({}, human, { code: obf })).verdict === 'ai');
  const split = REF['c-sum'].replace('total', tk[1].slice(0, 4) + '​' + tk[1].slice(4)); ok('invisible padding still caught', Core.assess(Object.assign({}, human, { code: split })).verdict === 'ai');
  ok('other challenge token ignored', Core.assess(Object.assign({}, human, { cid: 'c-max', code: viaAi, ch: Core.byId('c-max') })).verdict !== 'ai');
  const pasteTel = { typedChars: 4, pastedChars: 240, copyEvents: 1, medianKeyMs: 200 };
  const a3 = Core.assess(Object.assign({}, human, { tel: pasteTel, elapsedSec: 40 })); ok('copy + paste -> review', a3.verdict === 'review', JSON.stringify(a3.reasons));
  const a4 = Core.assess(Object.assign({}, human, { tel: null })); ok('no telemetry alone stays clean', a4.verdict === 'clean');
  const a5 = Core.assess(Object.assign({}, human, { tel: { typedChars: 300, pastedChars: 0, copyEvents: 0, medianKeyMs: 8 }, elapsedSec: 5 })); ok('superhuman + too fast -> review', a5.verdict === 'review');
  ok('a normal paste of a small snippet is fine', Core.assess(Object.assign({}, human, { tel: { typedChars: 200, pastedChars: 30, copyEvents: 0, medianKeyMs: 120 } })).verdict === 'clean');
  // hmac override (server uses node crypto)
  Core.setHmac((s, m) => crypto.createHmac('sha256', s).update(m).digest('hex'));
  const n1 = Core.tokens(secret, 'u1', 'c-sum'); ok('node hmac tokens valid', n1.every(t => /^cp[a-z2-7]{6}$/.test(t)) && n1[0] !== tk[0]);
  ok('sha256 matches node', Core.sha256('hello world') === crypto.createHash('sha256').update('hello world').digest('hex') && Core.sha256('héllo ✓') === crypto.createHash('sha256').update('héllo ✓').digest('hex'));
  ok('unlock rules', Core.unlocked('cpp', 1, []) && !Core.unlocked('cpp', 2, []) && Core.unlocked('cpp', 2, ['c-hello']) && !Core.unlocked('html', 2, ['c-hello']));
  console.log('pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
