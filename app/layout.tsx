import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";
import LayoutShell from "./LayoutShell";
import { siteUrl } from "@/lib/site-url";

const titleFont = Caveat({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-title",
});

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const SITE_DESCRIPTION =
  "Fine line & custom tattoos in Santa Clarita, CA.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Starlet Tattoos",
    template: "%s | Starlet Tattoos",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "Starlet Tattoos",
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "Starlet Tattoos",
    images: ["/starletlogo.jpg"],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Starlet Tattoos",
    description: SITE_DESCRIPTION,
    images: ["/starletlogo.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${titleFont.variable} ${bodyFont.variable}`}>
      <body className="antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
