import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth-server";

const publicPaths = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invitation",
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  const publicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const authenticated = await isAuthenticated();

  if (!authenticated && !publicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
