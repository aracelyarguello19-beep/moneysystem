"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archivarNegocio } from "@/actions/negocios/archivar-negocio";
import { Button } from "@/components/ui/button";

export function ArchivarNegocioButton({ negocioId }: { negocioId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    setError(null);
    const result = await archivarNegocio(negocioId);
    setIsPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button type="button" variant="link" className="text-danger" onClick={handleClick} disabled={isPending}>
        Archivar
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
