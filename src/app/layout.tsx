import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "B2B Distribution Operating System",
  description: "Comprehensive B2B distribution operating system for wholesalers, distributors, and FMCG suppliers. Manage products, inventory, customers, orders, and invoices.",
  keywords: ["B2B", "Distribution", "ERP", "Inventory", "Wholesale", "FMCG", "Supply Chain"],
  authors: [{ name: "White-label SaaS Platform" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (let registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        {/*
          THESIS: An Autonomous Operations Command Terminal that replaces generic SaaS cards with high-craft, luminous glass telemetry and live event pipelines.
          OWN-WORLD: Obsidian canvas (#070a12), deep frosted cards (#0b101d), luminous status pulses, precision metric widgets, and electric blue/emerald telemetry accents.
          STORY: The operator sees real-time supply chain heartbeat, tracks wave-picking and dispatch pipelines, and triggers AI autonomous actions without friction.
          FIRST VIEWPORT: High-density command bar with live heartbeat pulse, 4-tier telemetry pulse matrix, interactive visual fulfillment radar, and tabbed operational intelligence center.
          FORM: Autonomous Command Terminal (Candidate 4, Seed 1af67f24).
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
        */}
        <ThemeProvider defaultTheme="dark">
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
