import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_ID_HEADER, ACCOUNT_EMAIL_HEADER } from "@/lib/auth-headers";

// [Source: architecture/backend-architecture.md#Service Architecture — Server Action Template]
//
// El middleware ya corrió `supabase.auth.getUser()` (round-trip a Supabase
// Auth) para esta misma request y dejó la identidad verificada en headers
// internos (ver middleware.ts) — leerlos acá evita que cada una de las ~40
// Server Actions que llaman a esta función pague su propio round-trip
// redundante. Si los headers no llegaran (invocación fuera del middleware,
// p. ej. un test) se cae al chequeo directo contra Supabase como antes.
export async function getCurrentAccount(): Promise<{ id: string; email: string } | null> {
  const headerList = await headers();
  const id = headerList.get(ACCOUNT_ID_HEADER);
  const email = headerList.get(ACCOUNT_EMAIL_HEADER);
  if (id && email) return { id, email };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  return { id: user.id, email: user.email };
}
