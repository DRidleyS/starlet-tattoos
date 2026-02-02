import type { Metadata } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";
import Footer from "../components/Footer";

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

export const metadata: Metadata = {
  title: "Starlet Tattoos",
  description:
    "Starlet Tattoos - Fine line & Custom Tattoos - Santa Clarita CA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${titleFont.variable} ${bodyFont.variable}`}>
      <body className="antialiased">
        <div style={{ paddingBottom: "10rem" }}>{children}</div>
        <Footer />
      </body>
    </html>
  );
}
