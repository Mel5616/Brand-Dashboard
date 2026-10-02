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
  assert.equal(k.adapters.capsules.thirdparty.name, "Maxi-Cosi, Nuna, Joie or Britax");
  assert.equal(k.adapters.adapters["ridge-carseat"].for, "Maxi-Cosi, Nuna, Joie and Britax capsules on Ridge");
  assert.ok(!/besafe/i.test(JSON.stringify(k)));
  assert.equal(fixKnowledge({ pages: {}, t: "Other brands, including Maxi-Cosi, Nuna, Joie and BeSafe, fit using" }).t, "Other brands, including Maxi-Cosi, Nuna, Joie and Britax, fit using");
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

test("says the Bugaboo Turtle is not supported, once", () => {
  const k = fixKnowledge(sample());
  assert.match(k.adapters.capsules.thirdparty.note, /Bugaboo Turtle is not supported on any UPPAbaby pram or capsule adapter/);
  const twice = fixKnowledge(fixKnowledge(sample()));
  assert.equal((twice.adapters.capsules.thirdparty.note.match(/Bugaboo Turtle/g) || []).length, 1);
});

test("adds the Britax B-Pod and B-Pod Lite to the approved capsules, once", () => {
  const s = sample() as any; s.adapters.capsules.thirdparty.models = ["Nuna PIPA", "Joie i-Gemm"];
  const k = fixKnowledge(fixKnowledge(s)) as any;
  assert.deepEqual(k.adapters.capsules.thirdparty.models, ["Nuna PIPA", "Joie i-Gemm",
    "Britax B-Pod (Vista, Cruz and Ridge; not the Kona)", "Britax B-Pod Lite (Vista, Cruz and Ridge; not the Kona)"]);
  assert.equal(k.adapters.capsules.thirdparty.name, "Maxi-Cosi, Nuna, Joie or Britax");
});

test("keeps Britax out of anything Kona-specific", () => {
  const s = sample() as any;
  s.adapters.frames = { kona: { thirdparty: { note: "Maxi-Cosi, Nuna, Joie and BeSafe, per the Kona fact sheet." } } };
  s.adapters.adapters["kona-carseat"] = { for: "Maxi-Cosi, Nuna, BeSafe and Joie capsules on Kona" };
  const k = fixKnowledge(s) as any;
  assert.equal(k.adapters.frames.kona.thirdparty.note, "Maxi-Cosi, Nuna and Joie, per the Kona fact sheet.");
  assert.equal(k.adapters.adapters["kona-carseat"].for, "Maxi-Cosi, Nuna and Joie capsules on Kona");
  assert.match(k.adapters.adapters["ridge-carseat"].for, /Britax/);
});

test("keeps Britax out of the Minu V2 rule, even when applied twice", () => {
  const k = fixKnowledge(fixKnowledge(sample()));
  assert.match(k.adapters.minu.note, /Minu V2 takes selected Maxi-Cosi, Nuna and Joie capsules/);
  assert.ok(!/Britax/.test(k.adapters.minu.note));
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

test("the plane answer names the Minu V3, and only that answer changes", () => {
  const s = sample();
  (s.faq as { topic: string; q: string; a: string; link: string | null }[]).push(
    { topic: "Answers", q: "Can I take an UPPAbaby pram on a plane?", a: "The Mesa capsule is CASA approved for aircraft use. Prams are normally checked at the gate rather than carried on.", link: "/pages/faqs#can-i-take-an-uppababy-pram-on-a-plane" });
  const k = fixKnowledge(s) as unknown as { faq: { q: string; a: string; link: string | null }[] };
  const plane = k.faq.find(f => f.q === "Can I take an UPPAbaby pram on a plane?")!;
  assert.match(plane.a, /Minu V3/);
  assert.match(plane.a, /25 x 45 x 55 cm/);
  assert.match(plane.a, /TravelSafe/);
  assert.match(plane.a, /CASA/);
  assert.equal(plane.link, "/pages/faqs#can-i-take-an-uppababy-pram-on-a-plane");
  assert.equal(k.faq.filter(f => !/4moms|older Vista/.test(f.q)).length, 3);
});

test("adds written answers the site is missing, once", () => {
  const k = fixKnowledge(sample()) as unknown as { faq: { q: string; a: string }[] };
  const fourMoms = k.faq.find(f => /4moms/i.test(f.q))!;
  assert.match(fourMoms.a, /help\.coolkidz\.com\.au/);
  assert.match(fourMoms.a, /recall/i);
  const bar = k.faq.find(f => /bumper bar/i.test(f.q) && /2018/.test(f.q))!;
  assert.match(bar.a, /Vista V2/);
  assert.match(bar.a, /quote/);
  const again = fixKnowledge(k as never) as unknown as { faq: unknown[] };
  assert.equal(again.faq.length, k.faq.length);
});
