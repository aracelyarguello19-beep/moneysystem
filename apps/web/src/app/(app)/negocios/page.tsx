import { getCurrentAccount } from "@/lib/auth";
import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { CrearNegocioForm } from "./crear-negocio-form";
import { ArchivarNegocioButton } from "./archivar-negocio-button";

export const dynamic = "force-dynamic";

export default async function NegociosPage() {
  const cuenta = await getCurrentAccount();
  const result = await listarNegocios();
  const negocios = result.ok ? result.data : [];

  return (
    <main className="flex flex-col gap-6 p-margin-mobile md:p-margin-desktop">
      <div>
        <h1 className="text-xl font-semibold">Negocios</h1>
        <p className="text-sm text-muted">Sesión iniciada como {cuenta?.email}.</p>
      </div>

      <CrearNegocioForm />

      {!result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {negocios.map((negocio) => (
          <li
            key={negocio.id}
            className="flex flex-col gap-2 rounded border border-default px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
          >
            <div className="min-w-0">
              <p className="break-words font-medium">{negocio.nombre}</p>
              <p className="text-xs text-muted">
                {negocio.estado} · {negocio.tipo}
              </p>
            </div>
            {negocio.estado === "ACTIVO" && (
              <ArchivarNegocioButton negocioId={negocio.id} />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
