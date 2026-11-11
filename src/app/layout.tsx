import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: `${brand.tagline} Shop on your own, understand what you're buying, and let your own rules decide when someone you trust takes a second look. Payments by PayPal.`,
};

export const viewport: Viewport = { themeColor: "#0151c9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-dvh bg-white">
        {/* Keyboard users skip the repeated header and navigation (WCAG 2.4.1). */}
        <a href="#main" className="sr-only rounded-xl bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
