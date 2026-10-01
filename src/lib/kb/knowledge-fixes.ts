// Corrections applied to the generated knowledge file (src/data/uppababy-knowledge.json) when the chat loads it.
// The file is rebuilt from the uppababy-site repo, so a fix made in the file itself would be lost on the next
// rebuild. These stay until the site build carries them, and do nothing once it does.

// Pages the chat was missing, so it guessed: adapter questions went to the pram quiz, Tune-Up bookings to Support.
export const EXTRA_PAGES: Record<string, string> = {
  "Which adapter do I need? (the adapter guide: what fits each pram, by position)": "/pages/adapters",
  "Tune-Up Days (every upcoming date, with booking)": "/pages/tune-up-days",
  "Australian Car Seat Centre (fitting the Mesa, the Australian standard)": "/pages/car-seat-centre",
  "Which UPPAbaby pram? (a four-question quiz that suggests a model; not an adapter guide)": "/pages/find-your-perfect-pram",
};

const MINU_RULE = "No other brand of capsule fits the Minu V3 or Minu Duo. The older Minu V2 takes selected Maxi-Cosi, Nuna and Joie capsules with the Minu V2 Car Seat Adapter.";

// BeSafe is not sold in Australia and is never named to customers (David, 1 Oct 2026).
// The Minu V2 takes the Mesa and Maxi-Cosi (David, 1 Oct 2026); the "no Minu" rule is for the Minu V3 and Minu Duo.
const TEXT_FIXES: [RegExp, string][] = [
  [/Maxi-Cosi, Nuna, Joie or BeSafe/g, "Maxi-Cosi, Nuna or Joie"],
  [/Maxi-Cosi, Nuna, BeSafe and Joie/g, "Maxi-Cosi, Nuna and Joie"],
  [/Maxi-Cosi, Nuna, Joie and BeSafe/g, "Maxi-Cosi, Nuna and Joie"],
  [/,\s*BeSafe®?(?=[\s,.;)])/g, ""],
  [/\s+(?:or|and)\s+BeSafe®?(?=[\s,.;)])/g, ""],
  [/BeSafe®?,\s*/g, ""],
  [/No other brand of capsule fits any Minu\./g, MINU_RULE],
  [/no Minu frame supports a third-party capsule/gi, "the Minu V3 and Minu Duo take no third-party capsule (the older Minu V2 does, with the Minu V2 Car Seat Adapter)"],
  [/never fit a Minu\b/g, "never fit a Minu V3 or Minu Duo"],
];

function fixText(s: string) {
  return TEXT_FIXES.reduce((t, [re, to]) => t.replace(re, to), s);
}

function walk(v: unknown): unknown {
  if (typeof v === "string") return fixText(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
  return v;
}

export function fixKnowledge<T extends { pages?: Record<string, string> }>(k: T): T {
  const out = walk(k) as T;
  const pages = { ...(out.pages || {}) };
  const have = new Set(Object.values(pages));
  for (const [label, path] of Object.entries(EXTRA_PAGES)) if (!have.has(path)) pages[label] = path;
  return { ...out, pages };
}

// Section links (#...) that no longer exist after the page was redesigned; the page itself still opens.
const LIVE_SECTIONS: Record<string, string[]> = {
  "/pages/product-registration": ["register"],
  "/pages/uppababy-lay-by": ["request", "start"],
};
const MOVED: Record<string, string> = { "/collections/cruz-v3-pram": "/collections/uppababy-cruz-v3-pram" };

export function fixReplyLinks(text: string): string {
  return text.replace(/\]\((\/[^)\s#]+)(#[^)\s]*)?\)/g, (m, path: string, hash?: string) => {
    const p = MOVED[path] || path;
    const ok = LIVE_SECTIONS[p];
    const h = hash && ok && !ok.includes(hash.slice(1)) ? "" : hash || "";
    return `](${p}${h})`;
  });
}
