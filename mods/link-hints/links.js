import { URL } from "url";

// Foot's home-row hint alphabet. All hints have the same length, so a short
// hint can never open a link before the user finishes a longer hint.
export const ALPHABET = "sadfjklewcmpgh";

export function extractLinks(text) {
  const links = [];
  const seen = new Set();
  // Screen reads are plain text, but tolerate SGR/OSC when supplied by a caller.
  const plain = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const candidates = plain.match(/(?:https?:\/\/|\bwww\.)[^\s<>"'`\x00-\x1f\x7f]+/gi) ?? [];
  for (let raw of candidates) {
    raw = raw.replace(/[.,;:!?…]+$/u, "");
    // Discard prose/Markdown delimiters, but retain balanced URL parentheses.
    for (;;) {
      const last = raw.slice(-1);
      const opener = { ")": "(", "]": "[", "}": "{" }[last];
      if (!opener || raw.split(last).length <= raw.split(opener).length) break;
      raw = raw.slice(0, -1).replace(/[.,;:!?…]+$/u, "");
    }
    const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) continue;
      // Preserve the exact spelling/query string when opening; normalize only
      // for de-duplication (e.g. example.com and example.com/).
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      links.push(url);
    } catch (_) { /* Ignore incomplete addresses. */ }
  }
  return links;
}

export function labelLinks(urls) {
  let width = 1;
  while (ALPHABET.length ** width < urls.length) width++;
  return urls.map((url, index) => {
    let hint = "", value = index;
    for (let i = 0; i < width; i++) {
      hint = ALPHABET[value % ALPHABET.length] + hint;
      value = Math.floor(value / ALPHABET.length);
    }
    return { hint, url };
  });
}
