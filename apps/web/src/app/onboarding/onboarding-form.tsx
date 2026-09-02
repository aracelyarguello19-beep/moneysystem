"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearNegocio } from "@/actions/negocios/crear-negocio";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

// Onboarding mínimo: un solo campo. El tipo del negocio (Mixto/Productos/
// Servicios) se define después desde Negocios — acá solo importa arrancar
// rápido con el nombre de la primera tienda.
export function OnboardingForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await crearNegocio({ nombre, tipo: "MIXTO" });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.push("/laboral/ventas");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField htmlFor="nombre-tienda" label="Nombre de tu primera tienda" error={error ?? undefined}>
        <Input
          id="nombre-tienda"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          autoFocus
        />
      </FormField>
      <Button type="submit" disabled={isSubmitting || !nombre.trim()}>
        Comenzar
      </Button>
    </form>
  );
}
