const vm=require('vm'),fs=require('fs');
for(const f of ['content','html','explain']) vm.runInThisContext(fs.readFileSync(__dirname+'/../src/'+f+'.js','utf8'));
const H=globalThis.HTMLX,E=globalThis.EXPL;
let pass=0,fail=0;const ok=(n,c,x)=>{if(c)pass++;else{fail++;console.log('FAIL',n,x||'')}};
const codes=s=>H.lint(s).map(p=>p.code+':'+p.line);
ok('clean',H.lint('<!DOCTYPE html>\n<html>\n<body>\n<h1>Hi</h1>\n</body>\n</html>\n').length===0,JSON.stringify(H.lint('<!DOCTYPE html>\n<html>\n<body>\n<h1>Hi</h1>\n</body>\n</html>\n')));
ok('unclosed h1 inline',codes('<!DOCTYPE html>\n<html><body>\n<h1>Hello\n<p>x</p>\n</body></html>').includes('unclosed:3'),codes('<!DOCTYPE html>\n<html><body>\n<h1>Hello\n<p>x</p>\n</body></html>'));
let src='<!DOCTYPE html>\n<html>\n<body>\n<h1>Hello\n</body>\n</html>\n';
let pr=H.lint(src); ok('h1 unclosed',pr.some(p=>p.code==='unclosed'));
function apply(s,p){const e=p.fixes[0].edits.slice().sort((a,b)=>b.s-a.s);for(const x of e)s=s.slice(0,x.s)+x.t+s.slice(x.e);return s}
let fixed=apply(src,pr.find(p=>p.code==='unclosed')); ok('fix h1',H.lint(fixed).length===0,fixed+JSON.stringify(H.lint(fixed)));
ok('stray',codes('<p>a</p></div>').includes('strayclose:1'));
ok('unknown',H.lint('<hl>Hi</hl>').some(p=>p.code==='unknowntag'&&p.data.sug==='<h1>'),JSON.stringify(H.lint('<hl>Hi</hl>')));
src='<html>\n<body>\n';
let p1=H.lint(src).filter(p=>p.code==='unclosed'); ok('eof unclosed 2',p1.length===2);
let s2=src; for(let k=0;k<5;k++){const ps=H.lint(s2).filter(p=>p.sev==='error'); if(!ps.length)break; s2=apply(s2,ps[ps.length-1]);} ok('eof fix loop',H.lint(s2).filter(p=>p.sev==='error').length===0,s2);
ok('img alt',H.lint('<img src="cat.png">').some(p=>p.code==='imgalt'));
ok('img src',H.lint('<img>').some(p=>p.code==='imgsrc'));
ok('quote',H.lint('<a href="x>Link</a>').some(p=>p.code==='attrquote'),JSON.stringify(H.lint('<a href="x>Link</a>')));
ok('tagend',H.lint('<h1\n<p>x</p>').some(p=>p.code==='tagend'),JSON.stringify(H.lint('<h1\n<p>x</p>')));
ok('style skip',H.lint('<style>\na > b { color: red }\n</style>').length===0,JSON.stringify(H.lint('<style>\na > b { color: red }\n</style>')));
ok('mismatch',H.lint('<ul>\n<li>one\n</ul>').some(p=>p.code==='unclosed'||p.code==='mismatch'));
ok('doctype hint',H.lint('<html></html>').some(p=>p.code==='nodoctype'));
// modes
const md=H.lineModes('<style>\nbody{}\n</style>\n<p>x</p>\n<script>\nlet a=1;\n</script>'); ok('modes',md.join()==='html,css,html,html,html,js,html',md.join());
// analyze
const a=E.analyze('html','<h1>Hello</h1>\n<li><b>x</b></li>\n\n</div>\n<!-- hi -->'); ok('an h1',a[0].id==='h'&&a[0].text==='Hello'); ok('an li',a[1].id==='li'&&a[1].extras.length>=1); ok('an blank',a[2].id==='blank'); ok('an close',a[3].id==='close'); ok('an comment',a[4].id==='comment');
const css=E.analyze('html','<style>\nh1 {\n  color: red;\n  font-size: 20px;\n}\n</style>'); ok('css',css[1].id==='sel'&&css[2].id==='color'&&css[3].id==='fsize'&&css[4].id==='cclose',JSON.stringify(css.map(x=>x.id)));
const cpp=E.analyze('cpp','#include <iostream>\nusing namespace std;\n\nint main() {\n    int coins = 5;\n    string n = "Bob";\n    cout << "hi" << endl;\n    for (int i = 0; i < 3; i++) {\n        coins++;\n    }\n    if (coins > 3) {\n    } else {\n    }\n    return 0;\n}\nint add(int a, int b) {\n    return a + b;\n}');
const ids=cpp.map(x=>x.id).join(); console.log(ids);
ok('cpp ids',ids==='include,using,blank,main,decl,decl,cout,for,incr,close,if,else,close,return0,close,funcdef,return,close',ids);
ok('close kinds',cpp[9].params._kind==='for'&&cpp[14].params._kind==='main'&&cpp[17].params._kind==='func',JSON.stringify([cpp[9].params,cpp[14].params,cpp[17].params]));
// render all langs
for(const l of ['en','es','hi','ar'])for(const th of ['blocky','arcade']){const r=E.render(cpp[4],l,th);ok('render '+l,r.what.includes('coins')&&r.play.length>5&&r.why.length>5,JSON.stringify(r))}
const r=E.render(cpp[3],'en','space'); console.log(r.what,'|',r.why,'|',r.play);
const r2=E.render(cpp[10],'es','dino'); console.log(r2.what);
const r3=E.render(cpp[9],'en','dino'); console.log(r3.what);
ok('ask',E.ask('cpp','what is cout?','en','blocky')&&E.ask('html','explain h1','en','blocky')&&!E.ask('cpp','zzzz','en','blocky'));
// preview
const pd=H.previewDoc('<!DOCTYPE html><img src="cat.png"><img src="x.png">'); ok('preview',pd.indexOf('<script>')>14&&pd.includes('data:image/svg+xml')&&pd.includes('x.png'));
console.log('log:',JSON.stringify(H.buildLog('<h1>Hi there</h1>\n<img src="zzz.png">\n<style>\nh1 { color: red; }\n</style>','en')));
console.log('pass',pass,'fail',fail);
