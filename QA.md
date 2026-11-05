# Inline selectors QA

Implementation and automated checks are complete; manual QA follows this list.
Use a disposable shell tab. Do not automate test keys in a real agent terminal.

1. **Links:** display `https://example.com/` and `http://example.org/`.
   Ctrl+Shift+O should place S/A badges before them. Activate a badge and
   check the opened destination. Shift+badge should copy without opening.
2. **Modes:** F2 switches inline → window → inline. F3 cycles Links →
   Commands → Images. Escape closes without sending text to the shell.
3. **Execute:** display `!pwd` and `!printf 'selector test\n'`. Ctrl+Shift+X
   should badge those commands. Choose one: it types `!pwd` or the complete
   printf command into the same Codex/Claude prompt, including the bang.
   No new tab opens and no Enter is sent. Review and submit manually; output
   and failures should stay in that conversation. Shift+badge copies without `!`.
4. **Images:** display an existing local image path, such as the absolute
   path to this project's preview-inline.png. Ctrl+Shift+I should badge it;
   selecting opens the configured viewer. Repeat with a quoted path containing
   spaces and a path relative to the source directory.
5. **Wrapped values:** narrow the test terminal and display a URL longer
   than one row. Check that its badge stays at the start and copying preserves
   its final path/query. Repeat with a long `!printf ...` command. Actual newline
   fragments must stay separate.
6. **Overflow:** display more than 14 distinct links. Hints should use more
   than one letter with no prefix collisions. In window mode, use arrows,
   PageUp/PageDown, Home/End and hint letters to reach entries beyond the
   visible rows. Shrink the window and check that selection remains reachable.
7. **Configuration:** change a prefix, title, viewer argv, or mode in
   selectors.json; close and reopen. Add the README's tickets selector and
   rerun the installer; check its shortcut, capture, and exact destination.
   Disable it and verify it is absent from F3 cycling.
8. **Failures:** malformed config and a failing viewer should show an error.
   Split panes or ambiguous geometry should use window mode. No failure may
   run another action or submit Enter. If typing fails, the selector must show
   the error and retain the same command for correction/retry. If it warns that
   input may already be typed, inspect the prompt before retrying. A blocked
   approval dialog must receive no input.
9. **Profiles:** repeat the shortcut/mode checks in default, Rayfun, Sorted,
   Stamped and Remasters. Ctrl+Shift+X now selects commands; Alt+Escape remains
   the close-pane shortcut in the configured layouts.

Known limitation: Herdr does not expose the independently scrolled terminal
viewport to mods. Return to the bottom for inline selectors. Offscreen history
and full scrollback selection are not implemented. Live output is not frozen;
reopen after it moves. Local image viewing is built in; remote image retrieval
needs a custom action.
