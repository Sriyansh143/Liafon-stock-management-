import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

// Use system fonts only — no Google Fonts dependency.
// This avoids white-page issues when the network is slow or blocked,
// and makes the app fully usable offline (e.g. on a LAN without internet).
// Order matters: SF Pro on macOS, Segoe UI on Windows, Inter on Linux.
const systemFont =
  '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const monoFont =
  'ui-monospace, "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const metadata: Metadata = {
  title: {
    default: "Liafon Stock Management",
    template: "%s · Liafon",
  },
  description:
    "Complete auto spare parts shop management with inventory tracking, sales, purchases, multi-currency support, and WhatsApp integration.",
  keywords: [
    "auto parts",
    "spare parts",
    "inventory",
    "stock management",
    "WhatsApp",
    "liafon",
    "multi-currency",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Liafon",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline style to set system fonts immediately — no FOUC, no
            network dependency. Overrides the Tailwind --font-geist-sans
            variable that globals.css references. */}
        <style>{`
          :root {
            --font-geist-sans: ${systemFont};
            --font-geist-mono: ${monoFont};
            --font-sans: ${systemFont};
            --font-mono: ${monoFont};
          }
          html, body {
            font-family: ${systemFont};
          }
        `}</style>
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
