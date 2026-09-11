import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/middleware";
import { ACCOUNT_ID_HEADER, ACCOUNT_EMAIL_HEADER } from "@/lib/auth-headers";

// [Source: architecture/frontend-architecture.md#Protected Route Pattern]
export async function middleware(request: NextRequest) {
  const { supabase, response } = createServerSupabaseClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/registro") ||
    request.nextUrl.pathname.startsWith("/recuperar-contrasena") ||
    request.nextUrl.pathname.startsWith("/restablecer-contrasena");
  // "/" se agrega a la lista pública además de lo que documenta Dev Notes:
  // es la página de estado de Story 1.1 (AC2, "accesible sin autenticación").
  // El patrón original del Dev Notes no la incluía — de aplicarse literal,
  // esta story rompería el AC2 ya validado de 1.1.
  //
  // "/restablecer-contrasena" es pública aunque solo sirve con una sesión
  // de recuperación activa: el enlace del email trae los tokens en el
  // fragmento de la URL, que el servidor nunca ve, así que en el primer
  // request (antes de que el cliente los procese) todavía no hay `user` —
  // si no fuera pública, este middleware redirigiría a /login antes de que
  // la página tuviera la chance de establecer la sesión.
  const isPublicRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/api/health") ||
    request.nextUrl.pathname.startsWith("/design-system") ||
    isAuthRoute;

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!user) return response;

  // Propaga la identidad ya verificada acá (único `auth.getUser()` — round-trip
  // a Supabase Auth — por navegación) a las Server Actions de la misma request
  // vía un header interno de `request`, no de `response`: `headers()` en un
  // Server Component/Action lee lo que el middleware fija en el `request` que
  // pasa a `NextResponse.next`, nunca lo que trajo el cliente, así que un
  // header con este nombre enviado por el cliente no puede suplantar esto.
  // Sin esto, `getCurrentAccount()` (lib/auth.ts) volvía a pagar su propio
  // `auth.getUser()` en cada una de las ~40 Server Actions que la usan.
  const headers = new Headers(request.headers);
  headers.set(ACCOUNT_ID_HEADER, user.id);
  headers.set(ACCOUNT_EMAIL_HEADER, user.email ?? "");

  const forwarded = NextResponse.next({ request: { headers } });
  for (const cookie of response.cookies.getAll()) {
    forwarded.cookies.set(cookie);
  }
  return forwarded;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
