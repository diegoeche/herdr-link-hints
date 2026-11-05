import assert from 'node:assert/strict';
import test from 'node:test';
import {performAction,commandArgv,commandText,filePath} from '../mods/link-hints/actions.js';

function context() {
  const events=[];
  return {events,target:{space:'source-space',cwd:'/tmp/source',terminal:'source/t9'},machine:null,
    home:()=>'/home/example',appHome:()=>'/test/app',cx:{open_url:value=>events.push(['url',value])},
    run:(name,args)=>events.push([name,args]),
    hc:async args=>{events.push(['hc',args]);return {code:0};},
    exec:async(...args)=>{events.push(['exec',...args]);return {code:0,stdout:JSON.stringify({typed:true,submitted:false})};}};
}

test('shell commands open a separate tab in the captured source directory',async()=>{
  const c=context(),command='printf "%s" "$HOME"; echo "a quote: \'"';
  await performAction({action:{type:'run-command'}},command,c);
  const [name,args]=c.events[0];
  assert.equal(name,'tab.new');assert.equal(args.space,'source-space');assert.equal(args.folder,'/tmp/source');
  assert.equal(args.argv.at(-1),command);
  assert.ok(!args.argv[2].includes(command),'selected text is passed as data to the explicit shell runner');
  assert.equal(commandArgv('!echo test').at(-1),'!echo test','the matcher alone removes the marker');
});

test('the default execute action types bang-prefixed text into the exact source without Enter',async()=>{
  const c=context(),command='printf "quoted value ✓" --flag';
  await performAction({action:{type:'type-command'}},command,c);
  const args=c.events[0][2];
  assert.deepEqual(args,['/test/app/mods/link-hints/terminal_input.py','source/t9','!'+command]);
  assert.ok(!args.includes('enter'));
  assert.ok(!c.events.some(event=>event[0]==='tab.new'));
  assert.throws(()=>commandText('pwd\nrm anything'),/single command line/);
});

test('input failures surface the actual reason and never retry or run a shell',async()=>{
  const c=context();let calls=0;
  c.exec=async()=>{calls++;return {code:3,stdout:JSON.stringify({error:'terminal finished'})};};
  await assert.rejects(performAction({action:{type:'type-command'}},'pwd',c),/terminal finished/);
  assert.equal(calls,1);
  assert.equal(c.events.length,0);
  await assert.rejects(performAction({action:{type:'type-command'}},'pwd',{...c,target:{}}),/source terminal/);
});

test('custom URL actions encode captures while process actions keep arguments separate',async()=>{
  const c=context();
  await performAction({action:{type:'open-url',template:'https://tracker.test/{encoded}'}},'a b&c',c);
  assert.deepEqual(c.events[0],['url','https://tracker.test/a%20b%26c']);
  await performAction({action:{type:'process',argv:['viewer','--file','{value}']}},'a b;$(echo nope)',c);
  assert.deepEqual(c.events[1].slice(0,3),['exec','viewer',['--file','a b;$(echo nope)']]);
});

test('image viewing resolves local paths and rejects unsupported remote paths',async()=>{
  const c=context();
  assert.equal(filePath('my plot.png',c),'/tmp/source/my plot.png');
  assert.equal(filePath('~/plot.png',c),'/home/example/plot.png');
  assert.equal(filePath('file:///tmp/my%20plot.png',c),'/tmp/my plot.png');
  await performAction({action:{type:'open-file'}},'my plot.png',c);
  assert.deepEqual(c.events[0].slice(0,3),['exec','xdg-open',['/tmp/source/my plot.png']]);
  await assert.rejects(performAction({action:{type:'open-file'}},'a.png',{...c,machine:'remote'}),/another machine/);
});

test('invalid action settings produce visible errors rather than executing defaults',async()=>{
  const c=context();
  await assert.rejects(performAction({action:{type:'process'}},'x',c),/argv/);
  await assert.rejects(performAction({action:{type:'open-url'}},'javascript:alert(1)',c),/HTTP/);
  await assert.rejects(performAction({action:{type:'missing'}},'x',c),/Unknown action/);
  assert.equal(c.events.length,0);
});
