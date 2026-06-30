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
