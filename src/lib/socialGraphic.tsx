import type { ReactElement } from "react";

// Branded post graphics for Social Writing drafts, rendered with next/og
// (Satori). Three layouts keep every brand recognisable and consistent:
//   bold  - solid brand colour, big two-tone statement
//   soft  - second brand colour, big two-tone statement
//   list  - white, brand bar, headline + checkbox list
// To switch on another brand, add its palette and logos below. Palettes come
// from each brand's guide; Outfit stands in for the brand typefaces.
export type GraphicCopy = { layout: "bold" | "soft" | "list"; kicker: string; line1: string; line2?: string; sub?: string; items?: string[]; cta: string };

type Look = { bg: string; fg: string; dim: string; ctaBg: string; ctaFg: string; logo: string };
type ListLook = { bar: string; kicker: string; ink: string; box: string; ctaBg: string; ctaFg: string; logo: string };
type BrandStyle = { bold: Look; soft: Look; list: ListLook };

export const GRAPHIC_BRANDS: Record<string, BrandStyle> = {
  Frida: {
    bold: { bg: "#4AC1E0", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#FFFFFF", ctaFg: "#2FA8C8", logo: "/logos/white/frida.png" },
    soft: { bg: "#C781B7", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#FFFFFF", ctaFg: "#A8579A", logo: "/logos/white/frida.png" },
    list: { bar: "#4AC1E0", kicker: "#4AC1E0", ink: "#5A6063", box: "#C781B7", ctaBg: "#4AC1E0", ctaFg: "#FFFFFF", logo: "/logos/Frida_logo_main.png" },
  },
  SmarTrike: {
    bold: { bg: "#41414E", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#E5E1E6", ctaFg: "#41414E", logo: "/logos/white/smartrike.png" },
    soft: { bg: "#C4BC9B", fg: "#41414E", dim: "rgba(65,65,78,0.55)", ctaBg: "#41414E", ctaFg: "#FFFFFF", logo: "/logos/Smartrike Logo.png" },
    list: { bar: "#C4BC9B", kicker: "#8C8460", ink: "#41414E", box: "#C4BC9B", ctaBg: "#41414E", ctaFg: "#FFFFFF", logo: "/logos/Smartrike Logo.png" },
  },
  Magic: {
    bold: { bg: "#788A8E", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#E2F1F4", ctaFg: "#4A5A5E", logo: "/logos/white/magic.png" },
    soft: { bg: "#C1CFD1", fg: "#3F4C4F", dim: "rgba(63,76,79,0.55)", ctaBg: "#3F4C4F", ctaFg: "#FFFFFF", logo: "/logos/MCC_logo_MAGIC_black_c.png" },
    list: { bar: "#788A8E", kicker: "#788A8E", ink: "#3F4C4F", box: "#788A8E", ctaBg: "#788A8E", ctaFg: "#FFFFFF", logo: "/logos/MCC_logo_MAGIC_black_c.png" },
  },
};

const headSize = (n: number) => (n <= 24 ? 150 : n <= 40 ? 128 : n <= 60 ? 108 : n <= 90 ? 90 : 74);

function Logo({ src, h }: { src: string; h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} height={h} style={{ height: h }} alt="" />;
}

export function buildGraphic(copy: GraphicCopy, brand: BrandStyle, logos: Record<string, string>, height: number): ReactElement {
  const font = "Outfit";
  const base = { width: 1080, height, display: "flex", flexDirection: "column" as const, padding: "90px 88px", fontFamily: font, position: "relative" as const };
  const footer = (logo: string, ctaBg: string, ctaFg: string) => (
    <div style={{ position: "absolute", left: 88, right: 88, bottom: 84, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo src={logo} h={70} />
      <div style={{ display: "flex", background: ctaBg, color: ctaFg, fontWeight: 600, fontSize: 30, padding: "20px 38px", borderRadius: 60 }}>{copy.cta}</div>
    </div>
  );

  if (copy.layout === "list") {
    const l = brand.list;
    const items = (copy.items ?? []).slice(0, 4);
    return (
      <div style={{ ...base, background: "#FFFFFF", color: l.ink }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 26, background: l.bar, display: "flex" }} />
        <div style={{ display: "flex", marginTop: 20, fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: "uppercase", color: l.kicker }}>{copy.kicker}</div>
        <div style={{ display: "flex", marginTop: 40, fontWeight: 800, fontSize: headSize(copy.line1.length) * 0.8, lineHeight: 1.04, letterSpacing: -2 }}>{copy.line1}</div>
        {copy.sub ? <div style={{ display: "flex", marginTop: 44, fontWeight: 300, fontSize: 40, lineHeight: 1.35, maxWidth: 820 }}>{copy.sub}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
          {items.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 600, padding: "15px 0", borderBottom: "2px dashed #DDE0E2" }}>
              <div style={{ display: "flex", width: 44, height: 44, borderRadius: 10, border: `4px solid ${l.box}`, marginRight: 26 }} />
              {t}
            </div>
          ))}
        </div>
        {footer(logos[l.logo], l.ctaBg, l.ctaFg)}
      </div>
    );
  }

  const l = copy.layout === "soft" ? brand.soft : brand.bold;
  const size = headSize(copy.line1.length + (copy.line2?.length ?? 0) / 1.5);
  return (
    <div style={{ ...base, background: l.bg, color: l.fg }}>
      <div style={{ display: "flex", fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85 }}>{copy.kicker}</div>
      <div style={{ display: "flex", marginTop: 70, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -2 }}>{copy.line1}</div>
      {copy.line2 ? <div style={{ display: "flex", marginTop: 44, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -2, color: l.dim }}>{copy.line2}</div> : null}
      {footer(logos[l.logo], l.ctaBg, l.ctaFg)}
    </div>
  );
}
