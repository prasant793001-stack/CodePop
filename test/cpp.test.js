const vm=require('vm'),fs=require('fs');
vm.runInThisContext(fs.readFileSync(__dirname+'/../src/cpp.js','utf8'));
const CP=globalThis.CP;
let pass=0,fail=0;
async function run(src,input){
  const c=CP.compile(src);
  if(!c.ok) return {compile:c.problems.map(p=>p.sev+':'+p.code+':'+p.line+':'+p.col+':'+p.msg)};
  let out=''; const lines=(input||'').split('\n'); let li=0;
  const r=await CP.execute(c.ast,{out:s=>out+=s,readLine:async()=>li<lines.length&&input!==undefined?lines[li++]:null},{}).promise;
  return {out,r,warn:c.problems.map(p=>p.code)};
}
async function t(name,src,exp,input){
  const res=await run(src,input);
  let ok;
  if(typeof exp==='string') ok=res.out===exp;
  else if(exp.compile) ok=res.compile&&res.compile.some(x=>x.includes(exp.compile));
  else if(exp.err) ok=res.r&&res.r.error&&res.r.error.code===exp.err;
  else if(exp.warn) ok=res.warn&&res.warn.includes(exp.warn)&&(exp.out===undefined||res.out===exp.out);
  if(ok){pass++;} else {fail++;console.log('FAIL',name,JSON.stringify(res).slice(0,500));}
}
const H='#include <iostream>\nusing namespace std;\n';
(async()=>{
await t('hello',H+'int main() {\n    cout << "Hello" << endl;\n    return 0;\n}\n','Hello\n');
await t('vars',H+'int main(){ int coins = 5; coins += 3; cout << "coins: " << coins << endl; double d = 7/2; cout << d << " " << 7/2.0 << endl; return 0;}','coins: 8\n3 3.5\n');
await t('ifelse',H+'int main(){ int x=10; if (x>5) cout<<"big"; else cout<<"small"; return 0;}','big');
await t('for',H+'int main(){ for(int i=1;i<=3;i++){ cout<<i<<" "; } cout<<endl; return 0;}','1 2 3 \n');
await t('while',H+'int main(){ int n=0; while(n<3){ n++; } cout<<n; return 0;}','3');
await t('dowhile',H+'int main(){ int n=5; do { n--; } while(n>0); cout<<n; return 0;}','0');
await t('func',H+'int add(int a,int b){ return a+b; }\nint main(){ cout<<add(2,3)<<endl; return 0;}','5\n');
await t('recursion',H+'int fact(int n){ if(n<=1) return 1; return n*fact(n-1);}\nint main(){ cout<<fact(5); return 0;}','120');
await t('string',H+'int main(){ string name="Bob"; cout<<"Hi "+name+"! "<<name.length()<<endl; return 0;}','Hi Bob! 3\n');
await t('vector',H+'#include <vector>\nint main(){ vector<int> v={1,2,3}; v.push_back(4); int s=0; for(int x:v) s+=x; cout<<s<<" "<<v.size(); return 0;}','10 4');
await t('array',H+'int main(){ int a[3]={4,5,6}; a[1]=9; cout<<a[0]<<a[1]<<a[2]; return 0;}','496');
await t('cin',H+'int main(){ int x; cout<<"n? "; cin>>x; cout<<x*2; return 0;}','n? 42','21');
await t('getline',H+'int main(){ string s; getline(cin,s); cout<<"["<<s<<"]"; return 0;}','[hello world]','hello world');
await t('math',H+'#include <cmath>\nint main(){ cout<<sqrt(16)<<" "<<pow(2,10)<<" "<<floor(3.7); return 0;}','4 1024 3');
await t('double fmt',H+'int main(){ cout<<3.14159265<<" "<<100000.0<<" "<<1234567.0<<" "<<0.1+0.2; return 0;}','3.14159 100000 1.23457e+06 0.3');
await t('fixed',H+'#include <iomanip>\nint main(){ cout<<fixed<<setprecision(2)<<3.14159; return 0;}','3.14');
await t('bool',H+'int main(){ bool b = 3>2 && !(1==2); cout<<b; return 0;}','1');
await t('char',H+"int main(){ char c='a'; c++; cout<<c<<(int)c; return 0;}",'b98');
await t('int div',H+'int main(){ cout<<7/2<<" "<<7%3<<" "<<-7/2; return 0;}','3 1 -3');
await t('ternary',H+'int main(){ int a=3; cout<<(a>2?"y":"n"); return 0;}','y');
await t('break/continue',H+'int main(){ for(int i=0;i<10;i++){ if(i==2) continue; if(i==5) break; cout<<i; } return 0;}','0134');
await t('ref param',H+'void inc(int& x){ x++; }\nint main(){ int a=1; inc(a); cout<<a; return 0;}','2');
await t('std::',  '#include <iostream>\nint main(){ std::cout<<"ok"<<std::endl; return 0;}','ok\n');
await t('to_string',H+'int main(){ int n=5; string s="n="+to_string(n); cout<<s; return 0;}','n=5');
await t('overflow',H+'int main(){ int x=2147483647; x=x+1; cout<<x; return 0;}','-2147483648');
// compile errors
await t('semi',H+'int main(){\n cout<<"Hi"\n return 0;\n}',{compile:"semi:4:"});
await t('undeclared',H+'int main(){\n int coins=5;\n cout<<coin;\n return 0;\n}',{compile:"did you mean 'coins'"});
await t('noinclude','using namespace std;\nint main(){ cout<<"x"; return 0;}',{compile:'noinclude'});
await t('nonamespace','#include <iostream>\nint main(){ cout<<"x"; return 0;}',{compile:'nonamespace'});
await t('quote',H+'int main(){\n cout<<"Hi;\n return 0;\n}',{compile:'missing terminating'});
await t('brace',H+'int main(){\n cout<<"Hi";\n return 0;\n',{compile:"expected '}' at end of input"});
await t('paren',H+'int main(){ int x=3; if (x>2 { cout<<1; } return 0;}',{compile:"expected ')' before '{' token"});
await t('cvt',H+'int main(){ int x = "hello"; return 0;}',{compile:'cvt'});
await t('cvt2',H+'int main(){ string s = 5; return 0;}',{compile:'cvt2'});
await t('redecl',H+'int main(){ int x=1; int x=2; return 0;}',{compile:'redecl'});
await t('Int',H+'int main(){ Int x=1; return 0;}',{compile:"did you mean 'int'"});
await t('nomain',H+'int f(){return 1;}',{compile:'nomain'});
await t('wrongop',H+'int main(){ int x; cin << x; return 0;}',{compile:'wrongop'});
await t('cout >>',H+'int main(){ cout >> "x"; return 0;}',{compile:'wrongop'});
await t('args',H+'int add(int a,int b){return a+b;}\nint main(){ cout<<add(1); return 0;}',{compile:'fewargs'});
await t('strplus',H+'int main(){ int n=3; string s="a"+n; return 0;}',{compile:'strplusnum'});
await t('cstrplus',H+'int main(){ string s="a"+"b"; return 0;}',{compile:'cstrplus'});
await t('assigncond warn',H+'int main(){ int x=1; if(x=5) cout<<"y"; return 0;}',{warn:'assigncond',out:'y'});
await t('stray',H+'int main(){ int x = 5 @ 3; return 0;}',{compile:'stray'});
await t('mainret',H+'void main(){ }',{compile:'mainret'});
// runtime
await t('div0',H+'int main(){ int a=0; cout<<5/a; return 0;}',{err:'div0'});
await t('infinite',H+'int main(){ while(true){ } return 0;}',{err:'toolong'});
await t('oob',H+'int main(){ int a[3]; cout<<a[5]; return 0;}',{err:'oob'});
await t('stack',H+'int f(int n){ return f(n+1);}\nint main(){ f(1); return 0;}',{err:'stack'});
// perf
const t0=Date.now();
await t('perf',H+'int main(){ long long s=0; for(int i=0;i<200000;i++){ s+=i%7; } cout<<s; return 0;}','599994');
console.log('perf 200k iterations ms:',Date.now()-t0);
// format sample
const c=CP.compile(H+'int main(){\n    cout << "Hi"\n    return 0;\n}\n');
console.log(CP.format(H+'int main(){\n    cout << "Hi"\n    return 0;\n}\n',c.problems[0]).map(x=>x.text).join('\n'));
console.log('pass',pass,'fail',fail); process.exit(0);
})();
