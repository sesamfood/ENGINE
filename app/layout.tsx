import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { BrowserBranding } from "@/components/browser-branding";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getToken } from "@/lib/auth-server";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SESAM ENGINE",
  applicationName: "SESAM ENGINE",
  description: "Administrer den daglige drift i din restaurantorganisation.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [initialToken, cookieStore] = await Promise.all([getToken(), cookies()]);
  const defaultSidebarOpen =
    cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <html
      lang="da"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
      )}
    >
      <body className="min-h-full">
        <ConvexClientProvider initialToken={initialToken}>
          <TooltipProvider>
            <BrowserBranding />
            <AppShell defaultSidebarOpen={defaultSidebarOpen}>
              {children}
            </AppShell>
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
