"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarNegocio } from "@/actions/negocios/eliminar-negocio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";

export function EliminarNegocioButton({ negocioId, nombre }: { negocioId: string; nombre: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleConfirmar() {
    setIsPending(true);
    setError(null);
    const result = await eliminarNegocio(negocioId);
    setIsPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button type="button" variant="link" className="text-danger" onClick={() => setAbierto(true)}>
        Eliminar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar &quot;{nombre}&quot;?</DialogTitle>
          <DialogDescription>
            Esta acción es permanente: todos los datos del negocio (ventas, compras, gastos,
            cuentas por cobrar, inventario y caja) desaparecerán del sistema y no se pueden
            recuperar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" variant="danger" onClick={handleConfirmar} disabled={isPending}>
              {isPending ? "Eliminando..." : "Sí, eliminar todo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
