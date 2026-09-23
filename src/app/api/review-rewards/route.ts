import { NextResponse } from "next/server";
import { getAccess } from "@/lib/access";
import { rest } from "@/lib/registry";
import { REWARD, REWARD_BRANDS, sweepRewards, type RewardRow } from "@/lib/reviewRewards";

// Review rewards card (Discount Codes tab): every issued reward, redemption swept across all brand stores.
export const revalidate = 0;
export const maxDuration = 60;
export async function GET(req: Request) {
  const acc = await getAccess();
  if (!(acc.role === "admin" || (acc.allowedTabs ?? []).some(t => t === "cross-site-discounts" || t === "discount-codes"))) return NextResponse.json({ ok: false }, { status: 403 });
  const force = new URL(req.url).searchParams.get("sweep") === "1";
  const res = await rest("review_rewards?select=*&order=issued_at.desc&limit=1000");
  if (!res.ok) { const text = await res.text(); return NextResponse.json({ ok: true, needsSetup: /PGRST205|does not exist/i.test(text), rows: [], config: REWARD, brands: REWARD_BRANDS }); }
  const rows = (await res.json()) as RewardRow[];
  await sweepRewards(rows, force);
  return NextResponse.json({ ok: true, rows, config: REWARD, brands: REWARD_BRANDS });
}
