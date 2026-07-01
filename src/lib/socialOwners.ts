// Who runs each brand's social accounts. Edit here to reassign — the Social tab
// groups performance by owner from this map. Brand ids come from the brands table.
//   0 Nanit · 1 Magic · 2 Hannie · 3 Gaia Baby · 4 WonderFold · 5 UPPAbaby
//   6 ZAZU · 7 MiaMily · 8 Frida · 9 Coolkidz Australia · 10 Matchstick Monkey
//   11 Mamave · 12 SmarTrike
// Note: UPPAbaby New Zealand shares the UPPAbaby brand (no separate account here).
export const SOCIAL_OWNERS: Record<number, string> = {
  5: "Nicky",   // UPPAbaby (incl. UPPAbaby New Zealand)
  11: "Nicky",  // Mamave
  8: "Nicky",   // Frida
  0: "Nicky",   // Nanit
  2: "Nicky",   // Hannie
  9: "Nicky",   // Coolkidz Australia
  4: "Alicia",  // WonderFold
  6: "Alicia",  // ZAZU
  10: "Alicia", // Matchstick Monkey
  3: "Alicia",  // Gaia Baby
  1: "Alicia",  // Magic
  7: "Alicia",  // MiaMily
};

// Display order + accent colour per owner.
export const SOCIAL_TEAM: { name: string; color: string }[] = [
  { name: "Nicky", color: "#6366f1" },
  { name: "Alicia", color: "#ec4899" },
];

export const ownerOf = (brandId: number): string | null => SOCIAL_OWNERS[brandId] ?? null;
export const ownerColor = (name: string): string => SOCIAL_TEAM.find(o => o.name === name)?.color ?? "#94a3b8";
