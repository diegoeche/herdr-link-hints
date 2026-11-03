import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { focused, hc, props, closeOverlay, theme, notify } from "herdr";
import { ALPHABET, extractLinks, labelLinks } from "./links.js";

export default class LinkHints extends View {
  init(_props, cx) {
    // Capture the actual terminal (including a peek or replacement) before
    // giving the overlay keyboard focus. Never fall back to another pane.
    const current = focused();
    this.terminal = current?.shown ?? current?.terminal ?? current?.agent;
    this.links = [];
    this.prefix = "";
    this.at = 0;
    this.loading = Boolean(this.terminal);
    this.error = this.terminal ? "" : "Focus a terminal, then press Ctrl+Shift+O.";
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (!this.terminal) return;
    const terminal = this.terminal;
    cx.spawn(async (cx) => {
      try {
        // One screen-only read per opening. History reads can send scroll
        // input to a full-screen program, so deliberately never request them.
        const result = await hc(["read", "--json", "--lines", "0", terminal]);
        if (result.code !== 0) throw new Error("Could not read this terminal. Close and try again.");
        const screen = JSON.parse(result.stdout);
        if (typeof screen.text !== "string") throw new Error("Herdr returned an unreadable terminal screen.");
        this.links = labelLinks(extractLinks(screen.text));
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

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.min(this.at, Math.max(0, rows.length - 1));
    // Keep the keyboard selection on screen, even with hundreds of links.
    const start = Math.max(0, Math.min(this.at - 3, rows.length - 6));
    const visible = rows.slice(start, start + 6);
    const message = this.loading ? "Reading links…" : this.error
      || (!this.links.length ? "No web links found on the current terminal screen." : "");
    return v_flex().id("link-hints").track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .w_full().h_auto().p(10).gap(6).bg(t.popover).text_color(t.foreground).text_size(12)
      .child(h_flex().items_center().gap(8)
        .child(div().font_semibold().child("Links"))
        .when(Boolean(this.prefix), el => el.child(div().px(5).rounded(3).bg(t.input)
          .text_color(t.accent).font_family("JetBrains Mono").child(this.prefix.toUpperCase())))
        .child(div().flex_1())
        .child(div().text_size(10.5).text_color(t.muted).child(this.loading ? "" :
          rows.length > 6 ? `${this.at + 1} / ${rows.length} · ↑↓` : `${this.links.length}`)))
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
        .child("Hint / Enter opens · Shift copies · Esc closes"));
  }
}
