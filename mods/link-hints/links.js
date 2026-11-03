import { URL } from "url";

// Foot's home-row hint alphabet. All hints have the same length, so a short
// hint can never open a link before the user finishes a longer hint.
export const ALPHABET = "sadfjklewcmpgh";

export function extractLinks(text, snapshot = "") {
  const links = [];
  const seen = new Set();
  const add = url => {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) return;
      if (seen.has(parsed.href)) return;
      seen.add(parsed.href);
      links.push(url);
    } catch (_) { /* Ignore incomplete or unsupported addresses. */ }
  };
  // Named links keep their destination in OSC 8, not in the visible text.
  // Explicit destinations are exact: never strip URL punctuation from them.
  const osc8 = /\x1b\]8;[^;\x07\x1b]*;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  for (const match of (snapshot + "\n" + text).matchAll(osc8)) {
    if (match[1]) add(match[1]);
  }
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
    add(url);
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

export function positionLinks(links, placements=[]) {
  const canonical=url=>{try{return new URL(url).href;}catch(_){return null;}};
  return links.map(link=>({...link,positions:placements.filter(place=>{
    const url=place.explicit?place.url:extractLinks(place.url)[0];
    return canonical(url)===canonical(link.url) && Number.isInteger(place.row)
      && Number.isInteger(place.col) && place.row>=0 && place.col>=0;
  })}));
}
