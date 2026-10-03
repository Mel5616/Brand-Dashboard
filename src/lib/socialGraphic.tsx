import type { ReactElement } from "react";

// Branded post graphics for Social Writing drafts, rendered with next/og
// (Satori). Three layouts keep every brand recognisable and consistent:
//   bold  - solid brand colour, big two-tone statement
//   soft  - second brand colour, big two-tone statement
//   list  - white, brand bar, headline + checkbox list
//   photo - brand colour, product photo on a white card, headline below
//   point - white, brand bar, headline + body copy, optional photo (carousel slides)
// To switch on another brand, add its palette and logos below. Palettes come
// from each brand's guide; Outfit stands in for the brand typefaces.
export type GraphicCopy = { layout: "bold" | "soft" | "list" | "photo" | "point"; kicker: string; line1: string; line2?: string; sub?: string; items?: string[]; cta: string; photo?: string; photoFit?: "cover" | "contain"; photoAspect?: number; progress?: { i: number; n: number } };

type LogoRef = { src: string; w: number; h: number };
type Look = { bg: string; fg: string; dim: string; ctaBg: string; ctaFg: string; logo: LogoRef };
type ListLook = { bar: string; kicker: string; ink: string; box: string; ctaBg: string; ctaFg: string; logo: LogoRef };
type BrandStyle = { bold: Look; soft: Look; list: ListLook };

// Trimmed transparent logos in public/logos/graphic, sized to fit a 340x100 box.
const L = (name: string, w: number, h: number): LogoRef => ({ src: `/logos/graphic/${name}.png`, w, h });
const LOGO = {
  fridaW: L("frida-white", 251, 100), fridaD: L("frida-dark", 252, 100),
  smartrikeW: L("smartrike-white", 340, 51), smartrikeD: L("smartrike-dark", 340, 51),
  magicW: L("magic-white", 325, 100), magicD: L("magic-dark", 326, 100),
  uppababyW: L("uppababy-white", 340, 56), uppababyD: L("uppababy-dark", 340, 56),
  gaiaW: L("gaia-white", 267, 100), gaiaD: L("gaia-dark", 268, 100),
  wonderfoldW: L("wonderfold-white", 340, 36), wonderfoldD: L("wonderfold-dark", 340, 36),
  zazuW: L("zazu-white", 340, 94), zazuD: L("zazu-dark", 100, 100),
  matchstickW: L("matchstick-white", 310, 100), matchstickD: L("matchstick-dark", 310, 100),
  miamilyW: L("miamily-white", 340, 82), miamilyD: L("miamily-dark", 340, 83),
  mamaveW: L("mamave-white", 340, 53), mamaveD: L("mamave-dark", 340, 53),
  hannieW: L("hannie-white", 340, 82), hannieD: L("hannie-dark", 340, 82),
  nanitW: L("nanit-white", 288, 100), nanitD: L("nanit-dark", 340, 94),
};

// Keys match SOCIAL_VOICE in src/app/api/social-drafts/route.ts. Frida, SmarTrike,
// Magic, ZAZU and WonderFold use palettes from the brand guides and site work.
// The others are taken from the brand logos / profile images (no guide on file),
// so check them against the brand book before heavy use.
export const GRAPHIC_BRANDS: Record<string, BrandStyle> = {
  Frida: {
    bold: { bg: "#4AC1E0", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#FFFFFF", ctaFg: "#2FA8C8", logo: LOGO.fridaW },
    soft: { bg: "#C781B7", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#FFFFFF", ctaFg: "#A8579A", logo: LOGO.fridaW },
    list: { bar: "#4AC1E0", kicker: "#4AC1E0", ink: "#5A6063", box: "#C781B7", ctaBg: "#4AC1E0", ctaFg: "#FFFFFF", logo: LOGO.fridaD },
  },
  SmarTrike: {
    bold: { bg: "#41414E", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#E5E1E6", ctaFg: "#41414E", logo: LOGO.smartrikeW },
    soft: { bg: "#C4BC9B", fg: "#41414E", dim: "rgba(65,65,78,0.55)", ctaBg: "#41414E", ctaFg: "#FFFFFF", logo: LOGO.smartrikeD },
    list: { bar: "#C4BC9B", kicker: "#8C8460", ink: "#41414E", box: "#C4BC9B", ctaBg: "#41414E", ctaFg: "#FFFFFF", logo: LOGO.smartrikeD },
  },
  Magic: {
    bold: { bg: "#788A8E", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#E2F1F4", ctaFg: "#4A5A5E", logo: LOGO.magicW },
    soft: { bg: "#C1CFD1", fg: "#3F4C4F", dim: "rgba(63,76,79,0.55)", ctaBg: "#3F4C4F", ctaFg: "#FFFFFF", logo: LOGO.magicD },
    list: { bar: "#788A8E", kicker: "#788A8E", ink: "#3F4C4F", box: "#788A8E", ctaBg: "#788A8E", ctaFg: "#FFFFFF", logo: LOGO.magicD },
  },
  ZAZU: {
    bold: { bg: "#EC312F", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#FFFFFF", ctaFg: "#EC312F", logo: LOGO.zazuW },
    soft: { bg: "#F4F2EF", fg: "#231F20", dim: "rgba(35,31,32,0.5)", ctaBg: "#EC312F", ctaFg: "#FFFFFF", logo: LOGO.zazuD },
    list: { bar: "#EC312F", kicker: "#EC312F", ink: "#231F20", box: "#EC312F", ctaBg: "#EC312F", ctaFg: "#FFFFFF", logo: LOGO.zazuD },
  },
  WonderFold: {
    bold: { bg: "#063537", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#E2EAE6", ctaFg: "#063537", logo: LOGO.wonderfoldW },
    soft: { bg: "#E2EAE6", fg: "#063537", dim: "rgba(6,53,55,0.5)", ctaBg: "#063537", ctaFg: "#FFFFFF", logo: LOGO.wonderfoldD },
    list: { bar: "#96603A", kicker: "#96603A", ink: "#063537", box: "#96603A", ctaBg: "#063537", ctaFg: "#FFFFFF", logo: LOGO.wonderfoldD },
  },
  "Gaia Baby": {
    bold: { bg: "#607860", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#F4F1E8", ctaFg: "#34402A", logo: LOGO.gaiaW },
    soft: { bg: "#DDE3C8", fg: "#34402A", dim: "rgba(52,64,42,0.5)", ctaBg: "#34402A", ctaFg: "#FFFFFF", logo: LOGO.gaiaD },
    list: { bar: "#9CA884", kicker: "#607860", ink: "#34402A", box: "#9CA884", ctaBg: "#607860", ctaFg: "#FFFFFF", logo: LOGO.gaiaD },
  },
  UPPAbaby: {
    bold: { bg: "#486078", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#FFFFFF", ctaFg: "#2E3F50", logo: LOGO.uppababyW },
    soft: { bg: "#E6EBF0", fg: "#2E3F50", dim: "rgba(46,63,80,0.5)", ctaBg: "#2E3F50", ctaFg: "#FFFFFF", logo: LOGO.uppababyD },
    list: { bar: "#486078", kicker: "#486078", ink: "#2E3F50", box: "#486078", ctaBg: "#486078", ctaFg: "#FFFFFF", logo: LOGO.uppababyD },
  },
  MiaMily: {
    bold: { bg: "#D80024", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#FFFFFF", ctaFg: "#D80024", logo: LOGO.miamilyW },
    soft: { bg: "#F2F2F2", fg: "#181818", dim: "rgba(24,24,24,0.45)", ctaBg: "#D80024", ctaFg: "#FFFFFF", logo: LOGO.miamilyD },
    list: { bar: "#D80024", kicker: "#D80024", ink: "#181818", box: "#D80024", ctaBg: "#181818", ctaFg: "#FFFFFF", logo: LOGO.miamilyD },
  },
  "Matchstick Monkey": {
    bold: { bg: "#6C7878", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#F0E4D8", ctaFg: "#4A5555", logo: LOGO.matchstickW },
    soft: { bg: "#E4D8CC", fg: "#4A5555", dim: "rgba(74,85,85,0.5)", ctaBg: "#4A5555", ctaFg: "#FFFFFF", logo: LOGO.matchstickD },
    list: { bar: "#6C7878", kicker: "#6C7878", ink: "#4A5555", box: "#6C7878", ctaBg: "#6C7878", ctaFg: "#FFFFFF", logo: LOGO.matchstickD },
  },
  Mamave: {
    bold: { bg: "#D86048", fg: "#FFFFFF", dim: "rgba(255,255,255,0.6)", ctaBg: "#FFFFFF", ctaFg: "#B84A34", logo: LOGO.mamaveW },
    soft: { bg: "#8A3F2F", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#F6E6DF", ctaFg: "#8A3F2F", logo: LOGO.mamaveW },
    list: { bar: "#D86048", kicker: "#B84A34", ink: "#6B3427", box: "#D86048", ctaBg: "#B84A34", ctaFg: "#FFFFFF", logo: LOGO.mamaveD },
  },
  Hannie: {
    bold: { bg: "#181818", fg: "#FFFFFF", dim: "rgba(255,255,255,0.5)", ctaBg: "#FFFFFF", ctaFg: "#181818", logo: LOGO.hannieW },
    soft: { bg: "#EDEDED", fg: "#181818", dim: "rgba(24,24,24,0.45)", ctaBg: "#181818", ctaFg: "#FFFFFF", logo: LOGO.hannieD },
    list: { bar: "#181818", kicker: "#6A6A6A", ink: "#181818", box: "#181818", ctaBg: "#181818", ctaFg: "#FFFFFF", logo: LOGO.hannieD },
  },
  Nanit: {
    bold: { bg: "#24486C", fg: "#FFFFFF", dim: "rgba(255,255,255,0.55)", ctaBg: "#FFFFFF", ctaFg: "#24486C", logo: LOGO.nanitW },
    soft: { bg: "#E4ECF3", fg: "#24486C", dim: "rgba(36,72,108,0.5)", ctaBg: "#24486C", ctaFg: "#FFFFFF", logo: LOGO.nanitD },
    list: { bar: "#24486C", kicker: "#24486C", ink: "#24486C", box: "#24486C", ctaBg: "#24486C", ctaFg: "#FFFFFF", logo: LOGO.nanitD },
  },
};

// Largest font size (down to a floor) at which the given lines fit the width and
// height budget, so headlines can never run into the footer.
function fitSize(lines: string[], width: number, maxH: number, start: number, floor = 44): number {
  for (let s = start; s >= floor; s -= 4) {
    const count = lines.reduce((n, l) => n + (l ? Math.max(1, Math.ceil((l.length * s * 0.55) / width)) : 0), 0);
    if (count * s * 1.08 + (lines.filter(Boolean).length - 1) * 14 <= maxH) return s;
  }
  return floor;
}

const headSize = (n: number) => (n <= 24 ? 150 : n <= 40 ? 128 : n <= 60 ? 108 : n <= 90 ? 90 : 74);

function Logo({ src, w, h }: { src: string; w: number; h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={w} height={h} style={{ width: w, height: h }} alt="" />;
}

export function buildGraphic(copy: GraphicCopy, brand: BrandStyle, logos: Record<string, string>, height: number): ReactElement {
  const font = "Outfit";
  const tall = height > 1500;
  const base = { width: 1080, height, display: "flex", flexDirection: "column" as const, padding: "90px 88px", fontFamily: font, position: "relative" as const };
  // Carousel slides show progress dots on the right; the last slide (and any
  // single post) shows the call-to-action button instead.
  const footer = (logo: LogoRef, ctaBg: string, ctaFg: string, dotOn: string, dotOff: string) => (
    <div style={{ position: "absolute", left: 88, right: 88, bottom: 84, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Logo src={logos[logo.src]} w={logo.w} h={logo.h} />
      {copy.progress && copy.progress.i < copy.progress.n - 1 ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          {Array.from({ length: copy.progress.n }).map((_, k) => (
            <div key={k} style={{ display: "flex", width: k === copy.progress!.i ? 34 : 14, height: 14, borderRadius: 7, marginLeft: 10, background: k === copy.progress!.i ? dotOn : dotOff }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", background: ctaBg, color: ctaFg, fontWeight: 600, fontSize: 30, padding: "20px 38px", borderRadius: 60 }}>{copy.cta}</div>
      )}
    </div>
  );
  // Landscape photos fill the card; portrait ones keep their own shape (no white
  // bars), centred on the brand colour with rounded corners.
  const photoCard = (h: number) => {
    const shaped = copy.photoFit !== "cover" && copy.photoAspect && copy.photoAspect < 1.6;
    const w = shaped ? Math.min(904, Math.round(h * (copy.photoAspect as number))) : 904;
    return (
      <div style={{ display: "flex", width: 904, height: h, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: w, height: h, background: "#FFFFFF", borderRadius: 36, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={copy.photo} style={{ width: w, height: h, objectFit: shaped ? "cover" : copy.photoFit ?? "contain" }} alt="" />
        </div>
      </div>
    );
  };

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
        {footer(l.logo, l.ctaBg, l.ctaFg, l.bar, "#DDE0E2")}
      </div>
    );
  }

  if (copy.layout === "point") {
    const l = brand.list;
    const hasPhoto = !!copy.photo;
    return (
      <div style={{ ...base, background: "#FFFFFF", color: l.ink }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 26, background: l.bar, display: "flex" }} />
        <div style={{ display: "flex", marginTop: 20, fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: "uppercase", color: l.kicker }}>{copy.kicker}</div>
        <div style={{ display: "flex", marginTop: 36, fontWeight: 800, fontSize: headSize(copy.line1.length) * (hasPhoto ? 0.62 : 0.85), lineHeight: 1.04, letterSpacing: -2 }}>{copy.line1}</div>
        {copy.sub ? <div style={{ display: "flex", marginTop: 32, fontWeight: 300, fontSize: hasPhoto ? 36 : 46, lineHeight: 1.35, maxWidth: 880 }}>{copy.sub}</div> : null}
        {hasPhoto ? <div style={{ display: "flex", marginTop: 44 }}>{photoCard(tall ? 760 : 520)}</div> : null}
        {footer(l.logo, l.ctaBg, l.ctaFg, l.bar, "#DDE0E2")}
      </div>
    );
  }

  const l = copy.layout === "soft" ? brand.soft : brand.bold;
  const dotOn = l.fg;
  if (copy.layout === "photo" && copy.photo) {
    const maxH = tall ? 860 : 640;
    // landscape photos get a card close to their own shape so little is cropped
    const cardH = copy.photoFit === "cover" && copy.photoAspect ? Math.min(maxH, Math.max(480, Math.round(904 / copy.photoAspect))) : maxH;
    // space between the photo card and the footer (logo row sits 84px up, 104px tall)
    const avail = height - 90 - 30 - 36 - cardH - 44 - (84 + 104 + 36);
    const size = fitSize([copy.line1, copy.line2 ?? ""], 904, avail, 88);
    return (
      <div style={{ ...base, background: l.bg, color: l.fg }}>
        <div style={{ display: "flex", fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85 }}>{copy.kicker}</div>
        <div style={{ display: "flex", marginTop: 36 }}>{photoCard(cardH)}</div>
        <div style={{ display: "flex", marginTop: 44, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: -2 }}>{copy.line1}</div>
        {copy.line2 ? <div style={{ display: "flex", marginTop: 14, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: -2, color: l.dim }}>{copy.line2}</div> : null}
        {footer(l.logo, l.ctaBg, l.ctaFg, dotOn, l.dim)}
      </div>
    );
  }
  const size = headSize(copy.line1.length + (copy.line2?.length ?? 0) / 1.5);
  return (
    <div style={{ ...base, background: l.bg, color: l.fg }}>
      <div style={{ display: "flex", fontWeight: 600, fontSize: 26, letterSpacing: 5, textTransform: "uppercase", opacity: 0.85 }}>{copy.kicker}</div>
      <div style={{ display: "flex", marginTop: 70, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -2 }}>{copy.line1}</div>
      {copy.line2 ? <div style={{ display: "flex", marginTop: 44, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -2, color: l.dim }}>{copy.line2}</div> : null}
      {footer(l.logo, l.ctaBg, l.ctaFg, dotOn, l.dim)}
    </div>
  );
}
