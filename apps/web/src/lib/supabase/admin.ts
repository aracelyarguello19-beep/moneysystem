import { createClient } from "@supabase/supabase-js";

// Cliente Supabase Admin (service_role) — uso EXCLUSIVO: enumerar cuentas
// (auth.users) para el job de cierre de período (Story 6.2, ADR-001). El
// Prisma `prisma` singleton de `@repo/database` se conecta como `app_user`
// (NOBYPASSRLS) y nunca puede listar cuentas de otros usuarios — este
// cliente resuelve esa enumeración a nivel de Auth, no de datos. Ninguna
// operación sobre datos financieros pasa por acá: esas siguen yendo
// exclusivamente por `withRlsContext` (Prisma + RLS), nunca por este
// cliente admin.
// [Source: ADR-001 (.ai/adr-001-cierre-de-periodo-automatico.md), architecture/backend-architecture.md#Database Architecture]
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
