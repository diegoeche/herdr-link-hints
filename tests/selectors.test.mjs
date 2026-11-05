import assert from 'node:assert/strict';
import test from 'node:test';
import {selectorConfig,prefixMatches,imageMatches,regexMatches,candidates,pageRows} from '../mods/link-hints/selectors.js';

function grid(text,cols) {
  const lines=[];
  for(let at=0;at<text.length;at+=cols) {
    const row=text.slice(at,at+cols).padEnd(cols,' ');
    lines.push({text:row,columns:Array.from({length:cols},(_,i)=>i)});
  }
  return {lines,positioned:true,cols,rows:lines.length};
}

test('configuration keeps opinionated defaults and merges per-selector extensions',()=>{
  const defaults=selectorConfig();
  assert.equal(defaults.mode,'inline');
  assert.equal(defaults.selectors.execute.match.prefix,'!');
  const custom=selectorConfig({selectors:{images:false,execute:{match:{prefix:'$ '}},
    tickets:{match:{type:'regex',pattern:'PROJ-(\\d+)'},action:{type:'open-url',template:'https://tracker.test/{value}'}}}});
  assert.equal(custom.selectors.images,undefined);
  assert.equal(custom.selectors.execute.action.type,'type-command');
  assert.equal(custom.selectors.execute.match.prefix,'$ ');
  assert.equal(custom.selectors.tickets.action.type,'open-url');
});

test('command markers require an explicit prefix and retain exact shell syntax',()=>{
  assert.deepEqual(prefixMatches('!git status\n  ! printf "$HOME" && true\n> !npm test\n!!history\n!=wrong\nImportant!\n!'),[
    {value:'git status',match:'!git status'},
    {value:'printf "$HOME" && true',match:'! printf "$HOME" && true'},
    {value:'npm test',match:'!npm test'},
  ]);
  assert.equal(prefixMatches('$ echo yes',{prefix:'$ '})[0].value,'echo yes');
});

test('image paths include quoted spaces and exclude web addresses',()=>{
  const paths=imageMatches('View /tmp/plot.png and ./out/test.webp; "my plot.jpg" `~/Pictures/a.svg` https://x.test/web.png');
  assert.deepEqual(paths.map(p=>p.value),['/tmp/plot.png','./out/test.webp','my plot.jpg','~/Pictures/a.svg']);
});

test('custom regex matchers expose a chosen capture and reject invalid config',()=>{
  assert.deepEqual(regexMatches('PROJ-12 PROJ-34',{pattern:'PROJ-(\\d+)'}).map(x=>x.value),['12','34']);
  assert.throws(()=>regexMatches('x',{pattern:'('}));
  assert.throws(()=>candidates({match:{type:'missing'}},'x'),/Unknown matcher/);
});

test('wrapped links retain the entire destination and one badge at each occurrence',()=>{
  const url='https://example.com/'+('segment/'.repeat(14))+'?end=correct';
  const snapshot=grid(url,40);
  const list=candidates(selectorConfig().selectors.links,url,snapshot);
  assert.equal(list.length,1);
  assert.equal(list[0].value,url);
  assert.deepEqual(list[0].positions,[{row:0,col:0}]);
  const broken=candidates(selectorConfig().selectors.links,url.slice(0,40)+'\n'+url.slice(40),snapshot);
  assert.notEqual(broken[0].value,url,'a real newline never joins separate logical lines');
});

test('wrapped commands stay complete, deduplicate, and never execute during matching',()=>{
  const command='printf '+('a-very-long-argument '.repeat(12)).trimEnd();
  const list=candidates(selectorConfig().selectors.execute,'!'+command,grid('!'+command,35));
  assert.equal(list[0].value,command);
  assert.deepEqual(list[0].positions,[{row:0,col:0}]);
  assert.equal(candidates(selectorConfig().selectors.execute,'!pwd\n!pwd').length,1);
});

test('every item remains reachable when window rows overflow',()=>{
  const items=Array.from({length:1000},(_,i)=>i);
  for(const height of [170,240,1080]) for(const index of [0,6,500,999]) {
    const page=pageRows(items,index,12,height);
    assert.ok(page.visible.includes(index));
    assert.ok(page.visible.length<=page.count);
    assert.ok(page.count>=1&&page.count<=12);
  }
});
