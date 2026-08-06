import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2, Manrope } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Sales Hub only — a friendlier, more visual pairing for the sales team's
// tools (rounded display face for headings, clean geometric sans for body).
const baloo = Baloo_2({
  variable: "--font-baloo",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://marketing.coolkidz.com.au"),
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Coolkidz" },
  title: "Brand Dashboard — Coolkidz Australia",
  description: "Live Shopify sales dashboard for all Coolkidz brands",
  openGraph: {
    title: "Brand Dashboard — Coolkidz Australia",
    description: "Live Shopify sales dashboard for all Coolkidz brands",
    url: "https://marketing.coolkidz.com.au",
    siteName: "Coolkidz Brand Dashboard",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 685, alt: "Coolkidz Brand Dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Brand Dashboard — Coolkidz Australia",
    description: "Live Shopify sales dashboard for all Coolkidz brands",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${baloo.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
