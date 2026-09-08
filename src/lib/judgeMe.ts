// Judge.me reviews client. Per-brand config comes from JUDGEME_API_TOKENS
// (env, JSON array of {id, apiToken, shopDomain}) — shopDomain is carried
// here rather than borrowed from SHOPIFY_CLIENT_CREDS, since a brand's
// Judge.me-connected store isn't guaranteed to be the same store the
// dashboard's other Shopify integrations point at (confirmed true for
// Frida: the dashboard's existing credential was frida-9824.myshopify.com,
// but the real live store Judge.me connected to is aqegfh-j1.myshopify.com).
const BASE_READ = "https://api.judge.me/api/v1";
const BASE_WRITE = "https://judge.me/api/v1";

type JudgeMeConfig = { id: number; apiToken: string; shopDomain: string };

function configs(): JudgeMeConfig[] {
  try { return JSON.parse(process.env.JUDGEME_API_TOKENS || "[]"); } catch { return []; }
}

function configForBrand(brandId: number): JudgeMeConfig | undefined {
  return configs().find(c => c.id === brandId);
}

export function judgeMeTokenForBrand(brandId: number): string | undefined {
  return configForBrand(brandId)?.apiToken;
}

export function judgeMeConfigured(brandId: number): boolean {
  const c = configForBrand(brandId);
  return !!c?.apiToken && !!c?.shopDomain;
}

export async function listJudgeMeReviews(brandId: number, perPage = 25) {
  const c = configForBrand(brandId);
  if (!c?.apiToken || !c?.shopDomain) return null;
  const url = `${BASE_READ}/reviews?api_token=${encodeURIComponent(c.apiToken)}&shop_domain=${encodeURIComponent(c.shopDomain)}&per_page=${perPage}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function createJudgeMeReview(brandId: number, opts: {
  name: string; email: string; rating: number; body: string; title?: string; productId?: string | number;
}): Promise<{ ok: boolean; error?: string }> {
  const c = configForBrand(brandId);
  if (!c?.apiToken || !c?.shopDomain) return { ok: false, error: "Judge.me isn't set up for this brand yet" };
  const body: Record<string, unknown> = {
    api_token: c.apiToken, shop_domain: c.shopDomain, platform: "shopify",
    name: opts.name, email: opts.email, rating: opts.rating, body: opts.body,
  };
  if (opts.title) body.title = opts.title;
  if (opts.productId) body.id = opts.productId;
  const res = await fetch(`${BASE_WRITE}/reviews`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: (await res.text()).slice(0, 250) };
  return { ok: true };
}
