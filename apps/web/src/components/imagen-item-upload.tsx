"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Sube la foto directo al bucket público "productos" de Supabase Storage
// (una carpeta por cuenta: `{cuentaId}/{uuid}.{ext}` — RLS de Storage exige
// que ese primer segmento sea `auth.uid()`) y devuelve la URL pública lista
// para guardar en `Item.imagenUrl`.
export function ImagenItemUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setSubiendo(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No hay sesión activa.");
      setSubiendo(false);
      return;
    }

    const extension = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("productos")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    setSubiendo(false);
    if (uploadError) {
      setError("No se pudo subir la imagen.");
      return;
    }

    const { data } = supabase.storage.from("productos").getPublicUrl(path);
    onChange(data.publicUrl);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL pública externa de Supabase Storage
        <img src={value} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded bg-neutral-bg" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        {/* `max-w-full`: el input de archivo nativo tiene un ancho intrínseco
            grande (botón + nombre del archivo) y desborda la fila en mobile. */}
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          disabled={subiendo}
          className="max-w-full text-xs"
          aria-label="Foto del producto"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-left text-xs text-danger underline"
          >
            Quitar foto
          </button>
        )}
        {subiendo && <p className="text-xs text-muted">Subiendo...</p>}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
