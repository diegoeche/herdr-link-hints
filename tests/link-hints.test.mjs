import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../mods/link-hints/', import.meta.url));
const context = vm.createContext({ console, window:{viewport_size:()=>({width:1920,height:1080})} });
const events = { opened: [], copied: [], closed: [], reads: [], notices: [], runs: [], inputs: [] };
let configuration=null;
let inputResult={code:0,stdout:JSON.stringify({typed:true,submitted:false})};
const observers = [];
let snapshotResult = {code:0, stdout:JSON.stringify({ansi:'\x1b]8;;https://example.com/\x07Named link\x1b]8;;\x07'})};
let focus = { terminal: 't1', shown: 'remote/t9', agent: 't2' };
let screen = { code: 0, stdout: JSON.stringify({ text: 'https://example.com/ https://example.org/?token=a%26b#x' }) };
const rendered=[];
const model={spaces:[],panes:[],layout:{},settings:{zoom:1,font_size:14}};
const element = () => {
  const node={};rendered.push(node);
  const proxy=new Proxy({}, {get: (_, key) => key === 'when'
    ? (condition, fn) => condition ? fn(proxy) : proxy
    : (...args) => {node[key]??=[];node[key].push(args);return proxy;}});
  return proxy;
};
const cx = {focus_handle: () => ({focus() {}}), stop_propagation() {}, notify() {},
  spawn(fn) { this.task = fn(this); },
  open_url(url) { events.opened.push(url); },
  write_to_clipboard(url) { events.copied.push(url); }};
const stubs = {
  'url': { URL },
  'gpui-kit': { View: class {}, div: element },
  'gpui-base': { v_flex: element, h_flex: element },
  'herdr': { focused: () => focus,
    spaces:()=>model.spaces,panes:()=>model.panes,layout:()=>model.layout,settings:()=>model.settings,
    readTextFile:async path=>path.endsWith('/selectors.json')?configuration:null,
    nextCommand:()=>new Promise(()=>{}),
    hc: async args => {events.reads.push(args); return screen;},
    run:(...args)=>events.runs.push(args),home:()=>'/test',
    exec: async (command, args) => {
      if(args[0].endsWith('/terminal_input.py')) {events.inputs.push(args);return inputResult;}
      observers.push([command,args]); return snapshotResult;
    },
    appHome: () => '/test/app',
    props: () => ({overlay: 'test-overlay'}), closeOverlay: id => events.closed.push(id),
    theme: () => ({}), notify: value => events.notices.push(value) }
};
const modules = new Map();
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  const stub = stubs[name];
  const module = stub ? new vm.SyntheticModule(Object.keys(stub), function () {
    for (const [key, value] of Object.entries(stub)) this.setExport(key, value);
  }, {context, identifier: name})
    : new vm.SourceTextModule(await fs.readFile(`${root}/${name}`, 'utf8'), {context, identifier: name});
  modules.set(name, module);
  await module.link(spec => load(spec.startsWith('./') ? spec.slice(2) : spec));
  return module;
}
const main = await load('main.js');
await main.evaluate();
const {extractLinks, labelLinks, positionLinks, ALPHABET} = modules.get('links.js').namespace;
const {normalizeConfig,terminalBounds,gridGeometry}=modules.get('geometry.js').namespace;
const plain = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(plain(extractLinks('See [docs](https://example.com/a_(b)). www.test.com and https://example.com/a_(b)')),
  ['https://example.com/a_(b)', 'https://www.test.com']);
assert.deepEqual(plain(extractLinks('https://example.com https://example.com/ javascript:alert(1) file:///tmp/x https://')),
  ['https://example.com']);
assert.deepEqual(plain(extractLinks('\x1b[31mhttps://x.test/?t=a%26b#fragment\x1b[0m')),
  ['https://x.test/?t=a%26b#fragment']);
assert.deepEqual(plain(extractLinks('https://example.com/path\nnext-line-is-not-part-of-the-link')),
  ['https://example.com/path']);
assert.deepEqual(plain(extractLinks('no links here')), []);
const named = '\x1b]8;id=first;https://example.net/source\x1b\\Source\x1b]8;;\x1b\\'
  + ' and \x1b]8;;https://example.org/mirror?item=1;next=2!\x07Mirror\x1b]8;;\x07';
assert.deepEqual(plain(extractLinks('Source and Mirror', named)),
  ['https://example.net/source','https://example.org/mirror?item=1;next=2!']);
assert.deepEqual(plain(extractLinks('https://example.net/source', named)),
  ['https://example.net/source','https://example.org/mirror?item=1;next=2!']);
assert.deepEqual(plain(extractLinks('', '\x1b]8;;javascript:alert(1)\x07bad\x1b]8;;\x07')), []);
const positioned=positionLinks(labelLinks(['https://example.com/','https://example.org/path!']),[
  {url:'https://example.com',row:2,col:4,explicit:false},
  {url:'https://example.com/.',row:7,col:1,explicit:false},
  {url:'https://example.org/path!',row:8,col:3,explicit:true},
  {url:'https://example.com',row:-1,col:0,explicit:false},
]);
assert.deepEqual(plain(positioned[0].positions.map(p=>[p.row,p.col])),[[2,4],[7,1]]);
assert.equal(positioned[1].positions[0].url,'https://example.org/path!');
assert.deepEqual(plain(positionLinks(labelLinks(['https://example.net/']))[0].positions),[]);
for (const count of [0, 1, 14, 15, 196, 197, 1000]) {
  const labels = plain(labelLinks(Array.from({length: count}, (_, i) => `https://x.test/${i}`)));
  assert.equal(new Set(labels.map(x => x.hint)).size, count);
  assert.ok(new Set(labels.map(x => x.hint.length)).size <= 1);
  assert.ok(labels.every(x => [...x.hint].every(c => ALPHABET.includes(c))));
}
const View = main.namespace.default;
const key = async (view, name, modifiers = {}, char) => {
  const previous=cx.task;
  view.key({key:name, keystroke:name,
    modifiers:{control:false,alt:false,platform:false,function:false,shift:false,...modifiers}, key_char:char},cx);
  if(cx.task!==previous) await cx.task;
};
const view = new View();
view.init({}, cx);
focus = {terminal:'different-terminal'};
await cx.task;
assert.deepEqual(plain(events.reads), [['read','--json','--lines','0','remote/t9']]);
assert.deepEqual(plain(observers), [['python3',['/test/app/mods/link-hints/snapshot.py','remote/t9']]]);
view.render();
assert.equal(events.opened.length, 0);
await key(view, 's', {control:true});
assert.equal(events.opened.length, 0);
await key(view, 'a', {}, 'a');
assert.deepEqual(events.opened, ['https://example.org/?token=a%26b#x']);
assert.deepEqual(events.closed, ['test-overlay']);
await key(view, 'backspace');
await key(view, 'S', {shift:true}, 'S');
assert.deepEqual(events.copied, ['https://example.com/']);
assert.equal(events.opened.length, 1);
view.prefix = ''; view.at = 0;
await key(view, 'down');
await key(view, 'enter', {shift:true});
assert.equal(events.copied.at(-1), 'https://example.org/?token=a%26b#x');
view.links = labelLinks(Array.from({length:15}, (_,i) => `https://x.test/${i}`));
view.prefix='';view.at=0;
await key(view, 's', {}, 's');
assert.equal(events.opened.length, 1, 'partial hint must not open a link');
await key(view, 'a', {}, 'a');
assert.equal(events.opened.at(-1), 'https://x.test/1');
view.render();
const closedBefore = events.closed.length;
await key(view, 'escape');
assert.equal(events.closed.length, closedBefore+1);
screen = {code:1,stdout:''};
const errorView = new View();errorView.init({},cx);await cx.task;
assert.match(errorView.error, /Could not read/);errorView.render();
screen = {code:0,stdout:'not-json'};
const badJson = new View();badJson.init({},cx);await cx.task;
assert.ok(badJson.error);badJson.render();
screen={code:0,stdout:JSON.stringify({text:'https://example.com/'})};
snapshotResult={code:1,stdout:''};
const fallback = new View();fallback.init({},cx);await cx.task;
assert.equal(fallback.links.length,1);
assert.match(fallback.notice,/Named links unavailable/);fallback.render();
focus = {terminal:null,shown:null,agent:null};
const readsBefore = events.reads.length;
const empty = new View();empty.init({},cx);empty.render();
assert.equal(events.reads.length, readsBefore);
assert.match(empty.error,/Focus a terminal/);
const toggled=new View();toggled.init({},cx);
assert.equal(toggled.mode,'inline');toggled.command('toggle-mode',cx);assert.equal(toggled.mode,'window');
toggled.command('toggle-mode',cx);assert.equal(toggled.mode,'inline');
await key(toggled,'f2');assert.equal(toggled.mode,'window','F2 switches modes from the focused overlay');
toggled.loading=true;
await key(toggled,'f2');assert.equal(toggled.mode,'inline','F2 works while the snapshot is loading');
assert.equal(normalizeConfig(null).mode,'window');
assert.equal(normalizeConfig({mode:'inline'}).mode,'inline');
assert.equal(normalizeConfig({window:{max_rows:500}}).window.max_rows,6);
const rootLayout={type:'row',divider:{width:1},children:[{id:'sidebar',type:'block',size:{px:268}},
  {type:'column',children:[{type:'block',size:{px:42}},{type:'row',padding:8,gap:8,children:[
    {type:'block',content:{tab:'active',pane:{lone:true,border:{width:1},focus:{width:1}}}},
    {type:'block',hidden:true,size:{px:368}}]},{type:'block',size:{px:28}}]}]};
const viewport={width:1920,height:1080};
const rect=terminalBounds(rootLayout,viewport,1.2);
assert.ok(Math.abs(rect.x-333.6)<0.001 && Math.abs(rect.y-61.2)<0.001);
const input={root:rootLayout,viewport,zoom:1.2,padding:[10,10],cols:153,rows:36,cellWidth:10.08};
const geometry=gridGeometry(input);
assert.equal(geometry.x,346);assert.equal(geometry.y,80);assert.equal(geometry.cellHeight,26);
assert.equal(gridGeometry({...input,singlePane:false}),null);
assert.equal(gridGeometry({...input,cols:80}),null);
assert.equal(gridGeometry({...input,cellWidth:undefined}),null);
const resizedLayout=plain(rootLayout);resizedLayout.children[0].size.px=427;
const roundedProbe={...input,root:resizedLayout,zoom:Math.fround(1.2),cols:135,
  cellWidth:1291/128,cellWidthError:1/128};
const roundedGeometry=gridGeometry(roundedProbe);
assert.ok(roundedGeometry,'rounded native font measurement must retain inline hints after resizing the sidebar');
assert.equal(roundedGeometry.x,536);
assert.equal(roundedGeometry.cellHeight,26);
assert.equal(gridGeometry({...roundedProbe,cellWidthError:0}),null,'fixture reproduces the previous exact-width rejection');
assert.equal(gridGeometry({...roundedProbe,cols:136}),null,'rounding tolerance must still reject a different terminal width');
assert.equal(gridGeometry({...input,inline:{device_scale:4}}),null,'ambiguous cell height must fall back');
assert.equal(gridGeometry({...input,inline:{device_scale:4,cell_height:26}}).cellHeight,26);
const panelLayout=plain(rootLayout);panelLayout.children[1].children[1].children[1].hidden=false;
assert.equal(gridGeometry({...input,root:panelLayout}),null,'old terminal dimensions must not label a resized view');
assert.ok(gridGeometry({...input,root:panelLayout,cols:109}));
model.layout=rootLayout;
model.spaces=[{active:true,tabs:[{id:'tab',active:true}]}];
model.panes=[{id:'pane',tab:'tab'}];
model.settings={zoom:1.2,font_size:14,terminal_padding:[10,10]};
const inlineView=new View();inlineView.init({},cx);
Object.assign(inlineView,{target:{pane:'pane',tab:'tab'},mode:'inline',error:'',loading:true,
  configReady:false,config:normalizeConfig({mode:'inline'}),
  links:positionLinks(labelLinks(['https://example.com/']),[{url:'https://example.com/',row:0,col:0,explicit:true}]),
  snapshot:{positioned:true,cols:153,rows:36}});
const draw=()=>{rendered.length=0;inlineView.render();return rendered;};
const panelVisible=()=>rendered.some(node=>node.id?.[0][0]==='link-hints-panel');
draw();assert.equal(panelVisible(),false,'config loading must not flash the window');
inlineView.configReady=true;
draw();assert.equal(panelVisible(),false,'inline snapshot loading must stay transparent');
inlineView.loading=false;
draw();assert.equal(panelVisible(),false,'waiting for font measurement must stay transparent');
inlineView.cellWidth=10.08;
draw();assert.equal(panelVisible(),false,'ready inline mode must contain only badges');
const badge=rendered.find(node=>node.id?.[0][0]==='hint-s-0-0');
assert.ok(badge,'ready inline mode renders a badge');
assert.ok(Math.abs(badge.left[0][0]+badge.w[0][0]+3-geometry.x/1.2)<0.001,
  'badge ends three logical pixels before the URL');
assert.equal(rendered.some(node=>node.child?.some(args=>typeof args[0]==='string' && args[0].includes('Inline hints'))),false,
  'inline mode has no bottom-right footer');
inlineView.command('toggle-mode',cx);draw();assert.equal(panelVisible(),true,'explicit window mode keeps the card');
inlineView.command('toggle-mode',cx);inlineView.snapshot.positioned=false;
draw();assert.equal(panelVisible(),true,'unsafe alignment still falls back to the card');
inlineView.snapshot.positioned=true;inlineView.error='Could not type the command';
draw();assert.equal(panelVisible(),true,'an action error must be visible even when inline geometry is valid');
focus={terminal:'t9',space:'source-space',cwd:'/source',tab:'source-tab'};
screen={code:0,stdout:JSON.stringify({text:'!pwd\n/test/image.png'})};
snapshotResult={code:0,stdout:JSON.stringify({ansi:'!pwd',cwd:'/foreground'})};
const execution=new View();execution.init({selector:'execute'},cx);await cx.task;
assert.equal(execution.selectorId,'execute');
assert.equal(events.runs.length,0,'opening a command selector must never execute a match');
await key(execution,'s',{},'s');
assert.equal(events.runs.length,0,'the default command action must stay in the source terminal');
assert.deepEqual(plain(events.inputs[0]),['/test/app/mods/link-hints/terminal_input.py','t9','!pwd']);
await key(execution,'f3');
assert.equal(execution.selectorId,'images');
assert.equal(execution.links[0].value,'/test/image.png');
inputResult={code:1,stdout:JSON.stringify({error:'source finished'})};
screen={code:0,stdout:JSON.stringify({text:'!pwd\n!whoami'})};
const failedInput=new View();failedInput.init({selector:'execute'},cx);await cx.task;
const closedBeforeFailure=events.closed.length;
await key(failedInput,'a',{},'a');
assert.match(failedInput.error,/source finished/);
assert.equal(events.closed.length,closedBeforeFailure,'a failed transfer keeps the selector open');
assert.equal(failedInput.at,1,'retry keeps the originally chosen command selected');
assert.equal(failedInput.prefix,'');
inputResult={code:0,stdout:JSON.stringify({typed:true,submitted:false})};
configuration='{invalid-json';
const configError=new View();configError.init({},cx);await cx.task;
assert.match(configError.error,/configuration/);
assert.equal(configError.configReady,true,'configuration errors must not leave an invisible loading overlay');
rendered.length=0;configError.render();assert.equal(panelVisible(),true);
configuration=null;
console.log('PASS: visible and OSC 8 links, occurrences, 1–1000 prefix-free hints, focus capture, read-only snapshots, open/copy keys, navigation, modes, configuration, layout geometry, and fallbacks.');
