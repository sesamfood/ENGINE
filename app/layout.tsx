import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { AppRouteShell } from "@/components/app-route-shell";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { PwaRegistration } from "@/components/pwa-registration";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UpdateAvailableNotice } from "@/components/update-available-notice";
import { getToken } from "@/lib/auth-server";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SESAM ENGINE",
  applicationName: "ENGINE",
  description: "Administrér den daglige drift i din restaurantorganisation.",
  appleWebApp: {
    capable: true,
    title: "ENGINE",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#252525" },
  ],
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
        <PwaRegistration />
      </body>
    </html>
  );
}
