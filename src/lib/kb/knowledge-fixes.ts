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
// third value true = a Britax rule, skipped for anything Kona-specific (the B-Pods do not fit the Kona)
const TEXT_FIXES: [RegExp, string, boolean?][] = [
  [/Maxi-Cosi, Nuna, Joie or BeSafe/g, "Maxi-Cosi, Nuna or Joie"],
  [/Maxi-Cosi, Nuna, BeSafe and Joie/g, "Maxi-Cosi, Nuna and Joie"],
  [/Maxi-Cosi, Nuna, Joie and BeSafe/g, "Maxi-Cosi, Nuna and Joie"],
  [/,\s*BeSafe®?(?=[\s,.;)])/g, ""],
  [/\s+(?:or|and)\s+BeSafe®?(?=[\s,.;)])/g, ""],
  [/BeSafe®?,\s*/g, ""],
  // the Britax B-Pod and B-Pod Lite fit with the matching UPPAbaby car seat adapter (David, 1 Oct 2026):
  // Vista, Cruz and Ridge, not the Kona, and not the Minu V2 adapter
  [/Maxi-Cosi, Nuna and Joie(?! capsules with the Minu V2)/g, "Maxi-Cosi, Nuna, Joie and Britax", true],
  [/Maxi-Cosi, Nuna or Joie\b/g, "Maxi-Cosi, Nuna, Joie or Britax", true],
  [/Nuna KLIK Plus,? and (the )?Joie i-Gemm/g, "Nuna KLIK Plus, Joie i-Gemm, Britax B-Pod and Britax B-Pod Lite", true],
  [/No other brand of capsule fits any Minu\./g, MINU_RULE],
  [/no Minu frame supports a third-party capsule/gi, "the Minu V3 and Minu Duo take no third-party capsule (the older Minu V2 does, with the Minu V2 Car Seat Adapter)"],
  [/never fit a Minu\b/g, "never fit a Minu V3 or Minu Duo"],
];

function fixText(s: string, kona: boolean) {
  return TEXT_FIXES.reduce((t, [re, to, britax]) => (britax && kona ? t : t.replace(re, to)), s);
}

function walk(v: unknown, kona = false): unknown {
  if (typeof v === "string") return fixText(v, kona);
  if (Array.isArray(v)) return v.map(x => walk(x, kona));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, kona || /kona/i.test(k))]));
  return v;
}

// Capsules people ask about that no UPPAbaby pram or adapter supports (David, 1 Oct 2026).
export const NOT_SUPPORTED = "The Bugaboo Turtle is not supported on any UPPAbaby pram or capsule adapter.";
// Other-brand capsules that fit with the matching UPPAbaby car seat adapter, added to the site's list (David, 1 Oct 2026).
// The site's list is shared by every frame that takes other brands, so the Kona exception is written into each name.
export const EXTRA_CAPSULES = ["Britax B-Pod (Vista, Cruz and Ridge; not the Kona)", "Britax B-Pod Lite (Vista, Cruz and Ridge; not the Kona)"];

// Site answers that leave out what matters most. The plane answer never named the Minu V3, the pram to fly with
// (David, 2 Oct 2026); facts from the help centre article "Can I take the Minu V3 on board the plane?".
const FAQ_ANSWERS: Record<string, string> = {
  "Can I take an UPPAbaby pram on a plane?": "Yes. The Minu V3 is the pram to fly with: it weighs 7.6 kg and folds to 25 x 45 x 55 cm, which meets the IATA overhead standard. Whether it can go in the cabin is up to your airline, so check before you book. Other prams are normally checked at the gate or in the hold. Pack yours in an UPPAbaby travel bag and register it under the TravelSafe Program before you fly, because airline damage is otherwise excluded from the warranty. The Mesa capsule is CASA approved for aircraft use on airlines that permit child restraints.",
};

// Written answers the site does not have (David, 2 Oct 2026). Added once, under the site's own "Answers" topic.
const EXTRA_FAQ = [
  { topic: "Answers", q: "Is there a recall on the 4moms MamaRoo? Who looks after 4moms?",
    a: "4moms products, including the 4moms MamaRoo, are looked after by Coolkidz Australia, not UPPAbaby. There was an older voluntary recall on the 4moms MamaRoo. For anything 4moms, including that recall, please lodge a request with the Coolkidz help desk at https://help.coolkidz.com.au and the team will help.", link: null },
  { topic: "Answers", q: "Can I get a bumper bar for my older Vista (2015 to 2018)?",
    a: "Yes. The current Vista V2 and V3 bumper bar fits and works on the 2015 to 2018 Vista, so we can quote it for you. Lodge a request with a photo of the white serial label near the rear axle and we will send a quote.", link: "/pages/spare-parts" },
];

type ThirdParty = { name?: string; models?: string[]; note?: string };
export function fixKnowledge<T extends { pages?: Record<string, string> }>(k: T): T {
  const out = walk(k) as T & { adapters?: { capsules?: { thirdparty?: ThirdParty } }; faq?: { q: string; a: string }[] };
  if (Array.isArray(out.faq)) out.faq = out.faq.map(f => (FAQ_ANSWERS[f.q] ? { ...f, a: FAQ_ANSWERS[f.q] } : f));
  if (Array.isArray(out.faq)) { const have = new Set(out.faq.map(f => f.q)); out.faq = [...out.faq, ...EXTRA_FAQ.filter(f => !have.has(f.q))]; }
  const pages = { ...(out.pages || {}) };
  const have = new Set(Object.values(pages));
  for (const [label, path] of Object.entries(EXTRA_PAGES)) if (!have.has(path)) pages[label] = path;
  const tp = out.adapters?.capsules?.thirdparty;
  if (tp) {
    if (Array.isArray(tp.models)) for (const m of EXTRA_CAPSULES) if (!tp.models.includes(m)) tp.models.push(m);
    if (!(tp.note || "").includes("Bugaboo Turtle")) tp.note = ((tp.note || "") + " " + NOT_SUPPORTED).trim();
  }
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
