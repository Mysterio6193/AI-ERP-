import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
