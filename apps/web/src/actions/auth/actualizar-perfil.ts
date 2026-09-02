"use server";

import { revalidatePath } from "next/cache";
import { actualizarPerfilSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const actualizarPerfil = withErrorHandling(async (input: unknown): Promise<void> => {
  const parsed = actualizarPerfilSchema.parse(input);

  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  await withRlsContext(cuenta.id, null, (tx) =>
    tx.cuenta.update({ where: { id: cuenta.id }, data: { nombre: parsed.nombre } })
  );

  revalidatePath("/perfil");
});
