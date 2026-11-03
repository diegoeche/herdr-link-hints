import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { focused, spaces, panes, layout, settings, hc, exec, appHome, readTextFile, nextCommand, props, closeOverlay, theme, notify } from "herdr";
import { ALPHABET, extractLinks, labelLinks, positionLinks } from "./links.js";
import { gridGeometry, normalizeConfig } from "./geometry.js";

export default class LinkHints extends View {
  init(_props, cx) {
    // Capture the actual terminal (including a peek or replacement) before
    // giving the overlay keyboard focus. Never fall back to another pane.
    const current = focused();
    this.target = current;
    this.terminal = current?.shown ?? current?.terminal ?? current?.agent;
    this.links = [];
    this.prefix = "";
    this.at = 0;
    this.loading = Boolean(this.terminal);
    this.error = this.terminal ? "" : "Focus a terminal, then press Ctrl+Shift+O.";
    this.notice = "";
    this.config = normalizeConfig();
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
          const config = await readTextFile(appHome() + "/link-hints.json");
          this.config = normalizeConfig(config ? JSON.parse(config) : {});
          if (!this.manualMode) this.mode = this.config.mode;
        } catch (_) { this.notice = "Could not read link-hints.json · using window mode"; }
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
        this.links = positionLinks(labelLinks(extractLinks(screen.text, ansi)), this.snapshot.placements);
      } catch (error) {
        this.error = error?.message ?? "Could not read this terminal.";
      }
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
    if (!link) return;
    try {
      if (copy) cx.write_to_clipboard(link.url);
      else cx.open_url(link.url);
      this.dismiss();
      if (copy) notify({ title: "Link copied", body: "URL copied to the clipboard." });
    } catch (_) {
      this.error = copy ? "Could not copy the link." : "Could not open the link in your browser.";
      cx.notify();
    }
  }

  key(event, cx) {
    // Every key stays here while the hints are open; no text reaches an agent.
    cx.stop_propagation();
    const chord = event.keystroke.toLowerCase();
    if (event.key === "escape" || chord === "ctrl-c" || chord === "ctrl-shift-o") return this.dismiss();
    if (event.is_held || this.loading) return;
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
  }

  panel(t, fallback) {
    const rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    // Keep the keyboard selection on screen, even with hundreds of links.
    const count = this.config.window.max_rows;
    const start = Math.max(0, Math.min(this.at - Math.floor(count/2), rows.length - count));
    const visible = rows.slice(start, start + count);
    const message = this.loading ? "Reading links…" : this.error
      || (!this.links.length ? "No web links found on the current terminal screen." : "");
    return v_flex().id("link-hints-panel")
      .w(this.config.window.width).max_w("95%").h_auto().p(10).gap(6).rounded(8)
      .border(1).border_color(t.border).bg(t.popover).text_color(t.foreground).text_size(12)
      .on_mouse_down("left", (_e,cx)=>cx.stop_propagation())
      .child(h_flex().items_center().gap(8)
        .child(div().font_semibold().child("Links"))
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
          .child(div().flex_1().min_w(0).truncate().tooltip(link.url).child(link.url)))))
      .child(div().border_t(1).border_color(t.border).pt(6).text_size(10.5).text_color(t.muted)
        .child(`Hint / Enter opens · Shift copies · F2 ${this.mode === "inline" ? "window" : "inline"} · Esc closes`))
      .when(Boolean(fallback), el=>el.child(div().text_size(10.5).text_color(t.muted).child(fallback)))
      .when(Boolean(this.notice), el => el.child(div().text_size(10.5).text_color(t.muted).child(this.notice)));
  }

  render() {
    const t=theme(),look=settings(),zoom=Number(look.zoom)||1;
    const viewport=window.viewport_size();
    const typography=JSON.stringify([zoom,look.font,look.font_size,look.terminal_padding]);
    this.initialView ??= {width:viewport.width,height:viewport.height,typography};
    const changed=this.initialView.width!==viewport.width || this.initialView.height!==viewport.height
      || this.initialView.typography!==typography;
    const activeSpace=spaces().find(s=>s.active), activeTab=activeSpace?.tabs.find(t=>t.active);
    const modelPanes=panes().filter(p=>p.tab===this.target?.tab);
    const singlePane=Boolean(this.target?.pane && activeTab?.id===this.target.tab
      && (modelPanes.length===1 || activeTab.zoomed));
    const positioned=this.snapshot.positioned && this.links.length
      && this.links.every(link=>link.positions.length && link.positions.every(p=>p.row<this.snapshot.rows && p.col<this.snapshot.cols));
    const geometry=this.mode==="inline" && !changed && positioned ? gridGeometry({
      root:layout(),viewport,zoom,padding:look.terminal_padding??[0,0],
      cols:this.snapshot.cols,rows:this.snapshot.rows,cellWidth:this.cellWidth,
      inline:this.config.inline,singlePane,
    }):null;
    let root=div().id("link-hints").relative().size_full().track_focus(this.handle)
      .on_key_down((e,cx)=>this.key(e,cx))
      .on_mouse_down("left",(_e,cx)=>{cx.stop_propagation();this.dismiss();});
    // Measure the same medium-weight monospace advance as the terminal.
    // The transparent probe does not occupy layout space or run a timer.
    root=root.child(div().absolute().left(0).top(0).w_auto().h_auto().whitespace_nowrap().opacity(0)
      .font_family(look.font??"JetBrains Mono").font_medium().text_size(Number(look.font_size)||14)
      .child("M".repeat(128)).on_size_change((size,cx)=>{
        const width=size.width/128;
        if(width>0 && Math.abs(width-(this.cellWidth??0))>0.001){this.cellWidth=width;cx.notify();}
      }));
    if (!geometry) {
      const fallback=this.mode==="inline" && !this.loading && this.links.length
        ? "Inline alignment unavailable in this view · using window mode" : "";
      return root.child(this.panel(t,fallback).absolute().right(8).bottom(8));
    }
    const rows=this.rows();this.at=Math.min(this.at,Math.max(0,rows.length-1));
    const font=Math.min(12,Math.max(9,geometry.cellHeight/zoom*0.5));
    for (const link of rows) for (const point of link.positions) {
      const width=link.hint.length*font*0.65+8;
      root=root.child(div().id(`hint-${link.hint}-${point.row}-${point.col}`).absolute()
        .left(Math.min(viewport.width/zoom-width,(geometry.x+point.col*geometry.cellWidth)/zoom))
        .top((geometry.y+point.row*geometry.cellHeight)/zoom)
        .px(4).h(Math.max(font+4,geometry.cellHeight/zoom-2)).rounded(3)
        .flex().items_center().font_family("JetBrains Mono").font_semibold().text_size(font)
        .bg(t.accent).text_color(t.accent_foreground).border(1).border_color(t.foreground)
        .tooltip(link.url).cursor_pointer()
        .on_mouse_down("left",(_e,cx)=>cx.stop_propagation())
        .on_click((event,cx)=>{cx.stop_propagation();this.activate(link,event.modifiers.shift,cx);})
        .child(link.hint.toUpperCase()));
    }
    return root.child(v_flex().absolute().right(8).bottom(8).w(this.config.window.width).max_w("95%")
      .p(8).gap(4).rounded(6).border(1).border_color(t.border).bg(t.popover)
      .text_size(10.5).text_color(t.muted).on_mouse_down("left",(_e,cx)=>cx.stop_propagation())
      .child(div().child("Inline hints · Shift copies · F2 window · Esc closes"))
      .child(div().truncate().text_color(t.foreground).child(rows[this.at]?.url??"")));
  }
}
