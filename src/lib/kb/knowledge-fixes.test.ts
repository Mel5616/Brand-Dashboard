import { test } from "node:test";
import assert from "node:assert/strict";
import { fixKnowledge, fixReplyLinks, EXTRA_PAGES } from "./knowledge-fixes.ts";

const sample = () => ({
  pages: { "Support hub": "/pages/support", "Compare the range": "/pages/product-comparison" },
  adapters: {
    capsules: { thirdparty: { name: "Maxi-Cosi, Nuna, Joie or BeSafe" } },
    adapters: { "ridge-carseat": { for: "Maxi-Cosi, Nuna, BeSafe and Joie capsules on Ridge" } },
    _meta: { minuThirdParty: "Confirmed by Mel, 10 September 2026: no Minu frame supports a third-party capsule. Previously this answered 'check with us'." },
    minu: { note: "Minu V3 Mesa adapter. No other brand of capsule fits any Minu." },
  },
  faq: [
    { topic: "Minu Duo support", q: "What fits", a: "Maxi-Cosi, Nuna, Joie or BeSafe capsule Not compatible. No other brand of capsule fits any Minu.", link: "/pages/minu-duo-support" },
    { topic: "Australian Car Seat Centre", q: "Do I need adapters?", a: "Third-party capsules from Maxi-Cosi, Nuna and Joie fit some frames with the car seat adapter, and never fit a Minu.", link: null },
  ],
});

test("adds the pages the chat was missing, without touching existing ones", () => {
  const k = fixKnowledge(sample());
  assert.equal(k.pages["Support hub"], "/pages/support");
  for (const path of Object.values(EXTRA_PAGES)) assert.ok(Object.values(k.pages).includes(path), path);
  assert.ok(Object.values(EXTRA_PAGES).includes("/pages/adapters"));
  assert.ok(Object.values(EXTRA_PAGES).includes("/pages/tune-up-days"));
});

test("does not add a page twice when the build already lists it", () => {
  const s = sample(); (s.pages as Record<string, string>)["Which adapter?"] = "/pages/adapters";
  const k = fixKnowledge(s);
  assert.equal(Object.values(k.pages).filter(p => p === "/pages/adapters").length, 1);
});

test("removes every mention of BeSafe", () => {
  const k = fixKnowledge(sample());
  assert.equal(k.adapters.capsules.thirdparty.name, "Maxi-Cosi, Nuna or Joie");
  assert.equal(k.adapters.adapters["ridge-carseat"].for, "Maxi-Cosi, Nuna and Joie capsules on Ridge");
  assert.ok(!/besafe/i.test(JSON.stringify(k)));
  assert.equal(fixKnowledge({ pages: {}, t: "Other brands, including Maxi-Cosi, Nuna, Joie and BeSafe, fit using" }).t, "Other brands, including Maxi-Cosi, Nuna and Joie, fit using");
});

test("limits the no-other-brand rule to the Minu V3 and Minu Duo", () => {
  const k = fixKnowledge(sample());
  const all = JSON.stringify(k);
  assert.ok(!/any Minu\b/.test(all), all);
  assert.ok(!/no Minu frame/i.test(all));
  assert.ok(!/never fit a Minu[,.]/.test(all));
  assert.match(k.adapters.minu.note, /Minu V3 or Minu Duo/);
  assert.match(k.adapters.minu.note, /Minu V2 takes/);
});

test("leaves the original knowledge object unchanged", () => {
  const s = sample(); fixKnowledge(s);
  assert.match(s.adapters.capsules.thirdparty.name, /BeSafe/);
});

test("drops section links that no longer exist on the page, keeps real ones", () => {
  assert.equal(fixReplyLinks("See [how to register](/pages/product-registration#how-to-register)."), "See [how to register](/pages/product-registration).");
  assert.equal(fixReplyLinks("[Lay-by](/pages/uppababy-lay-by#how-it-works)"), "[Lay-by](/pages/uppababy-lay-by)");
  assert.equal(fixReplyLinks("[Register](/pages/product-registration#register)"), "[Register](/pages/product-registration#register)");
  assert.equal(fixReplyLinks("[What fits](/pages/vista-v3-support#what-fits)"), "[What fits](/pages/vista-v3-support#what-fits)");
});

test("points the old Cruz V3 collection address at the current one", () => {
  assert.equal(fixReplyLinks("[Cruz V3](/collections/cruz-v3-pram)"), "[Cruz V3](/collections/uppababy-cruz-v3-pram)");
});
