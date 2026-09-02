"use server";

import { redirect } from "next/navigation";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Borra la fila propia de `auth.users` vía `eliminar_cuenta_propia()`
// (SECURITY DEFINER — ver migración 20260901190000). Eso cascadea a
// `public.cuentas` y de ahí a todos los datos de la cuenta (negocios,
// ventas, gastos, etc.). No usa `withErrorHandling`: si algo falla acá no
// hay un mensaje "genérico" razonable que mostrar — se deja propagar y lo
// muestra el error boundary de la ruta.
export async function eliminarCuenta(): Promise<void> {
  const cuenta = await getCurrentAccount();
  if (!cuenta) redirect("/login");

  await withRlsContext(cuenta.id, null, (tx) =>
    tx.$executeRawUnsafe("select public.eliminar_cuenta_propia()")
  );

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/login");
}
