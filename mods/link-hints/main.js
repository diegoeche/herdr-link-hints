import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { focused, spaces, panes, layout, settings, hc, exec, run, home, appHome, readTextFile, nextCommand, props, closeOverlay, theme, notify } from "herdr";
import { ALPHABET } from "./links.js";
import { gridGeometry } from "./geometry.js";
import { candidates, selectorConfig, pageRows } from "./selectors.js";
import { performAction } from "./actions.js";

const FONT_PROBE_LENGTH = 128;

export default class LinkHints extends View {
  init(_props, cx) {
    // Capture the actual terminal (including a peek or replacement) before
    // giving the overlay keyboard focus. Never fall back to another pane.
    const current = focused();
    this.target = current;
    this.requestedSelector = _props?.selector;
    this.selectorId = this.requestedSelector ?? "links";
    this.terminal = current?.shown ?? current?.terminal ?? current?.agent;
    this.links = [];
    this.prefix = "";
    this.at = 0;
    this.loading = Boolean(this.terminal);
    this.error = this.terminal ? "" : "Focus a terminal, then open a selector.";
    this.notice = "";
    this.config = selectorConfig();
    this.selector = this.config.selectors[this.selectorId];
    this.configReady = !this.terminal;
    this.mode = this.config.mode;
    this.snapshot = {};
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async(cx)=>{
      for (;;) this.command(await nextCommand(),cx);
    });
    if (!this.terminal) return;
    const terminal = this.terminal;
    cx.spawn(async (cx) => {
      try {
        try {
          const config = await readTextFile(appHome() + "/selectors.json")
            ?? await readTextFile(appHome() + "/link-hints.json");
          this.config = selectorConfig(config ? JSON.parse(config) : {});
          if (!this.manualMode) this.mode = this.config.mode;
        } catch (error) { throw new Error("Could not read selector configuration: " + error.message); }
        this.selectorId = this.requestedSelector ?? this.config.default_selector;
        this.selector = this.config.selectors[this.selectorId];
        if (!this.selector) throw new Error(`Selector ${this.selectorId} is disabled or missing.`);
        this.configReady = true;
        cx.notify();
        // One screen-only read per opening. History reads can send scroll
        // input to a full-screen program, so deliberately never request them.
        const [read, observe] = await Promise.allSettled([
          hc(["read", "--json", "--lines", "0", terminal]),
          exec("python3", [appHome() + "/mods/link-hints/snapshot.py", terminal]),
        ]);
        if (read.status !== "fulfilled") throw new Error("Could not read this terminal. Close and try again.");
        const result = read.value;
        if (result.code !== 0) throw new Error("Could not read this terminal. Close and try again.");
        const screen = JSON.parse(result.stdout);
        if (typeof screen.text !== "string") throw new Error("Herdr returned an unreadable terminal screen.");
        let ansi = "";
        if (observe.status === "fulfilled" && observe.value.code === 0) {
          try { this.snapshot = JSON.parse(observe.value.stdout); ansi = this.snapshot.ansi ?? ""; } catch (_) {}
        }
        if (!ansi) this.notice = "Named links unavailable · check Python 3 and hc";
        this.screenText=screen.text;
        this.links = candidates(this.selector,screen.text,this.snapshot);
      } catch (error) {
        this.error = error?.message ?? "Could not read this terminal.";
      }
      this.configReady = true;
      this.loading = false;
      cx.notify();
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  rows() {
    return this.links.filter(link => link.hint.startsWith(this.prefix));
  }

  activate(link, copy, cx) {
    if (!link || this.activating) return;
    const value=link.value??link.url;
    if (copy) {
      try {
        cx.write_to_clipboard(value);
        notify({title:"Copied",body:"Selection copied to the clipboard."});
        this.dismiss();
      } catch(error) {this.error=error.message;cx.notify();}
      return;
    }
    this.activating=true;
    cx.spawn(async(cx)=>{
      try {
        const space=spaces().find(s=>s.id===this.target?.space);
        const machine=this.terminal?.includes("/")?this.terminal.split("/")[0]:space?.machine;
        await performAction(this.selector,value,{cx,exec,run,home,appHome,machine,
          target:{...this.target,terminal:this.terminal,cwd:this.snapshot.cwd??this.target?.cwd}});
        this.dismiss();
      } catch(error) {
        this.error=error?.message??"Could not perform this action.";
        this.prefix="";
        this.at=Math.max(0,this.links.indexOf(link));
        cx.notify();
      }
      finally {this.activating=false;}
    });
  }

  key(event, cx) {
    // Every key stays here while the hints are open; no text reaches an agent.
    cx.stop_propagation();
    const chord = event.keystroke.toLowerCase();
    if (event.key === "escape" || chord === "ctrl-c" || chord === this.selector?.shortcut) return this.dismiss();
    const requested=Object.entries(this.config.selectors).find(([,entry])=>entry.shortcut===chord);
    if(requested) return this.selectSelector(requested[0],cx);
    if (event.is_held) return;
    if (event.key === "f2") return this.toggleMode(cx);
    if (event.key === "f3") return this.nextSelector(cx);
    if (this.loading) return;
    const m = event.modifiers;
    if (m.control || m.alt || m.platform || m.function) return;
    if (event.key === "backspace") {
      this.prefix = this.prefix.slice(0, -1);
      this.at = 0;
    } else if (["up", "down", "tab", "pageup", "pagedown", "home", "end"].includes(event.key)) {
      const length = this.rows().length;
      if (!length) return;
      const step = event.key === "up" || (event.key === "tab" && m.shift) ? -1
        : event.key === "pageup" ? -8 : event.key === "pagedown" ? 8 : 1;
      this.at = event.key === "home" ? 0 : event.key === "end" ? length - 1
        : (this.at + step + length * 8) % length;
    } else if (event.key === "enter" || event.key === "return") {
      return this.activate(this.rows()[this.at], m.shift, cx);
    } else {
      const character = event.key_char ?? (event.key.length === 1 ? event.key : "");
      const lower = character.toLowerCase();
      if (!lower || !ALPHABET.includes(lower)) return;
      const next = this.prefix + lower;
      if (!this.links.some(link => link.hint.startsWith(next))) return;
      this.prefix = next;
      this.at = 0;
      const match = this.links.find(link => link.hint === next);
      if (match) return this.activate(match, m.shift || character !== lower, cx);
    }
    cx.notify();
  }

  toggleMode(cx) {
    this.manualMode = true;
    this.mode = this.mode === "inline" ? "window" : "inline";
    cx.notify();
  }

  command(command,cx) {
    if (command === "toggle-mode") this.toggleMode(cx);
    if (command === "next-selector") this.nextSelector(cx);
  }

  nextSelector(cx) {
    if(this.loading) return;
    const ids=Object.keys(this.config.selectors);
    if(!ids.length) return;
    this.selectSelector(ids[(ids.indexOf(this.selectorId)+1)%ids.length],cx);
  }

  selectSelector(id,cx) {
    if(this.loading || !this.config.selectors[id]) return;
    this.selectorId=id;
    this.selector=this.config.selectors[this.selectorId];
    this.prefix="";this.at=0;this.error="";
    try {this.links=candidates(this.selector,this.screenText??"",this.snapshot);}
    catch(error) {this.links=[];this.error=error.message;}
    cx.notify();
  }

  panel(t, fallback) {
    const rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    // Keep the keyboard selection on screen, even with hundreds of links.
    const height=window.viewport_size().height/(Number(settings().zoom)||1);
    const {count,start,visible}=pageRows(rows,this.at,this.config.window.max_rows,height);
    const message = this.loading ? "Reading selections…" : this.error
      || (!this.links.length ? "No matches found on the current terminal screen." : "");
    return v_flex().id("link-hints-panel")
      .w(this.config.window.width).max_w("95%").max_h(Math.max(28,height-16))
      .overflow_y_scrollbar().h_auto().p(10).gap(6).rounded(8)
      .border(1).border_color(t.border).bg(t.popover).text_color(t.foreground).text_size(12)
      .on_mouse_down("left", (_e,cx)=>cx.stop_propagation())
      .child(h_flex().items_center().gap(8)
        .child(div().font_semibold().child(this.selector?.title??"Selectors"))
        .when(Boolean(this.prefix), el => el.child(div().px(5).rounded(3).bg(t.input)
          .text_color(t.accent).font_family("JetBrains Mono").child(this.prefix.toUpperCase())))
        .child(div().flex_1())
        .child(div().text_size(10.5).text_color(t.muted).child(this.loading ? "" :
          rows.length > count ? `${this.at + 1} / ${rows.length} · ↑↓` : `${this.links.length}`)))
      .child(v_flex().min_h(0).gap(2)
        .when(Boolean(message), el => el.child(div().py(8).text_color(t.muted).child(message)))
        .children(visible.map((link, i) => h_flex().id(`link-${link.hint}`)
          .h(28).flex_none().px(6).gap(8).items_center().rounded(4)
          .bg(start + i === this.at ? t.selected : t.popover)
          .cursor_pointer().hover(s => s.bg(t.hover))
          .on_click((event, cx) => { cx.stop_propagation(); this.activate(link, event.modifiers.shift, cx); })
          .child(div().w(28).flex_none().font_family("JetBrains Mono").font_semibold()
            .text_color(t.accent).child(link.hint.toUpperCase()))
          .child(div().flex_1().min_w(0).truncate().tooltip(link.value??link.url).child(link.label??link.value??link.url)))))
      .child(div().border_t(1).border_color(t.border).pt(6).text_size(10.5).text_color(t.muted)
        .child(`Hint / Enter selects · Shift copies · F2 ${this.mode === "inline" ? "window" : "inline"} · F3 action · Esc closes`))
      .when(Boolean(fallback), el=>el.child(div().text_size(10.5).text_color(t.muted).child(fallback)))
      .when(Boolean(this.notice) && this.selector?.match.type==="url", el => el.child(div().text_size(10.5).text_color(t.muted).child(this.notice)));
  }

  render() {
    const t=theme(),look=settings(),zoom=Number(look.zoom)||1;
    const viewport=window.viewport_size();
    const fontFamily=look.font_family??look.font??"JetBrains Mono";
    const typography=JSON.stringify([zoom,fontFamily,look.font_size,look.terminal_padding]);
    this.initialView ??= {width:viewport.width,height:viewport.height,typography};
    const changed=this.initialView.width!==viewport.width || this.initialView.height!==viewport.height
      || this.initialView.typography!==typography;
    const activeSpace=spaces().find(s=>s.active), activeTab=activeSpace?.tabs.find(t=>t.active);
    const modelPanes=panes().filter(p=>p.tab===this.target?.tab);
    const singlePane=Boolean(this.target?.pane && activeTab?.id===this.target.tab
      && (modelPanes.length===1 || activeTab.zoomed));
    const positioned=this.snapshot.positioned && this.links.length
      && this.links.every(link=>link.positions.length && link.positions.every(p=>p.row<this.snapshot.rows && p.col<this.snapshot.cols));
    const geometry=this.mode==="inline" && !this.error && !changed && positioned ? gridGeometry({
      root:layout(),viewport,zoom,padding:look.terminal_padding??[0,0],
      cols:this.snapshot.cols,rows:this.snapshot.rows,cellWidth:this.cellWidth,
      cellWidthError:1/(FONT_PROBE_LENGTH*this.config.inline.device_scale),
      inline:this.config.inline,singlePane,
    }):null;
    let root=div().id("link-hints").relative().size_full().track_focus(this.handle)
      .on_key_down((e,cx)=>this.key(e,cx))
      .on_mouse_down("left",(_e,cx)=>{cx.stop_propagation();this.dismiss();});
    // Measure the same medium-weight monospace advance as the terminal.
    // The transparent probe does not occupy layout space or run a timer.
    root=root.child(div().absolute().left(0).top(0).w_auto().h_auto().whitespace_nowrap().opacity(0)
      .font_family(fontFamily).font_medium().text_size(Number(look.font_size)||14)
      .child("M".repeat(FONT_PROBE_LENGTH)).on_size_change((size,cx)=>{
        const width=size.width/FONT_PROBE_LENGTH;
        if(width>0 && Math.abs(width-(this.cellWidth??0))>0.001){this.cellWidth=width;cx.notify();}
      }));
    // Inline opens directly to badges. Wait for config, the snapshot, and
    // font measurement instead of flashing the window card between them.
    if (!this.configReady || (this.mode === "inline" && !this.error
      && (this.loading || !this.cellWidth))) return root;
    if (!geometry) {
      const fallback=this.mode==="inline" && !this.error && !this.loading && this.links.length
        ? "Inline alignment unavailable in this view · using window mode" : "";
      return root.child(this.panel(t,fallback).absolute().right(8).bottom(8));
    }
    const rows=this.rows();this.at=Math.min(this.at,Math.max(0,rows.length-1));
    const font=Math.min(12,Math.max(9,geometry.cellHeight/zoom*0.5));
    for (const link of rows) for (const point of link.positions) {
      const width=link.hint.length*font*0.65+10;
      root=root.child(div().id(`hint-${link.hint}-${point.row}-${point.col}`).absolute()
        .left(Math.max(0,Math.min(viewport.width/zoom-width,
          (geometry.x+point.col*geometry.cellWidth)/zoom-width-3)))
        .top((geometry.y+point.row*geometry.cellHeight)/zoom)
        .w(width).px(4).h(Math.max(font+4,geometry.cellHeight/zoom-2)).rounded(3)
        .flex().items_center().font_family("JetBrains Mono").font_semibold().text_size(font)
        .bg(t.accent).text_color(t.accent_foreground).border(1).border_color(t.foreground)
        .tooltip(link.value??link.url).cursor_pointer()
        .on_mouse_down("left",(_e,cx)=>cx.stop_propagation())
        .on_click((event,cx)=>{cx.stop_propagation();this.activate(link,event.modifiers.shift,cx);})
        .child(link.hint.toUpperCase()));
    }
    return root;
  }
}
