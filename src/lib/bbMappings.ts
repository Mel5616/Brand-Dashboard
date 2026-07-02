// AUTO-DERIVED from Sell_Through.xlsx (Baby Bunting export). Source of truth for BB ingestion.
// Confirm the JUDGEMENT CALLS noted in the integration brief before going live.

export type BBState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'ACT' | 'TAS' | 'Online';

// Physical store -> state. Non-store locations resolve to 'Online'.
export const STORE_STATE: Record<string, BBState> = {
  "Alexandria": "NSW",
  "Auburn": "NSW",
  "Bankstown": "NSW",
  "Belrose": "NSW",
  "Blacktown": "NSW",
  "Campbelltown": "NSW",
  "Castle Towers": "NSW",
  "Casula": "NSW",
  "Chatswood": "NSW",
  "Moore Park": "NSW",
  "Orange": "NSW",
  "Penrith": "NSW",
  "Rutherford": "NSW",
  "Shellharbour": "NSW",
  "Taren Point": "NSW",
  "Wagga Wagga": "NSW",
  "Warners Bay": "NSW",
  "West Gosford": "NSW",
  "Wetherill Park": "NSW",
  "Ballina": "NSW",
  "Dubbo": "NSW",
  "Coffs Harbour": "NSW",
  "Tuggerah": "NSW",
  "Ballarat": "VIC",
  "Bendigo": "VIC",
  "Chadstone": "VIC",
  "Chirnside Park": "VIC",
  "Cranbourne": "VIC",
  "Doncaster": "VIC",
  "Frankston": "VIC",
  "Geelong": "VIC",
  "Hawthorn": "VIC",
  "Hoppers Crossing": "VIC",
  "Knox": "VIC",
  "Maribyrnong": "VIC",
  "Narre Warren": "VIC",
  "Preston": "VIC",
  "Ringwood": "VIC",
  "Shepparton": "VIC",
  "Thomastown": "VIC",
  "Mentone": "VIC",
  "Plenty Valley": "VIC",
  "Albury": "VIC",
  "Burnside": "VIC",
  "Aspley": "QLD",
  "Booval": "QLD",
  "Browns Plains": "QLD",
  "Burleigh Waters": "QLD",
  "Cairns": "QLD",
  "Capalaba": "QLD",
  "Fortitude Valley": "QLD",
  "Helensvale": "QLD",
  "Kawana": "QLD",
  "Loganholme": "QLD",
  "Macgregor": "QLD",
  "Maroochydore": "QLD",
  "North Lakes": "QLD",
  "Toowoomba": "QLD",
  "Townsville": "QLD",
  "Robina": "QLD",
  "Gepps Cross": "SA",
  "Hectorville": "SA",
  "Melrose Park": "SA",
  "Munno Para": "SA",
  "Marion": "SA",
  "Marleston": "SA",
  "Baldivis": "WA",
  "Belmont": "WA",
  "Cannington": "WA",
  "Joondalup": "WA",
  "Midland": "WA",
  "Myaree": "WA",
  "Osborne Park": "WA",
  "Glenorchy": "TAS",
  "Belconnen": "ACT",
  "Fyshwick": "ACT"
};

export const NON_STORE_LOCATIONS: string[] = ["3PL - NSW", "3PL - QLD", "3PL - VIC", "3PL - WA", "Baby Expo", "Corporate Sales", "Distribution Centre National Drive", "Head Office", "Online (National Drive)", "Online Virtual Reroute", "Stock Recall"];

export function resolveState(store: string): BBState {
  if (NON_STORE_LOCATIONS.includes(store)) return 'Online';
  return STORE_STATE[store] ?? 'Online'; // unmapped falls back to Online; log a warning so new stores get added
}

// Column map (1-indexed to match the raw export layout). Data starts at row 30.
export const COLS = {
  code: 1,          // SKU
  supplierCode: 3,
  description: 4,
  currRetail: 10,
  lastCost: 11,
  wkUnits: 14,      // week units sold
  wkSales: 15,      // week $ sold ex-tax
  sohUnits: 18,     // stock on hand units
  sohValue: 21,     // stock on hand retail value inc
  weeksOnHand: 22,
  cumUnits: 23,     // rolling-year units
  cumSales: 24,     // rolling-year $ ex-tax
  cumSellThru: 30,  // rolling-year % sell-through
  gpCum: 32,        // gross profit cumulative $
} as const;

// Report date lives at cell M4 (row 4, col 13), format dd/mm/yyyy. Use as week_ending (allow override on upload).

// Brand from the description prefix.
export function classifyBrand(desc: string): string {
  const d = desc.toUpperCase();
  if (d.startsWith('UPPABABY')) return 'UPPAbaby';
  if (d.startsWith('WONDERFOLD')) return 'WonderFold';
  if (d.startsWith('ZAZU')) return 'Zazu';
  if (d.startsWith('BABYCHIC')) return 'BabyChic';
  return 'Other';
}

// Product line. Current model vs (legacy) — the V2/older generation.
// Vista: legacy = UPV2, everything else current. Cruz/Minu: current = V3, else legacy.
export const MODEL_ORDER = [
  'Vista','Vista (legacy)','Cruz','Cruz (legacy)','Minu','Minu (legacy)',
  'Ridge','RumbleSeat','Bassinet','Accessory','Wagon',
] as const;

// Pram lines = the highlighted supplier-code columns from the BB report.
export const PRAM_MODELS = new Set<string>([
  'Vista','Vista (legacy)','Cruz','Cruz (legacy)','Minu','Minu (legacy)','Ridge','RumbleSeat',
]);

// The current-generation key prams — used for the best-selling-colours breakdown.
export const KEY_PRAMS = ['Vista', 'Cruz', 'Minu'] as const;

const ACCESSORY_RE = /ADAPTER|CUP HOLDER|SNACK TRAY|TRAVEL BAG|PIGGYBACK|RIDE-ALONG|BUMPER BAR|INFANT COVER|RAIN COVER|CAR SEAT/i;

export function classifyModel(desc: string, brand: string, code = ''): string {
  const d = desc.toUpperCase();
  const c = (code || '').toUpperCase();
  // Components & accessories first — they usually name a model (e.g. "VISTA V3 RUMBLE SEAT").
  if (d.includes('RUMBLE')) return 'RumbleSeat';
  if (d.includes('RIDGE')) return 'Ridge';
  if (ACCESSORY_RE.test(d)) return 'Accessory';
  if (d.includes('BASSINET') && !d.includes('WITH BASSINET')) return 'Bassinet';  // standalone, not "stroller with bassinet"
  // Prams — CURRENT vs LEGACY is decided by the supplier code, which is authoritative:
  //   UPV3* = current Vista, UPC3* = current Cruz, UPM3* = current Minu; everything
  //   else in that family (UPV2/UPV17/UPV18, UPC2/17/18, UPM2/…) is legacy.
  // Fall back to the description only when no code is present (e.g. "VISTA V2").
  const ver = (cur: RegExp, current: string, legacy: string, descV2: RegExp) =>
    c ? (cur.test(c) ? current : legacy) : (descV2.test(d) ? legacy : current);
  if (d.includes('VISTA') || /^UPV[0-9]/.test(c)) return ver(/^UPV3/, 'Vista', 'Vista (legacy)', /VISTA V2|VISTA 201[0-9]/);
  if (d.includes('CRUZ')  || /^UPC[0-9]/.test(c)) return ver(/^UPC3/, 'Cruz',  'Cruz (legacy)',  /CRUZ (V2|201[0-9])/);
  if (d.includes('MINU')  || /^UPM[0-9]/.test(c)) return ver(/^UPM3/, 'Minu',  'Minu (legacy)',  /MINU V2|MINU 201[0-9]/);
  if (brand === 'WonderFold') return 'Wagon';
  return 'Accessory';
}

export const isPram = (model: string): boolean => PRAM_MODELS.has(model);
