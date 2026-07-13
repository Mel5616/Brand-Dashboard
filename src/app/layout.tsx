import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://marketing.coolkidz.com.au"),
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
