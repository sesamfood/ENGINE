import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AppRouteShell } from "@/components/app-route-shell";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateAvailableNotice } from "@/components/update-available-notice";
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
  title: "Driftsplatform",
  applicationName: "Driftsplatform",
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
            <AppRouteShell defaultSidebarOpen={defaultSidebarOpen}>
              {children}
            </AppRouteShell>
            <Toaster position="top-right" richColors />
            <UpdateAvailableNotice />
          </TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
