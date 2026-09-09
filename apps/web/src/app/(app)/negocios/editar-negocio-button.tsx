"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { editarNegocioSchema, type EditarNegocioInput } from "@repo/domain/schemas";
import { editarNegocio } from "@/actions/negocios/editar-negocio";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ImagenUpload = dynamic(
  () => import("@/components/imagen-upload").then((m) => m.ImagenUpload),
  { ssr: false }
);

export function EditarNegocioButton({
  negocioId,
  nombreActual,
  logoUrlActual,
}: {
  negocioId: string;
  nombreActual: string;
  logoUrlActual: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditarNegocioInput>({
    resolver: zodResolver(editarNegocioSchema),
    defaultValues: { negocioId, nombre: nombreActual, logoUrl: logoUrlActual },
  });

  function onOpenChange(open: boolean) {
    setAbierto(open);
    if (open) {
      setServerMessage(null);
      reset({ negocioId, nombre: nombreActual, logoUrl: logoUrlActual });
    }
  }

  async function onSubmit(data: EditarNegocioInput) {
    setServerMessage(null);
    const result = await editarNegocio(data);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <Button type="button" variant="link" onClick={() => onOpenChange(true)}>
        Editar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar negocio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          <FormField htmlFor="editar-nombre" label="Nombre del negocio" error={errors.nombre?.message}>
            <Input id="editar-nombre" type="text" {...register("nombre")} />
          </FormField>
          <Controller
            control={control}
            name="logoUrl"
            render={({ field }) => (
              <ImagenUpload
                value={field.value ?? null}
                onChange={field.onChange}
                folder="negocios"
                label="Logo del negocio"
              />
            )}
          />
          {serverMessage && (
            <p role="alert" className="text-sm text-danger">
              {serverMessage}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting} className="w-fit">
            Guardar cambios
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
