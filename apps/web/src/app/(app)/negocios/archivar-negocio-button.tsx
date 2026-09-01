"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { archivarNegocio } from "@/actions/negocios/archivar-negocio";

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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-sm text-red-600 underline disabled:opacity-50"
      >
        Archivar
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
