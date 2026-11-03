import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../mods/link-hints/', import.meta.url));
const context = vm.createContext({ console });
const events = { opened: [], copied: [], closed: [], reads: [], notices: [] };
const observers = [];
let snapshotResult = {code:0, stdout:JSON.stringify({ansi:'\x1b]8;;https://example.com/\x07Named link\x1b]8;;\x07'})};
let focus = { terminal: 't1', shown: 'remote/t9', agent: 't2' };
let screen = { code: 0, stdout: JSON.stringify({ text: 'https://example.com/ https://example.org/?token=a%26b#x' }) };
const element = () => new Proxy({}, {get: (_, key) => key === 'when'
  ? (condition, fn) => condition ? fn(element()) : element()
  : () => element() });
const cx = {focus_handle: () => ({focus() {}}), stop_propagation() {}, notify() {},
  spawn(fn) { this.task = fn(this); },
  open_url(url) { events.opened.push(url); },
  write_to_clipboard(url) { events.copied.push(url); }};
const stubs = {
  'url': { URL },
  'gpui-kit': { View: class {}, div: element },
  'gpui-base': { v_flex: element, h_flex: element },
  'herdr': { focused: () => focus,
    hc: async args => {events.reads.push(args); return screen;},
    exec: async (command, args) => {observers.push([command,args]); return snapshotResult;},
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
const {extractLinks, labelLinks, ALPHABET} = modules.get('links.js').namespace;
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
for (const count of [0, 1, 14, 15, 196, 197, 1000]) {
  const labels = plain(labelLinks(Array.from({length: count}, (_, i) => `https://x.test/${i}`)));
  assert.equal(new Set(labels.map(x => x.hint)).size, count);
  assert.ok(new Set(labels.map(x => x.hint.length)).size <= 1);
  assert.ok(labels.every(x => [...x.hint].every(c => ALPHABET.includes(c))));
}
const View = main.namespace.default;
const key = (view, name, modifiers = {}, char) => view.key({key:name, keystroke:name,
  modifiers:{control:false,alt:false,platform:false,function:false,shift:false,...modifiers}, key_char:char},cx);
const view = new View();
view.init({}, cx);
focus = {terminal:'different-terminal'};
await cx.task;
assert.deepEqual(plain(events.reads), [['read','--json','--lines','0','remote/t9']]);
assert.deepEqual(plain(observers), [['python3',['/test/app/mods/link-hints/snapshot.py','remote/t9']]]);
view.render();
assert.equal(events.opened.length, 0);
key(view, 's', {control:true});
assert.equal(events.opened.length, 0);
key(view, 'a', {}, 'a');
assert.deepEqual(events.opened, ['https://example.org/?token=a%26b#x']);
assert.deepEqual(events.closed, ['test-overlay']);
key(view, 'backspace');
key(view, 'S', {shift:true}, 'S');
assert.deepEqual(events.copied, ['https://example.com/']);
assert.equal(events.opened.length, 1);
view.prefix = ''; view.at = 0;
key(view, 'down');
key(view, 'enter', {shift:true});
assert.equal(events.copied.at(-1), 'https://example.org/?token=a%26b#x');
view.links = labelLinks(Array.from({length:15}, (_,i) => `https://x.test/${i}`));
view.prefix='';view.at=0;
key(view, 's', {}, 's');
assert.equal(events.opened.length, 1, 'partial hint must not open a link');
key(view, 'a', {}, 'a');
assert.equal(events.opened.at(-1), 'https://x.test/1');
view.render();
const closedBefore = events.closed.length;
key(view, 'escape');
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
console.log('PASS: visible and OSC 8 links, deduplication, 1–1000 prefix-free hints, focus capture, read-only snapshots, no eager opens, open/copy keys, navigation, cancel, and fallback states.');
