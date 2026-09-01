import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/middleware";

// [Source: architecture/frontend-architecture.md#Protected Route Pattern]
export async function middleware(request: NextRequest) {
  const { supabase, response } = createServerSupabaseClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/registro");
  // "/" se agrega a la lista pública además de lo que documenta Dev Notes:
  // es la página de estado de Story 1.1 (AC2, "accesible sin autenticación").
  // El patrón original del Dev Notes no la incluía — de aplicarse literal,
  // esta story rompería el AC2 ya validado de 1.1.
  const isPublicRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/api/health") ||
    isAuthRoute;

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
