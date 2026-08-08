// Brand logo paths, keyed by brand id. Plain module (NOT "use client") so it can
// be imported by both server components (share page, PDF route) and client
// components. Exports from a "use client" module become client references in the
// server graph, which made BRAND_LOGOS[id] undefined server-side — hence this lib.
export const BRAND_LOGOS: Record<number, string> = {
  0:  "/logos/Nanit_Logo Lockup_Midnight Mist.svg",
  1:  "/logos/MCC_logo_MAGIC_black_c.png",
  2:  "/logos/hannie.jpg",
  3:  "/logos/gaia-baby-logo.avif",
  4:  "/logos/220420 Logo.jpg",
  5:  "/logos/UPPAbaby Logo.jpg",
  6:  "/logos/ZAZU logo_HR.jpg",
  7:  "/logos/MiaMily_logo+flag_1.png",
  8:  "/logos/Frida_logo_main.png",
  9:  "/logos/Coolkidz Logo.png",
  10: "/logos/Matchstick Monkey Logo.jpg",
  11: "/logos/Primary Logo - Red.png",
  12: "/logos/Smartrike Logo.png",
};

// White-on-transparent versions, for dark backgrounds (e.g. the Influencer
// Agreement header) — solid white artwork, not a filtered version of the
// colour logo, so wordmarks stay crisp. No entry for Coolkidz (9): its
// existing logo file is already handled with a brightness-0/invert filter
// wherever it's shown on a dark background, so it doesn't need a dedicated
// white asset here.
export const BRAND_LOGOS_WHITE: Record<number, string> = {
  0:  "/logos/white/nanit.png",
  1:  "/logos/white/magic.png",
  2:  "/logos/white/hannie.png",
  3:  "/logos/white/gaia-baby.png",
  4:  "/logos/white/wonderfold.png",
  5:  "/logos/white/uppababy.png",
  6:  "/logos/white/zazu.png",
  7:  "/logos/white/miamily.png",
  8:  "/logos/white/frida.png",
  10: "/logos/white/matchstick-monkey.png",
  11: "/logos/white/mamave.png",
  12: "/logos/white/smartrike.png",
};
