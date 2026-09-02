"use client";

import { useState } from "react";
import { eliminarCuenta } from "@/actions/auth/eliminar-cuenta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const FRASE_CONFIRMACION = "ELIMINAR";

// Requiere escribir la frase de confirmación antes de habilitar el botón —
// es una acción irreversible que borra todos los negocios y datos de la
// cuenta (cascada desde auth.users, ver eliminar_cuenta_propia()).
export function EliminarCuentaButton() {
  const [confirmacion, setConfirmacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const habilitado = confirmacion === FRASE_CONFIRMACION;

  async function handleEliminar() {
    setEnviando(true);
    await eliminarCuenta();
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-danger p-4">
      <p className="text-sm text-danger">
        Esta acción elimina tu cuenta y todos tus negocios y datos de forma
        permanente. No se puede deshacer.
      </p>
      <label htmlFor="confirmacion-eliminar" className="text-sm">
        Escribí <span className="font-mono font-semibold">{FRASE_CONFIRMACION}</span> para confirmar
      </label>
      <Input
        id="confirmacion-eliminar"
        type="text"
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        className="w-full max-w-sm"
      />
      <Button
        type="button"
        variant="danger"
        disabled={!habilitado || enviando}
        onClick={handleEliminar}
        className="w-fit"
      >
        Eliminar cuenta
      </Button>
    </div>
  );
}
