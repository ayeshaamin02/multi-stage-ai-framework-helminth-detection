import type { Metadata, Viewport } from "next";
import { AppToaster } from "@/components/app-toaster";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Matches `globals.css` root canvas — avoids white flash before CSS vars resolve (Safari). */
const CANVAS_CREAM = "#faf5eb";

export const viewport: Viewport = {
  themeColor: CANVAS_CREAM,
};

export const metadata: Metadata = {
  title: {
    default: "Helminth Detection: Clinical microscopy assistant",
    template: "%s · Helminth Detection",
  },
  description:
    "Upload microscopic slides, run staged fecal detection, binary classification, and multi class overlays, built for clinical workflows.",
  openGraph: {
    title: "Helminth Detection",
    description:
      "AI assisted microscopy: fecal screening, binary review, and localized multi class findings for licensed clinicians.",
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
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: CANVAS_CREAM }}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col font-sans"
        style={{ backgroundColor: CANVAS_CREAM }}
      >
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
