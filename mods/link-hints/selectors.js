import { extractLinks, labelLinks, positionLinks } from "./links.js";
import { URL } from "url";
import { normalizeConfig } from "./geometry.js";
import { matchers as plugins } from "./plugins.js";

export const DEFAULT_SELECTORS = {
  links: {title:"Links", shortcut:"ctrl-shift-o", match:{type:"url"}, action:{type:"open-url"}},
  execute: {title:"Commands", shortcut:"ctrl-shift-x", match:{type:"prefix", prefix:"!"}, action:{type:"type-command",prefix:"!"}},
  images: {title:"Images", shortcut:"ctrl-shift-i", match:{type:"image-path"}, action:{type:"open-file"}},
};

export function selectorConfig(value={}) {
  value=value && typeof value==="object" && !Array.isArray(value)?value:{};
  const selectors={};
  for (const [id, entry] of Object.entries({...DEFAULT_SELECTORS,...value.selectors})) {
    if (!/^[a-z][a-z0-9-]*$/.test(id) || entry===false || entry?.enabled===false) continue;
    if (!entry || typeof entry!=="object") throw new Error(`Invalid selector: ${id}`);
    const base=DEFAULT_SELECTORS[id]??{};
    const match={...base.match,...entry.match}, action={...base.action,...entry.action};
    if (typeof match.type!=="string" || typeof action.type!=="string") throw new Error(`Selector ${id} needs a matcher and action.`);
    selectors[id]={...base,...entry,match,action,title:entry.title??base.title??id};
  }
  return {...normalizeConfig({...value,mode:value.mode??"inline"}),selectors,
    default_selector:typeof value.default_selector==="string"?value.default_selector:"links"};
}

export function prefixMatches(text, {prefix="!"}={}) {
  if (typeof prefix!=="string" || !prefix) throw new Error("A prefix matcher needs a nonempty prefix.");
  const found=[];
  for (const line of text.split("\n")) {
    const clean=line.replace(/^[ \t]*(?:[>›❯][ \t]+)?/, "");
    if (!clean.startsWith(prefix)) continue;
    const value=clean.slice(prefix.length).trim();
    if (!value || value.startsWith(prefix) || value.startsWith("=")) continue;
    found.push({value,match:clean.trimEnd()});
  }
  return found;
}

export function imageMatches(text) {
  const result=[];
  const extensions="(?:png|jpe?g|gif|webp|avif|bmp|tiff?|svg|ico)";
  const pattern=new RegExp('"([^"\\n]+\\.'+extensions+')"|\'([^\'\\n]+\\.'+extensions+')\'|`([^`\\n]+\\.'+extensions+')`|([^\\s<>"\'`|]+\\.'+extensions+')(?=$|[\\s),;:])','gi');
  for (const m of text.matchAll(pattern)) {
    const value=m[1]??m[2]??m[3]??m[4];
    if (/^[a-z]+:\/\//i.test(value) && !value.startsWith("file://")) continue;
    result.push({value,match:value});
  }
  return result;
}

export function regexMatches(text,{pattern,flags="",capture=1}={}) {
  if (typeof pattern!=="string" || !pattern || pattern.length>4096) throw new Error("A regex matcher needs a pattern (up to 4096 characters).");
  if (!Number.isInteger(capture) || capture<0) throw new Error("Regex capture must be a nonnegative integer.");
  const regex=new RegExp(pattern,flags.replace(/[gy]/g,"")+"g");
  const result=[];
  for (const m of text.matchAll(regex)) {
    const value=m[capture];
    if (typeof value==="string" && value.trim()) result.push({value,match:m[0],label:value});
  }
  return result;
}

export const matchers = {url:text=>extractLinks(text).map(value=>({value,match:value})),
  prefix:prefixMatches,"image-path":imageMatches,regex:regexMatches,...plugins};

// The read API joins soft wraps and preserves actual line breaks. The repaint
// supplies physical cells. Match complete values from the former against the
// latter, so wrapped URLs/commands retain both their full value and their badge.
export function gridPositions(needle, lines=[]) {
  if (!needle || !lines.length) return [];
  const text=lines.map(line=>line.text).join("");
  const offsets=[];let offset=0;
  for (const line of lines) {offsets.push(offset);offset+=line.text.length;}
  const found=[];
  for (let from=0;;) {
    const index=text.indexOf(needle,from);
    if(index<0) break;
    let row=offsets.length-1;
    while(row>0 && offsets[row]>index) row--;
    const col=lines[row].columns[index-offsets[row]];
    if (Number.isInteger(col)) found.push({row,col});
    from=index+Math.max(1,needle.length);
  }
  return found;
}

export function candidates(selector,text,snapshot={}) {
  const matcher=matchers[selector.match.type];
  if (!matcher) throw new Error(`Unknown matcher: ${selector.match.type}`);
  let matches=matcher(text,selector.match);
  if (selector.match.type==="url") {
    matches=extractLinks(text,snapshot.ansi??"").map(value=>({value,match:value}));
  }
  if (!Array.isArray(matches)) throw new Error("A matcher must return a list of candidates.");
  const unique=new Map();
  for (const item of matches) {
    if (typeof item.value!=="string" || !item.value.trim()) continue;
    const key=selector.match.type==="url"?canonical(item.value):item.value;
    if (!unique.has(key)) unique.set(key,{...item,positions:[]});
    const saved=unique.get(key);
    saved.positions.push(...gridPositions(item.match??item.value,snapshot.lines));
    if(selector.match.type==="url" && item.value.startsWith("https://www.")) {
      saved.positions.push(...gridPositions(item.value.slice(8),snapshot.lines));
    }
  }
  const items=[...unique.values()];
  return labelLinks(items.map(item=>item.value)).map((label,i)=>{
    const item=items[i];
    const legacy=selector.match.type==="url"?positionLinks([label],snapshot.placements)[0].positions:[];
    const points=[...item.positions,...legacy];
    const positions=points.filter((p,i)=>!points.slice(0,i).some(other=>p.row===other.row&&p.col===other.col));
    return {...label,...item,positions};
  });
}

function canonical(value) {
  try { return new URL(value).href; } catch (_) { return value; }
}

export function pageRows(rows, at, maximum, viewportHeight) {
  // Reserve room for the heading, controls, and a fallback/error notice.
  const count=Math.max(1,Math.min(maximum,Math.floor((viewportHeight-128)/28)));
  const index=Math.min(at,Math.max(0,rows.length-1));
  const start=Math.max(0,Math.min(index-Math.floor(count/2),rows.length-count));
  return {index,start,count,visible:rows.slice(start,start+count)};
}
