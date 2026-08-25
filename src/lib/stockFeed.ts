// Shared loader for the Asana Stock Report feed (asana_tasks, project_label
// "Stock Report") — used by the Stock Availability report generator and the
// weekly-style OOS email. Sections are brands; custom fields carry Code /
// Stock Status / Ordering For. Internal notes are never exposed.

export type StockItem = { name: string; code: string | null; status: string | null; expected: string | null };
export type StockGroup = { brand: string; color: string; items: StockItem[] };

const field = (cf: Record<string, string> | null, pats: RegExp[]) => {
  for (const pat of pats) {
    const k = Object.keys(cf || {}).find(x => pat.test(x));
    if (k && cf![k]) return cf![k];
  }
  return null;
};

export async function loadStockFeed(sb: any): Promise<{ groups: StockGroup[]; error?: string }> {
  const [{ data: tasks, error }, { data: brands }] = await Promise.all([
    sb.from("asana_tasks").select("name,notes,due_on,section,custom_fields")
      .eq("project_label", "Stock Report").eq("completed", false).limit(1000),
    sb.from("brands").select("name,color"),
  ]);
  if (error) return { groups: [], error: error.message };
  const colorOf = (n: string) => (brands || []).find((b: any) => b.name.toLowerCase() === (n || "").toLowerCase())?.color || "#334155";
  const m = new Map<string, StockItem[]>();
  for (const t of tasks || []) {
    const cf = t.custom_fields || null;
    if (!cf || Object.keys(cf).length === 0) continue; // section headers / markers
    const item: StockItem = {
      name: t.name,
      code: field(cf, [/code/i, /sku/i]),
      status: field(cf, [/stock.*status/i, /^status$/i]),
      expected: field(cf, [/order/i, /eta/i, /arriv/i, /due/i]) || (t.due_on ? new Date(t.due_on + "T00:00:00").toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : null),
    };
    const sec = t.section || "General";
    m.set(sec, [...(m.get(sec) || []), item]);
  }
  const groups = [...m.entries()].map(([brand, items]) => ({ brand, color: colorOf(brand), items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return { groups };
}
