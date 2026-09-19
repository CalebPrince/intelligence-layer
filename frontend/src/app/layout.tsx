import type { Metadata } from "next";
import { Caveat, DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Display: a heavy geometric sans for headlines (matches the concept art).
// Body: a plainer humanist sans. Hand: marginal annotations on the landing page.
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const hand = Caveat({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Intelligence Layer",
  description: "One project, routed across multiple model perspectives.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable}`}>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
