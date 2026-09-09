"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Mismo bucket público "productos" que `ImagenItemUpload` (RLS de Storage
// exige que el primer segmento del path sea `auth.uid()`, sin importar qué
// tipo de imagen sea) — `folder` solo separa logos de negocio y fotos de
// perfil dentro de la carpeta de cada cuenta, para no mezclarlas con fotos
// de producto.
export function ImagenUpload({
  value,
  onChange,
  folder,
  label,
  redondo = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  label: string;
  redondo?: boolean;
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
    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${extension}`;
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
        <img
          src={value}
          alt=""
          className={`h-12 w-12 shrink-0 object-cover ${redondo ? "rounded-full" : "rounded"}`}
        />
      ) : (
        <div className={`h-12 w-12 shrink-0 bg-neutral-bg ${redondo ? "rounded-full" : "rounded"}`} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <input
          type="file"
          accept="image/*"
          onChange={onFile}
          disabled={subiendo}
          className="max-w-full text-xs"
          aria-label={label}
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
