const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, '../build/node_modules/jsdom'));
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const errs = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push('jsdomError: ' + (e.detail && e.detail.stack || e.message))); vc.on('error', e => errs.push('console.error: ' + e));
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://codepop.test/', virtualConsole: vc });
const w = dom.window, d = w.document, $ = s => d.querySelector(s), $$ = s => Array.from(d.querySelectorAll(s));
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x === undefined ? '' : x); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = w.__codepop;
function type(txt) { const ta = $('#ta'); ta.value = txt; ta.setSelectionRange(txt.length, txt.length); ta.dispatchEvent(new w.Event('input', { bubbles: true })); }
const click = s => (typeof s === 'string' ? $(s) : s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  ok('boot', !!P, errs.join('\n'));
  ok('screen off at start', !$('#screenOff').hidden && $('#frame').hidden);
  ok('hi in explain', $('#explain').textContent.length > 10, $('#explain').textContent);
  ok('keys built', $$('#keys button').length > 10);
  ok('mascot', $('#mascot').textContent.length > 0);

  // HTML: typing <html> powers the screen on
  type('<html>'); await wait(700);
  ok('screen on after <html>', $('#screenOff').hidden && !$('#frame').hidden, $('#frame').hidden);
  ok('explain shows <html>', $('#explain .ex-chip') && $('#explain .ex-chip').textContent === '<html>', $('#explain').innerHTML.slice(0, 300));
  ok('unclosed problem', P.problems.some(p => p.code === 'unclosed'));
  ok('badge shows count', !$('#badge').hidden && $('#badge').textContent === String(P.problems.length), $('#badge').textContent);
  ok('oops row', !!$('#explain .oops-row'));
  ok('srcdoc set', ($('#frame').getAttribute('srcdoc') || '').includes('<html>'));

  // terminal tab
  click('#dock [data-tab=term]'); ok('sheet open', !$('#sheet').hidden && $('#sheetTitle').textContent.length > 0);
  ok('term has steps', $$('#termBox .tl.step').length >= 1, $('#sheetBody').innerHTML.slice(0, 300));
  click('#dock [data-tab=term]'); ok('sheet closes', $('#sheet').hidden);

  // problem card + fix
  click('#dock [data-tab=problems]');
  ok('problem cards', $$('.pcard').length >= 1);
  click($('.phead')); ok('card expands', !!$('.pbody') && $('.pbody .diff') && $('.pbody .ex-sec.tip'), $('#sheetBody').innerHTML.slice(0, 400));
  ok('no raw placeholders', !/\{\w+\}/.test($('#sheetBody').textContent), $('#sheetBody').textContent);
  click($('[data-act=pfix]')); await wait(300);
  ok('fix applied', $('#ta').value.includes('</html>'), $('#ta').value);
  ok('XP given', P.S.xp >= 5);

  // all html problems render cleanly in all languages
  const samples = ['<html>\n<hl>Hi</hl>', '<ul>\n<li>one\n</ul>', '<p>a</p></div>', '<a href="x>Link</a>', '<img>', '<h1\n<p>x</p>', '<html></html>', '<img src="a.png">'];
  let leftovers = [];
  for (const sp of ['en', 'es', 'hi', 'ar']) {
    P.setSpoken(sp);
    for (const s of samples) {
      type(s); await wait(160); P.openTab('problems', true);
      $$('.phead').forEach(h => { click(h); });
      for (const p of P.problems) { click($(`.phead[data-k="${p.code}:${p.line}:${p.off || 0}"]`)); const txt = $('#sheetBody').textContent; if (/\{\w+\}|undefined|\[object/.test(txt)) leftovers.push(sp + ':' + p.code + ':' + txt.match(/\{\w+\}|undefined|\[object/)[0]); }
    }
  }
  ok('html problem cards clean', leftovers.length === 0, [...new Set(leftovers)].join(' | '));
  P.setSpoken('en');

  // C++ mode
  P.setLang('cpp'); ok('cpp keys', $$('#keys button').length > 10 && $('#btnStep').hidden === false);
  ok('cpp screen off', !$('#screenOff').hidden);
  const prog = '#include <iostream>\nusing namespace std;\nint main() {\n    int bones = 5;\n    for (int i = 1; i <= 3; i++) {\n        bones = bones + i;\n    }\n    cout << "Bones: " << bones << endl;\n    return 0;\n}\n';
  type(prog); await wait(300);
  ok('cpp screen on when valid', $('#screenOff').hidden && !$('#console').hidden);
  ok('cpp explain for line 1', $('#explain .ex-chip') !== null);
  ok('cpp lines analyze', P.infos.length >= 10);
  await wait(1200); // auto-run
  ok('cpp auto-run output', $('#conOut').textContent.includes('Bones: 11'), JSON.stringify($('#conOut').textContent));
  ok('vars boxes', !$('#boxes').hidden && $('#boxes').textContent.includes('bones'), $('#boxes').textContent);
  click('#btnRun'); await wait(600);
  ok('manual run output', $('#conOut').textContent.includes('Bones: 11') && $('#conOut').textContent.includes('Program'), $('#conOut').textContent);
  click('#dock [data-tab=term]'); await wait(50);
  const steps = $$('#termBox .tl.step').map(x => x.textContent);
  ok('terminal steps for cpp', steps.length >= 5 && steps.some(s => /bones/.test(s)) && steps.some(s => /Round/.test(s)), steps.join('\n'));
  ok('terminal output lines', $$('#termBox .tl.out').some(x => x.textContent.includes('Bones: 11')));
  click('#dock [data-tab=term]');

  // C++ error like normal
  type(prog.replace('int bones = 5;', 'int bones = 5'));
  await wait(300);
  ok('cpp semi problem', P.problems.some(p => p.code === 'semi' && p.line === 4), JSON.stringify(P.problems.map(p => p.code + p.line)));
  click('#btnRun'); await wait(200);
  ok('failed message', $('#conOut').textContent.includes('Build failed'), $('#conOut').textContent);
  P.openTab('term', true);
  ok('g++ style in terminal', $$('#termBox .tl.err').some(x => /expected ';'/.test(x.textContent)), $('#termBox').textContent);
  P.openTab('problems', true);
  click($('.phead')); const txt = $('#sheetBody').textContent;
  ok('fix card with tip', /Tip|tip/.test(txt) && $('[data-act=pfix]'), txt.slice(0, 200));
  click($('[data-act=pfix]')); await wait(300);
  ok('semi fixed', P.problems.length === 0 && /int bones = 5;/.test($('#ta').value), $('#ta').value);

  // runtime error: div by zero
  type('#include <iostream>\nusing namespace std;\nint main() {\n    int a = 5;\n    int b = 0;\n    cout << a / b << endl;\n    return 0;\n}\n'); await wait(300);
  P.S.auto = false; click('#btnRun'); await wait(600);
  ok('runtime problem', P.problems.some(p => p.code === 'div0'), JSON.stringify(P.problems.map(p => p.code)));
  ok('runtime in console', /divide|zero|Floating/i.test($('#conOut').textContent), JSON.stringify($('#conOut').textContent));
  P.S.auto = true;

  // cin
  type('#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n    string name;\n    cout << "Name? ";\n    cin >> name;\n    cout << "Hi " << name << endl;\n    return 0;\n}\n'); await wait(300);
  click('#btnRun'); await wait(300);
  ok('input form shown', !$('#conForm').hidden);
  $('#conInput').value = 'Zed'; $('#conForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(400);
  ok('cin result', $('#conOut').textContent.includes('Hi Zed'), $('#conOut').textContent);

  // step mode + stop
  type(prog); await wait(200); click('#btnStep'); await wait(500);
  ok('step mode running', !$('#btnStop').hidden && $('.gn.run') !== null, $('#btnStop').hidden);
  click('#btnStop'); await wait(100); ok('stopped', $('#btnStop').hidden && $('.gn.run') === null);

  // missions
  P.setLang('html'); P.S.mission = null; P.startMission('html1', false); await wait(50);
  ok('goal banner', !!$('#explain .goal'));
  type('<!DOCTYPE html>\n<html>\n<body>\n<h1>My Cool Page</h1>\n</body>\n</html>\n'); await wait(900);
  ok('mission done', P.S.done.html1 === 1 && P.S.xp >= 55, JSON.stringify(P.S.done) + P.S.xp);
  P.openTab('missions', true); ok('missions list', $$('.mcard').length === 7 && $$('.mcard.done').length === 1, $$('.mcard').length);
  P.openTab('lines', true); ok('lines list', $$('.lcard').length >= 5);

  // themes + languages
  for (const th of ['blocky', 'space', 'dino', 'snack', 'goal', 'candy', 'arcade', 'reef']) { P.setSkin(th); ok('skin ' + th, d.documentElement.getAttribute('data-skin') === th && $('#mascot').textContent.length > 0); }
  P.setSpoken('ar'); ok('rtl', $('#app').getAttribute('dir') === 'rtl'); ok('ar text', /[؀-ۿ]/.test($('#explain').textContent), $('#explain').textContent.slice(0, 100));
  P.setSpoken('hi'); ok('hi text', /[ऀ-ॿ]/.test($('#explain').textContent));
  P.setSpoken('es'); ok('es text', $('#dock').textContent.includes('Terminal') || $('#dock').textContent.length > 5);
  P.setSpoken('en'); ok('ltr', $('#app').getAttribute('dir') === 'ltr');

  // settings modal
  click('#btnSet'); ok('modal open', !$('#modal').hidden && $$('.tcard').length === 8 && $$('.pill').length >= 7);
  click($('[data-act=skin][data-id=candy]')); ok('skin via modal', P.S.skin === 'candy');
  click('.modal [data-act=mclose]'); ok('modal closes', $('#modal').hidden);

  // persistence
  await wait(400); const st = JSON.parse(w.localStorage.getItem('codepop.v1')); ok('persisted', st && st.skin === 'candy' && st.xp >= 55 && typeof st.code.html === 'string');

  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no runtime errors');
  console.log('pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('TEST CRASH', e && e.stack || e); console.log(errs.join('\n')); process.exit(2); });
