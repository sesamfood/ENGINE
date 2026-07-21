import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/__clerk" || pathname.startsWith("/__clerk/")) return;

  if (pathname === "/organization" || pathname.startsWith("/organization/")) {
    await auth.protect({ role: "org:admin" });
    return;
  }

  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
