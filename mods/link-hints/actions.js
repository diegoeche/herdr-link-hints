import { actions as plugins } from "./plugins.js";
import { URL } from "url";

export function substitute(template,value) {
  if(typeof template!=="string") throw new Error("Action arguments must be strings.");
  return template.replaceAll("{value}",value).replaceAll("{encoded}",encodeURIComponent(value));
}

export function commandArgv(value) {
  // Selected text travels as one argument, never interpolated into this script.
  // Keep output and the exit status visible in an interactive shell afterward.
  return ["bash","-ic",'eval -- "$1"; result=$?; printf "\\n[exit %s]\\n" "$result"; exec bash -i',"selector-command",value];
}

export function commandText(value, prefix="!") {
  if(typeof prefix!=="string" || typeof value!=="string") throw new Error("Command text and prefix must be strings.");
  const text=prefix+value;
  if(/[\x00-\x1f\x7f]/.test(text)) throw new Error("Only a single command line can be typed into the source terminal.");
  return text;
}

function inputError(result) {
  for(const output of [result.stderr,result.stdout]) {
    try {
      const parsed=JSON.parse(output);
      if(parsed.error?.message) return parsed.error.message;
      if(typeof parsed.error==="string") return parsed.error;
    } catch (_) {}
  }
  return result.stderr?.trim()||"The source terminal could not accept the command.";
}

function sourceFolder(context) {
  if(!context.target?.cwd) throw new Error("The source terminal's directory is unavailable.");
  return context.target.cwd;
}

export function filePath(value,context) {
  if(value.startsWith("file://")) {
    const url=new URL(value);
    if(url.host && url.host!=="localhost") throw new Error("Remote file URLs need a custom viewer action.");
    return decodeURIComponent(url.pathname);
  }
  if(value.startsWith("~/")) return context.home()+value.slice(1);
  return value.startsWith("/")?value:sourceFolder(context)+"/"+value;
}

export const actions = {
  "open-url":(value,options,c)=>{
    const url=substitute(options.template??"{value}",value);
    if(!/^https?:\/\//i.test(url)) throw new Error("The open-url action requires an HTTP(S) URL.");
    c.cx.open_url(url);
  },
  "run-command":(value,_options,c)=>{
    c.run("tab.new",{space:c.target.space,folder:sourceFolder(c),name:value.slice(0,48),argv:commandArgv(value)});
  },
  "type-command":async(value,options,c)=>{
    const terminal=c.target?.terminal;
    if(typeof terminal!=="string" || !terminal) throw new Error("The source terminal is unavailable. Reopen the selector from that terminal.");
    const text=commandText(value,options.prefix??"!");
    const result=await c.exec("python3",[c.appHome()+"/mods/link-hints/terminal_input.py",terminal,text]);
    if(result.code!==0) throw new Error("Could not type the command: "+inputError(result));
    let reply;
    try {reply=JSON.parse(result.stdout);} catch (_) {}
    if(reply?.typed!==true || reply?.submitted!==false) throw new Error("Could not confirm input. Check the source prompt before retrying.");
  },
  "open-file":async(value,options,c)=>{
    if(c.machine) throw new Error("Viewing files on another machine needs a custom viewer action.");
    const path=filePath(value,c);
    const argv=options.argv??["xdg-open","{value}"];
    await processAction(path,{...options,argv},c);
  },
  process:processAction,
  ...plugins,
};

async function processAction(value,options,c) {
  if(!Array.isArray(options.argv)||!options.argv.length) throw new Error("A process action needs an argv array.");
  const argv=options.argv.map(arg=>substitute(arg,value));
  if(options.terminal) {
    c.run("tab.new",{space:c.target.space,folder:sourceFolder(c),argv});
  } else {
    const result=await c.exec(argv[0],argv.slice(1),{cwd:sourceFolder(c),on:c.machine});
    if(result.code!==0) throw new Error(result.stderr?.trim()||`Viewer exited with status ${result.code}.`);
  }
}

export async function performAction(selector,value,context) {
  const action=actions[selector.action.type];
  if(!action) throw new Error(`Unknown action: ${selector.action.type}`);
  await action(value,selector.action,context);
}
