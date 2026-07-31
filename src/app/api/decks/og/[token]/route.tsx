import { ImageResponse } from "next/og";

// PUBLIC: the link-preview image for a shared deck (Outlook/Teams/iMessage
// unfurls). If a first-slide cover exists in storage (deck-assets/
// deck-<id>-cover.png) it's proxied through; otherwise a branded card is
// generated from the deck's title.
export const revalidate = 0;
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(token) || !sbUrl || !sbKey) return new Response(null, { status: 404 });
  const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
  const share = (await fetch(`${sbUrl}/rest/v1/deck_shares?token=eq.${token}&select=deck_id&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  if (!share) return new Response(null, { status: 404 });

  const coverUrl = `${sbUrl}/storage/v1/object/public/deck-assets/deck-${share.deck_id}-cover.png`;
  const cover = await fetch(coverUrl, { cache: "no-store" }).catch(() => null);
  if (cover?.ok) {
    return new Response(await cover.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
    });
  }

  const deck = (await fetch(`${sbUrl}/rest/v1/decks?id=eq.${share.deck_id}&select=title,brand&limit=1`, { headers: h, cache: "no-store" }).then(r => r.json()).catch(() => []))[0];
  const title = deck?.title || "Launch deck";
  const brand = deck?.brand || "";
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "64px 72px",
        background: "linear-gradient(120deg, #132741 0%, #1d3a5f 100%)", color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, fontWeight: 700, color: "#6ee7b7", textTransform: "uppercase" }}>
          Coolkidz Australia · Launch Plan
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          {brand ? <div style={{ display: "flex", fontSize: 32, color: "#94a3b8" }}>{brand}</div> : null}
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#64748b" }}>
          🔒 Confidential — email required to view
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
