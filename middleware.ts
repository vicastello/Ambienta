import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Allow /api/sync/direct without authentication
  if (request.nextUrl.pathname === "/api/sync/direct") {
    // Don't require authentication for this endpoint
    const response = NextResponse.next();
    // Set a header to bypass Vercel protection
    response.headers.set("x-vercel-skip-deployment-protection", "true");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
